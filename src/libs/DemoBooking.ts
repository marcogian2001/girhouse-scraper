import { and, eq } from 'drizzle-orm';
import {
  conversationSchema,
  demoEventSchema,
  demoSchema,
  outboundEmailSchema,
} from '@/models/Schema';
import {
  createAppointment,
  getFreeSlots,
  getSlotMinutes,
  isGhlConfigured,
  isPipelineConfigured,
  upsertBookedOpportunity,
  upsertContact,
} from '@/services/GoHighLevel';
import { pickTwoSlots, upcomingDays } from '@/utils/Slots';
import type { Conversation } from './Conversations';
import { logEvent, setConversationState } from './Conversations';
import { db } from './DB';
import { getDemoPage } from './Demos';
import { scheduleNextAction } from './NextAction';

/** The calendar is read this far ahead; GHL itself only opens the next 7 days. */
const LOOKAHEAD_DAYS = 8;

/** Times starting sooner than this are not offered, so nobody is called within the hour. */
const MIN_NOTICE_MS = 2 * 3_600_000;

const SHOWN_DAYS = 5;

/**
 * The earliest start a lead may be offered or book now.
 * @returns Now plus the minimum notice.
 */
export const earliestBookable = () => new Date(Date.now() + MIN_NOTICE_MS);

/**
 * Reads the free call slots a demo or an email offers.
 * @returns The call length, the two suggested times and the bookable days, or null when booking is not configured.
 * @throws {Error} When GHL rejects the request.
 */
export const getDemoSlots = async () => {
  if (!isGhlConfigured()) {
    return null;
  }

  const now = new Date();
  const notBefore = earliestBookable();
  const days = await getFreeSlots({
    from: now,
    to: new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000),
  });

  return {
    durationMinutes: await getSlotMinutes(),
    suggested: pickTwoSlots({ days, notBefore }),
    days: upcomingDays({ days, notBefore, maxDays: SHOWN_DAYS }),
  };
};

/**
 * Moves a conversation to `call_booked` and cancels every email still scheduled, since
 * nothing else goes out once the call is on the calendar.
 * @param conversation The conversation as last read.
 */
export const markCallBooked = async (conversation: Conversation) => {
  await db
    .update(outboundEmailSchema)
    .set({ status: 'cancelled', errorMessage: 'call_booked' })
    .where(
      and(
        eq(outboundEmailSchema.conversationId, conversation.id),
        eq(outboundEmailSchema.status, 'scheduled'),
      ),
    );

  await setConversationState({ conversation, state: 'call_booked' });
  await scheduleNextAction(conversation.id, null);
};

/**
 * Puts the booked lead in the sales pipeline. The call is already on the calendar, so a
 * failure here is logged for a person rather than retried.
 * @param options The opportunity.
 * @param options.conversation The booked conversation.
 * @param options.contactId The GHL contact.
 * @param options.name The business name.
 * @returns The opportunity id, or null when the pipeline is not set or GHL refused it.
 */
const saveOpportunity = async (options: {
  conversation: Conversation;
  contactId: string;
  name: string;
}) => {
  if (!isPipelineConfigured()) {
    return null;
  }

  try {
    const opportunityId = await upsertBookedOpportunity({
      contactId: options.contactId,
      name: options.name,
    });

    await logEvent({
      conversationId: options.conversation.id,
      type: 'ghl_opportunity_saved',
      payload: { opportunityId },
    });

    return opportunityId;
  } catch (error) {
    await logEvent({
      conversationId: options.conversation.id,
      type: 'ghl_opportunity_failed',
      payload: { error: error instanceof Error ? error.message : String(error) },
    });

    return null;
  }
};

/**
 * Books a call for a lead, from the demo or from an email reply: the GHL contact, the
 * appointment and the opportunity, then the conversation moved to `call_booked` with
 * every pending email cancelled. Test conversations read the real calendar but never book.
 * @param options The booking.
 * @param options.conversation The conversation as last read.
 * @param options.company The business name, for the contact and the event title.
 * @param options.startTime The start time the lead picked, as GHL returned it.
 * @param options.source Where the lead picked it.
 * @returns The outcome.
 * @throws {Error} When GHL rejects the contact or the appointment.
 */
export const bookCall = async (options: {
  conversation: Conversation;
  company: string;
  startTime: string;
  source: 'demo' | 'email';
}) => {
  const { conversation } = options;

  if (!isGhlConfigured()) {
    return { status: 'unavailable' as const };
  }

  // The slot may have gone since it was offered
  const slots = await getDemoSlots();
  const isFree = slots?.days.some((day) => day.slots.includes(options.startTime));

  if (!slots || !isFree) {
    return { status: 'taken' as const };
  }

  if (conversation.isTest) {
    await logEvent({
      conversationId: conversation.id,
      type: 'test_skipped_ghl_booking',
      payload: { startTime: options.startTime, source: options.source },
    });
  } else {
    const contactId = await upsertContact({
      phone: conversation.phoneE164,
      email: conversation.leadEmail,
      name: options.company,
      companyName: options.company,
      tags: ['demo-girhouse'],
    });

    const appointmentId = await createAppointment({
      contactId,
      startTime: options.startTime,
      minutes: slots.durationMinutes,
      title: `Demo Call Girhouse - ${options.company}`,
    });

    await db
      .update(conversationSchema)
      .set({ ghlContactId: contactId })
      .where(eq(conversationSchema.id, conversation.id));

    const opportunityId = await saveOpportunity({ conversation, contactId, name: options.company });

    await logEvent({
      conversationId: conversation.id,
      type: 'call_booked',
      payload: {
        startTime: options.startTime,
        appointmentId,
        contactId,
        opportunityId,
        source: options.source,
      },
    });
  }

  await markCallBooked(conversation);

  return {
    status: 'booked' as const,
    startTime: options.startTime,
    minutes: slots.durationMinutes,
  };
};

/**
 * Books the call a lead picked on their demo, once they left their phone number.
 * @param options The booking.
 * @param options.slug The demo slug.
 * @param options.sessionId The visitor's random tab id.
 * @param options.startTime The start time the lead picked.
 * @returns The outcome.
 * @throws {Error} When GHL rejects the contact or the appointment.
 */
export const bookDemoCall = async (options: {
  slug: string;
  sessionId: string;
  startTime: string;
}) => {
  const page = await getDemoPage(options.slug);

  if (!page) {
    return { status: 'not_found' as const };
  }

  const { demo, conversation } = page;

  if (!conversation.phoneE164) {
    return { status: 'phone_missing' as const };
  }

  const outcome = await bookCall({
    conversation,
    company: demo.data.company,
    startTime: options.startTime,
    source: 'demo',
  });

  if (outcome.status === 'booked') {
    await db.insert(demoEventSchema).values({
      demoId: demo.id,
      sessionId: options.sessionId,
      type: 'booked',
    });

    await db.update(demoSchema).set({ bookedAt: new Date() }).where(eq(demoSchema.id, demo.id));
  }

  return outcome;
};
