import { and, eq } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import {
  conversationSchema,
  inboundMessageSchema,
  outboundEmailSchema,
  replyClassificationSchema,
} from '@/models/Schema';
import { isGhlConfigured } from '@/services/GoHighLevel';
import { ACTIVE_LEAD_STATUS, getCampaignLeadStatus } from '@/services/Instantly';
import { renderScarcity, replySubject } from '@/services/ReplyWriter';
import { addBusinessDays } from '@/utils/BusinessHours';
import type { FollowUpKind, NextAction } from '@/utils/FollowUps';
import { FOLLOW_UP_STATES, nextAction } from '@/utils/FollowUps';
import { buildOfferBrief } from '@/utils/Offer';
import { isItalianMobile } from '@/utils/Phone';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation } from './Conversations';
import { logEvent, setConversationState } from './Conversations';
import { loadThread } from './ConversationThread';
import { db } from './DB';
import { getDemoSlots } from './DemoBooking';
import { getConversationDemo } from './Demos';
import { completeJob } from './JobQueue';
import { loadLeadContext } from './LeadContext';
import { scheduleNextAction } from './NextAction';
import { enqueueSend, sendTimeFor, writeCheckedReply } from './OutboundEmails';
import { prepareWhatsapp } from './WhatsappHandoff';

type Job = typeof jobSchema.$inferSelect;

type AutomationSettings = Awaited<ReturnType<typeof getAutomationSettings>>;

type ConversationDemo = NonNullable<Awaited<ReturnType<typeof getConversationDemo>>>;

const tickPayloadSchema = z.object({ conversationId: z.uuid(), dueAt: z.string() });

/** The outbound kind each follow-up is stored as. */
const OUTBOUND_KIND: Record<FollowUpKind, 'follow_up' | 'closing' | 'nurturing'> = {
  demo_not_opened: 'follow_up',
  demo_partial: 'follow_up',
  demo_complete: 'follow_up',
  closing: 'closing',
  nurturing: 'nurturing',
  out_of_office_return: 'follow_up',
};

/**
 * Tells whether WhatsApp may take over after the closing email: the lead said yes,
 * got the demo, never booked and left a mobile number.
 * @param options The lead.
 * @param options.conversation The conversation.
 * @param options.demo The lead's demo.
 * @returns True when the lead qualifies for WhatsApp.
 */
const isWhatsappEligible = async (options: {
  conversation: Conversation;
  demo: ConversationDemo | null;
}) => {
  const { conversation } = options;

  if (!options.demo || options.demo.summary.booked || !conversation.phoneE164) {
    return false;
  }

  if (!isItalianMobile(conversation.phoneE164)) {
    return false;
  }

  const [interested] = await db
    .select({ id: replyClassificationSchema.id })
    .from(replyClassificationSchema)
    .innerJoin(
      inboundMessageSchema,
      eq(inboundMessageSchema.id, replyClassificationSchema.inboundMessageId),
    )
    .where(
      and(
        eq(inboundMessageSchema.conversationId, conversation.id),
        eq(replyClassificationSchema.category, 'interested'),
      ),
    )
    .limit(1);

  return Boolean(interested);
};

/**
 * Writes one follow-up and stores it: scheduled in automatic mode, a draft otherwise.
 * The next step is only planned once this email is sent.
 * @param options The follow-up.
 * @param options.conversation The conversation.
 * @param options.settings The organization's automation settings.
 * @param options.action The follow-up to write.
 * @param options.demo The lead's demo, for the link.
 * @throws {Error} When the AI answer does not parse, so the job retries.
 */
const writeFollowUp = async (options: {
  conversation: Conversation;
  settings: AutomationSettings;
  action: Extract<NextAction, { type: 'email' }>;
  demo: ConversationDemo | null;
}) => {
  const { conversation, settings, action } = options;
  const context = await loadThread(conversation.id);

  if (!context) {
    await scheduleNextAction(conversation.id, null);

    return;
  }

  const link =
    options.demo && (action.kind === 'demo_not_opened' || action.kind === 'demo_partial')
      ? `${options.demo.url}${action.step ? `?passo=${action.step}` : ''}`
      : null;
  const slots = action.kind === 'closing' && isGhlConfigured() ? await getDemoSlots() : null;
  const offeredSlots = slots?.suggested ?? [];
  const increaseOn = conversation.firstEmailSentAt
    ? new Date(conversation.firstEmailSentAt.getTime() + settings.priceIncreaseDays * 86_400_000)
    : null;

  const written = await writeCheckedReply(
    {
      model: settings.writingModel,
      offer: buildOfferBrief(settings),
      scarcity: renderScarcity({
        slots: settings.onboardingSlotsPerMonth,
        newPrice: settings.newMonthlyPrice,
        increaseOn,
        now: new Date(),
      }),
      category: 'interested',
      objection: null,
      lead: await loadLeadContext(conversation),
      thread: context.thread,
      reply: context.reply,
      call: null,
      followUp: action.kind,
      prices: [settings.monthlyPrice, settings.newMonthlyPrice],
      demoUrl: link,
      offeredSlots,
    },
    conversation,
  );

  const sendsItself = settings.enabled && settings.mode === 'auto' && written.issues.length === 0;

  const [created] = await db
    .insert(outboundEmailSchema)
    .values({
      conversationId: conversation.id,
      kind: OUTBOUND_KIND[action.kind],
      subject: replySubject(context.latest.subject, conversation.company ?? 'Girhouse'),
      body: written.body,
      issues: written.issues,
      offeredSlots,
      status: sendsItself ? 'scheduled' : 'draft',
      scheduledFor: sendsItself ? sendTimeFor(conversation, settings) : null,
      model: written.model,
    })
    .returning();

  // Nothing more is due until this email goes out
  await scheduleNextAction(conversation.id, null);

  if (!created) {
    return;
  }

  await logEvent({
    conversationId: conversation.id,
    type: sendsItself ? 'follow_up_scheduled' : 'follow_up_drafted',
    payload: { outboundEmailId: created.id, kind: action.kind, issues: created.issues },
  });

  if (sendsItself) {
    await enqueueSend(created);
  }
};

/**
 * Tells whether Instantly is still sending its sequence to a lead back from holiday, in
 * which case the sequence picks them up again and the platform writes nothing.
 * @param conversation The conversation.
 * @returns True when the lead is out of office and still active in their campaign.
 */
const isSequenceStillRunning = async (conversation: Conversation) => {
  if (
    conversation.state !== 'out_of_office' ||
    conversation.isTest ||
    !conversation.instantlyCampaignId
  ) {
    return false;
  }

  const status = await getCampaignLeadStatus({
    email: conversation.leadEmail,
    campaignId: conversation.instantlyCampaignId,
  });

  return status === ACTIVE_LEAD_STATUS;
};

/**
 * Runs the next step for a silent lead when it falls due: a follow-up tuned to the
 * demo, the closing email, a nurturing reminder, the hand-off to WhatsApp, or the end.
 * @param job The conversation_tick job being processed.
 */
const runConversationTickJob = async (job: Job) => {
  const { conversationId, dueAt } = tickPayloadSchema.parse(job.payload);

  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, conversationId),
  });

  // Moved, cleared or no longer in the sequence since this job was queued
  if (
    !conversation ||
    conversation.nextActionAt?.toISOString() !== dueAt ||
    !FOLLOW_UP_STATES.has(conversation.state)
  ) {
    await completeJob(job.id);

    return;
  }

  const settings = await getAutomationSettings(conversation.organizationId);

  if (!settings.enabled) {
    await logEvent({ conversationId, type: 'follow_up_held_kill_switch' });
    await scheduleNextAction(
      conversationId,
      addBusinessDays({
        from: new Date(),
        days: 1,
        hours: { startHour: settings.businessHourStart, endHour: settings.businessHourEnd },
      }),
    );
    await completeJob(job.id);

    return;
  }

  if (await isSequenceStillRunning(conversation)) {
    await logEvent({ conversationId, type: 'out_of_office_sequence_running' });
    await setConversationState({ conversation, state: 'replied' });
    await scheduleNextAction(conversationId, null);
    await completeJob(job.id);

    return;
  }

  const demo = await getConversationDemo(conversationId);
  const action = nextAction({
    state: conversation.state,
    followUpCount: conversation.followUpCount,
    nurturingCount: conversation.nurturingCount,
    demo: demo?.summary ?? null,
    maxFollowUps: settings.maxFollowUps,
    nurturingMaxCount: settings.nurturingMaxCount,
    whatsappEligible: await isWhatsappEligible({ conversation, demo }),
  });

  // Writers clear the due time only once their text is stored, so a failed attempt retries
  if (action.type === 'email') {
    await writeFollowUp({ conversation, settings, action, demo });
  } else if (action.type === 'whatsapp') {
    await prepareWhatsapp(conversation);
  } else {
    await scheduleNextAction(conversationId, null);
  }

  if (action.type === 'close') {
    await setConversationState({ conversation, state: 'closed_no_reply' });
  }

  await completeJob(job.id);
};

/**
 * Hands a follow-up the worker gave up on to a person.
 * @param job The abandoned conversation_tick job.
 * @param error The last error.
 */
export const markConversationTickAbandoned = async (job: Job, error: string) => {
  const parse = tickPayloadSchema.safeParse(job.payload);

  if (!parse.success) {
    return;
  }

  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, parse.data.conversationId),
  });

  if (!conversation) {
    return;
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'processing_failed',
    payload: { job: 'conversation_tick', error },
  });
  await setConversationState({ conversation, state: 'manual_review' });
};

/**
 * Runs a test conversation's next step now, so a simulation does not wait for days.
 * @param options The conversation.
 * @param options.organizationId The organization it must belong to.
 * @param options.conversationId The conversation.
 * @returns Whether a step was due and is now queued.
 */
export const runNextActionNow = async (options: {
  organizationId: string;
  conversationId: string;
}) => {
  const conversation = await db.query.conversationSchema.findFirst({
    where: and(
      eq(conversationSchema.id, options.conversationId),
      eq(conversationSchema.organizationId, options.organizationId),
    ),
  });

  if (!conversation?.isTest || !conversation.nextActionAt) {
    return false;
  }

  await scheduleNextAction(conversation.id, new Date());

  return true;
};

export const followUpJobHandlers = {
  conversation_tick: runConversationTickJob,
};
