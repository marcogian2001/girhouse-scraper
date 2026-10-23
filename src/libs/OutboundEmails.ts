import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import {
  conversationEventSchema,
  conversationSchema,
  emailSuppressionSchema,
  inboundMessageSchema,
  objectionSchema,
  outboundEmailSchema,
  replyClassificationSchema,
} from '@/models/Schema';
import { isGhlConfigured } from '@/services/GoHighLevel';
import { replyToEmail } from '@/services/Instantly';
import type { CallPlan, WriteReplyOptions } from '@/services/ReplyWriter';
import { renderScarcity, replySubject, writeReply } from '@/services/ReplyWriter';
import {
  addBusinessDays,
  fromItalianTime,
  scheduleRecontact,
  scheduleReplySend,
  toBusinessTime,
} from '@/utils/BusinessHours';
import { DEMO_STEPS } from '@/utils/DemoStats';
import { FOLLOW_UP_STATES } from '@/utils/FollowUps';
import { buildOfferBrief } from '@/utils/Offer';
import { checkReply, cleanReply, fillDemoLink, fillSlots } from '@/utils/ReplyGuard';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import { FINAL_STATES } from '@/utils/ReplyRouting';
import { stripQuotedReply } from '@/utils/ReplyText';
import { dayLabel, joinSlotLabels, matchSlot, slotKey, slotLabel } from '@/utils/Slots';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation } from './Conversations';
import { isBotManaged, logEvent, setConversationState } from './Conversations';
import { db } from './DB';
import { bookCall, earliestBookable, getDemoSlots } from './DemoBooking';
import { demoUrl, ensureDemo, getConversationDemo } from './Demos';
import { completeJob, enqueue } from './JobQueue';
import { loadLeadContext } from './LeadContext';
import { scheduleNextAction } from './NextAction';
import { recordCopywritingUsage } from './Usage';

type Job = typeof jobSchema.$inferSelect;

type OutboundEmail = typeof outboundEmailSchema.$inferSelect;

type AutomationSettings = Awaited<ReturnType<typeof getAutomationSettings>>;

type Classification = typeof replyClassificationSchema.$inferSelect;

const writePayloadSchema = z.object({ inboundMessageId: z.uuid() });

// `scheduledFor` is the send time the job was queued for; older jobs have none
const sendPayloadSchema = z.object({
  outboundEmailId: z.uuid(),
  scheduledFor: z.string().optional(),
});

/** States a conversation leaves for `demo_sent` once its demo link is out. */
const DEMO_SENT_FROM = new Set<Conversation['state']>(['replied', 'classified', 'manual_review']);

/** Rules a person cannot approve past: the email would go out broken. */
const BLOCKING_ISSUES = new Set(['demo_link_missing', 'slots_missing', 'link']);

/** Emails written to a lead who went silent, rather than in answer to a reply. */
const FOLLOW_UP_KINDS = new Set<OutboundEmail['kind']>(['follow_up', 'closing', 'nurturing']);

/** Replies that can pick a call time. */
const BOOKING_CATEGORIES = new Set<ReplyCategory>(['interested', 'question']);

const bookedPayloadSchema = z.object({ startTime: z.string() });

/**
 * Picks when an email leaves. An answer leaves the configured delay after the lead's
 * reply, at once if that time has passed; other emails count the delay from now. Test
 * conversations send at once, so a simulation does not wait for business hours.
 * @param options The email.
 * @param options.conversation The conversation the email belongs to.
 * @param options.settings The organization's automation settings.
 * @param options.repliedAt When the reply it answers arrived, for an answer.
 * @returns The send time.
 */
export const sendTimeFor = (options: {
  conversation: Conversation;
  settings: AutomationSettings;
  repliedAt?: Date;
}) => {
  const now = new Date();

  if (options.conversation.isTest) {
    return now;
  }

  return scheduleReplySend({
    repliedAt: options.repliedAt ?? now,
    now,
    hours: {
      startHour: options.settings.businessHourStart,
      endHour: options.settings.businessHourEnd,
    },
    minDelayMinutes: options.settings.replyDelayMinMinutes,
    maxDelayMinutes: options.settings.replyDelayMaxMinutes,
  });
};

/**
 * Queues the send of a scheduled email at its send time.
 * @param email The scheduled email.
 */
export const enqueueSend = async (email: OutboundEmail) => {
  await enqueue([
    {
      type: 'reply_send',
      payload: { outboundEmailId: email.id, scheduledFor: email.scheduledFor?.toISOString() },
      runAfter: email.scheduledFor ?? new Date(),
    },
  ]);
};

/**
 * Reads the Italian calendar day of an instant.
 * @param date The instant.
 * @returns The day, such as 2026-10-26.
 */
const italianDay = (date: Date) => slotKey(date.toISOString()).slice(0, 10);

/**
 * Names the day an answer leaves when that is after today: the lead asked to be
 * contacted again then, so the answer is written as that contact.
 * @param sendAt When the answer leaves, if known.
 * @returns A label such as "lunedì 26 ottobre", or undefined for an answer leaving today.
 */
const recontactDay = (sendAt: Date | null) =>
  sendAt && italianDay(sendAt) > italianDay(new Date()) ? dayLabel(sendAt) : undefined;

/**
 * Reads the send time a person chose in the dashboard.
 * @param value The time in Italian time, null to send as soon as possible, undefined when not given.
 * @param current The email's own send time, kept when nothing was given.
 * @returns The send time, or null for as soon as possible.
 */
const chosenSendTime = (value: string | null | undefined, current: Date | null) => {
  if (value === undefined) {
    return current;
  }

  return value ? fromItalianTime(value) : null;
};

/**
 * Writes the body, cleans it and checks it, retrying once with the broken rules as feedback.
 * Every attempt is billed, whether or not it is kept.
 * @param options The writer inputs, without the feedback.
 * @param conversation The conversation the calls are billed to.
 * @returns The body, the rules it still breaks and the model that wrote it.
 * @throws {Error} When no attempt returns a parsable answer, so the job retries.
 */
export const writeCheckedReply = async (
  options: Omit<WriteReplyOptions, 'issues'> & {
    prices: number[];
    demoUrl: string | null;
    offeredSlots: string[];
  },
  conversation: Conversation,
) => {
  const { prices, demoUrl: link, offeredSlots, ...writerOptions } = options;
  const allowedLinks = link ? [link] : [];
  const slotWords = joinSlotLabels(offeredSlots);

  /**
   * Fills the demo link and the call times, then checks the rules, flagging an interested
   * reply that left the link or the times out.
   * @param draft The cleaned body.
   * @returns The body to keep and the rules it breaks.
   */
  const review = (draft: string) => {
    const linked = link ? fillDemoLink(draft, link) : draft;
    const body = slotWords ? fillSlots(linked, slotWords) : linked;
    const issues = checkReply({ body, prices, allowedLinks });

    // A follow-up gets a link only when it must carry one
    if (link && (options.followUp || options.category === 'interested') && !body.includes(link)) {
      issues.push('demo_link_missing');
    }

    if (slotWords && !body.includes(slotWords)) {
      issues.push('slots_missing');
    }

    return { body, issues };
  };

  let reviewed: ReturnType<typeof review> | null = null;
  let { model } = options;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const written = await writeReply({
      ...writerOptions,
      issues: reviewed?.issues ?? [],
    });

    // oxlint-disable-next-line no-await-in-loop
    await recordCopywritingUsage({
      userId: conversation.userId,
      organizationId: conversation.organizationId,
      campaignId: conversation.campaignId,
      sequence: written.call,
    });

    ({ model } = written.call);

    if (written.body) {
      reviewed = review(cleanReply(written.body));

      // Without a demo the placeholder is expected, and no rewrite would fix it
      if (reviewed.issues.every((issue) => !link && issue === 'demo_link_missing')) {
        break;
      }
    }
  }

  if (!reviewed) {
    throw new Error(`${model} returned no parsable reply for conversation ${conversation.id}`);
  }

  return { ...reviewed, model };
};

/**
 * Reads when the conversation's call was booked for.
 * @param conversationId The conversation.
 * @returns The ISO start time, or null when no booking is logged.
 */
const findBookedStart = async (conversationId: string) => {
  const [event] = await db
    .select({ payload: conversationEventSchema.payload })
    .from(conversationEventSchema)
    .where(
      and(
        eq(conversationEventSchema.conversationId, conversationId),
        inArray(conversationEventSchema.type, ['call_booked', 'test_skipped_ghl_booking']),
      ),
    )
    .orderBy(desc(conversationEventSchema.createdAt))
    .limit(1);
  const parse = bookedPayloadSchema.safeParse(event?.payload);

  return parse.success ? parse.data.startTime : null;
};

type CallDecision = { call: CallPlan | null; offeredSlots: string[] };

const NO_CALL: CallDecision = { call: null, offeredSlots: [] };

/**
 * Books the time a lead asked for, or offers the two free times when it is gone.
 * @param options The request.
 * @param options.conversation The conversation, as read for this job.
 * @param options.wanted The time the classifier read, as YYYY-MM-DDTHH:mm in Italian time.
 * @param options.slots The calendar as just read.
 * @returns The confirmation plan, or the other times to offer.
 * @throws {Error} When GHL rejects the booking, so the job retries.
 */
const bookWantedTime = async (options: {
  conversation: Conversation;
  wanted: string;
  slots: NonNullable<Awaited<ReturnType<typeof getDemoSlots>>>;
}): Promise<CallDecision> => {
  const { conversation } = options;
  const startTime = matchSlot({
    days: options.slots.days,
    wanted: options.wanted,
    notBefore: earliestBookable(),
  });
  const outcome = startTime
    ? await bookCall({
        conversation,
        company: conversation.company ?? conversation.leadEmail,
        startTime,
        source: 'email',
      })
    : null;

  if (outcome?.status === 'booked') {
    return { call: { kind: 'booked', when: slotLabel(outcome.startTime) }, offeredSlots: [] };
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'booking_slot_taken',
    payload: { wanted: options.wanted },
  });

  return { call: { kind: 'taken' }, offeredSlots: options.slots.suggested };
};

/**
 * Decides what a reply does about the call: books the time the lead picked, or offers
 * other times when the asked one is gone. The demo page proposes the call itself, so a
 * reply that only sends it offers no times.
 * @param options The reply.
 * @param options.conversation The conversation, as read for this job.
 * @param options.classification The reply's classification.
 * @returns The call plan for the writer and the times the email offers.
 * @throws {Error} When GHL rejects the calendar or the booking, so the job retries.
 */
const planCall = async (options: {
  conversation: Conversation;
  classification: Classification;
}): Promise<CallDecision> => {
  const { conversation, classification } = options;
  const canBook = BOOKING_CATEGORIES.has(classification.category);
  const wanted = canBook ? classification.chosenSlot : null;

  if (!isGhlConfigured() || !wanted) {
    return NO_CALL;
  }

  // A retry after the booking went through confirms it rather than booking again
  const bookedStart =
    canBook && conversation.state === 'call_booked' ? await findBookedStart(conversation.id) : null;

  if (bookedStart) {
    return { call: { kind: 'booked', when: slotLabel(bookedStart) }, offeredSlots: [] };
  }

  const slots = await getDemoSlots();

  if (!slots) {
    return NO_CALL;
  }

  return await bookWantedTime({ conversation, wanted, slots });
};

/**
 * Gathers what the writer needs to answer a classified reply.
 * @param options The reply.
 * @param options.conversation The conversation.
 * @param options.message The reply being answered.
 * @param options.classification The reply's classification.
 * @param options.settings The organization's automation settings.
 * @param options.call What the answer does about the call.
 * @param options.offeredSlots The call times the answer offers.
 * @param options.demoUrl The demo link the answer carries, if any.
 * @param options.recontactOn The later day the answer leaves, when the lead asked for it.
 * @returns The writer inputs.
 */
const replyWriterInput = async (options: {
  conversation: Conversation;
  message: typeof inboundMessageSchema.$inferSelect;
  classification: Classification;
  settings: AutomationSettings;
  call: CallPlan | null;
  offeredSlots: string[];
  demoUrl: string | null;
  recontactOn?: string;
}) => {
  const { message, settings, classification } = options;
  const objection = classification.objectionId
    ? await db.query.objectionSchema.findFirst({
        where: eq(objectionSchema.id, classification.objectionId),
      })
    : undefined;

  return {
    model: settings.writingModel,
    offer: buildOfferBrief(settings),
    scarcity: renderScarcity(settings.onboardingSlotsPerMonth),
    category: classification.category,
    objection: objection ?? null,
    lead: await loadLeadContext(options.conversation),
    thread: (message.thread ?? []).map((item) => ({
      ...item,
      sentAt: item.sentAt ? new Date(item.sentAt) : null,
    })),
    reply: stripQuotedReply(message.bodyText) || message.bodyText,
    call: options.call,
    prices: [settings.monthlyPrice],
    demoUrl: options.demoUrl,
    offeredSlots: options.offeredSlots,
    recontactOn: options.recontactOn,
  };
};

/**
 * Stores a written reply: scheduled when it may go out on its own, a draft otherwise.
 * A booking confirmation may go out on its own even though the conversation moved on.
 * @param options The reply.
 * @param options.conversation The conversation, as read for this job.
 * @param options.message The reply being answered.
 * @param options.settings The organization's automation settings.
 * @param options.written The checked body, its issues and model.
 * @param options.offeredSlots The call times the email offers.
 * @param options.isBooked Whether the email confirms a booked call.
 * @param options.sendAt When the lead asked to be contacted again, if they did: the send
 * time in automatic mode, the proposed one on a draft.
 */
const saveWrittenReply = async (options: {
  conversation: Conversation;
  message: typeof inboundMessageSchema.$inferSelect;
  settings: AutomationSettings;
  written: Awaited<ReturnType<typeof writeCheckedReply>>;
  offeredSlots: string[];
  isBooked: boolean;
  sendAt: Date | null;
}) => {
  const { conversation, settings, written } = options;
  const sendsItself =
    settings.enabled &&
    settings.mode === 'auto' &&
    (conversation.state === 'classified' || options.isBooked) &&
    written.issues.length === 0;

  const [created] = await db
    .insert(outboundEmailSchema)
    .values({
      conversationId: conversation.id,
      inboundMessageId: options.message.id,
      kind: options.isBooked ? 'booking_confirmation' : 'reply',
      subject: replySubject(options.message.subject, conversation.company ?? 'Girhouse'),
      body: written.body,
      issues: written.issues,
      offeredSlots: options.offeredSlots,
      status: sendsItself ? 'scheduled' : 'draft',
      scheduledFor: sendsItself
        ? (options.sendAt ??
          sendTimeFor({ conversation, settings, repliedAt: options.message.receivedAt }))
        : options.sendAt,
      model: written.model,
    })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    return;
  }

  await logEvent({
    conversationId: conversation.id,
    type: sendsItself ? 'reply_scheduled' : 'reply_drafted',
    payload: {
      outboundEmailId: created.id,
      issues: created.issues,
      scheduledFor: created.scheduledFor,
    },
  });

  if (sendsItself) {
    await enqueueSend(created);
  }
};

/**
 * Writes the answer to a classified reply. It is sent on its own only in automatic
 * mode, for a confident classification and an answer that breaks no rule.
 * @param job The reply_write job being processed.
 */
const runReplyWriteJob = async (job: Job) => {
  const { inboundMessageId } = writePayloadSchema.parse(job.payload);

  const [row] = await db
    .select({
      message: inboundMessageSchema,
      conversation: conversationSchema,
      classification: replyClassificationSchema,
      existing: outboundEmailSchema.id,
    })
    .from(inboundMessageSchema)
    .innerJoin(conversationSchema, eq(conversationSchema.id, inboundMessageSchema.conversationId))
    .innerJoin(
      replyClassificationSchema,
      eq(replyClassificationSchema.inboundMessageId, inboundMessageSchema.id),
    )
    .leftJoin(
      outboundEmailSchema,
      eq(outboundEmailSchema.inboundMessageId, inboundMessageSchema.id),
    )
    .where(eq(inboundMessageSchema.id, inboundMessageId));

  if (!row || row.existing || FINAL_STATES.has(row.conversation.state)) {
    await completeJob(job.id);

    return;
  }

  const { message, conversation, classification } = row;
  const settings = await getAutomationSettings(conversation.organizationId);
  const sendAt = scheduleRecontact({
    value: classification.recontactAt,
    now: new Date(),
    hours: { startHour: settings.businessHourStart, endHour: settings.businessHourEnd },
  });
  const { call, offeredSlots } = await planCall({ conversation, classification });
  const isBooked = call?.kind === 'booked';

  // An interested lead gets the link to their demo, built here on first use; a booking or a
  // taken time is answered about the call alone
  const demo =
    classification.category === 'interested' && call?.kind !== 'booked' && call?.kind !== 'taken'
      ? await ensureDemo(conversation)
      : null;

  const written = await writeCheckedReply(
    await replyWriterInput({
      conversation,
      message,
      classification,
      settings,
      call,
      offeredSlots,
      demoUrl: demo ? demoUrl(demo.slug) : null,
      recontactOn: isBooked ? undefined : recontactDay(sendAt),
    }),
    conversation,
  );

  await saveWrittenReply({
    conversation,
    message,
    settings,
    written,
    offeredSlots,
    isBooked,
    sendAt: isBooked ? null : sendAt,
  });

  await completeJob(job.id);
};

/**
 * Reads an email of the organization with its conversation.
 * @param options The call options.
 * @param options.organizationId The organization it must belong to.
 * @param options.outboundEmailId The email to read.
 * @returns The email and conversation, or undefined when it is not the organization's.
 */
const findOutbound = async (options: { organizationId: string; outboundEmailId: string }) => {
  const [row] = await db
    .select({ email: outboundEmailSchema, conversation: conversationSchema })
    .from(outboundEmailSchema)
    .innerJoin(conversationSchema, eq(conversationSchema.id, outboundEmailSchema.conversationId))
    .where(
      and(
        eq(outboundEmailSchema.id, options.outboundEmailId),
        eq(conversationSchema.organizationId, options.organizationId),
      ),
    );

  return row;
};

/**
 * Writes a draft answer again with the current instructions, keeping it a draft. A reply
 * that picked a call time is left alone, since writing it again would book again.
 * @param options The call options.
 * @param options.organizationId The organization the draft must belong to.
 * @param options.userId The person asking, recorded in the log.
 * @param options.outboundEmailId The draft.
 * @param options.scheduledFor The send time chosen in the dashboard, in Italian time, or null
 * to send as soon as possible; the draft's own proposal when omitted.
 * @returns The rewritten draft, or null when it is not a draft answer that can be rewritten.
 * @throws {Error} When the writer returns nothing usable.
 */
export const rewriteOutbound = async (options: {
  organizationId: string;
  userId: string;
  outboundEmailId: string;
  scheduledFor?: string | null;
}) => {
  const row = await findOutbound(options);
  const message = row?.email.inboundMessageId
    ? await db.query.inboundMessageSchema.findFirst({
        where: eq(inboundMessageSchema.id, row.email.inboundMessageId),
      })
    : undefined;
  const classification = message
    ? await db.query.replyClassificationSchema.findFirst({
        where: eq(replyClassificationSchema.inboundMessageId, message.id),
      })
    : undefined;

  if (
    !row ||
    !message ||
    !classification ||
    classification.chosenSlot ||
    row.email.kind !== 'reply' ||
    row.email.status !== 'draft'
  ) {
    return null;
  }

  const { conversation } = row;
  const settings = await getAutomationSettings(conversation.organizationId);
  const demo =
    classification.category === 'interested' ? await getConversationDemo(conversation.id) : null;
  const sendAt = chosenSendTime(options.scheduledFor, row.email.scheduledFor);
  const recontactOn = recontactDay(sendAt);

  const written = await writeCheckedReply(
    await replyWriterInput({
      conversation,
      message,
      classification,
      settings,
      call: null,
      offeredSlots: [],
      demoUrl: demo?.url ?? null,
      recontactOn,
    }),
    conversation,
  );

  const [updated] = await db
    .update(outboundEmailSchema)
    .set({
      body: written.body,
      issues: written.issues,
      offeredSlots: [],
      model: written.model,
      scheduledFor: sendAt,
    })
    .where(and(eq(outboundEmailSchema.id, row.email.id), eq(outboundEmailSchema.status, 'draft')))
    .returning();

  if (updated) {
    await logEvent({
      conversationId: conversation.id,
      type: 'reply_rewritten',
      actorUserId: options.userId,
      payload: { outboundEmailId: updated.id, issues: updated.issues },
    });
  }

  return updated ?? null;
};

/** Emails a person may approve, or approve again to change their text or send time. */
const APPROVABLE_STATUSES = new Set<OutboundEmail['status']>(['draft', 'failed', 'scheduled']);

/**
 * Approves a draft, as edited by a person, and schedules it. A scheduled email can be
 * approved again, to change its text or its send time.
 * @param options The call options.
 * @param options.organizationId The organization the draft must belong to.
 * @param options.userId The person approving, recorded on the email and in the log.
 * @param options.outboundEmailId The draft.
 * @param options.subject The subject to send.
 * @param options.body The body to send.
 * @param options.scheduledFor When to send it, in Italian time; as soon as possible when
 * missing or past.
 * @returns The outcome: scheduled, or why the draft cannot go out.
 */
export const approveOutbound = async (options: {
  organizationId: string;
  userId: string;
  outboundEmailId: string;
  subject: string;
  body: string;
  scheduledFor?: string | null;
}) => {
  const row = await findOutbound(options);

  if (!row) {
    return { status: 'not_found' as const };
  }

  if (!APPROVABLE_STATUSES.has(row.email.status)) {
    return { status: 'not_draft' as const };
  }

  const settings = await getAutomationSettings(options.organizationId);

  if (!settings.enabled) {
    return { status: 'disabled' as const };
  }

  // The delay runs from the lead's reply, so an answer approved late leaves at once
  const answered = row.email.inboundMessageId
    ? await db.query.inboundMessageSchema.findFirst({
        where: eq(inboundMessageSchema.id, row.email.inboundMessageId),
      })
    : undefined;

  // Drafts written before the demo existed get its link now
  const demo = await getConversationDemo(row.conversation.id);
  const cleaned = cleanReply(options.body);
  const body = demo ? fillDemoLink(cleaned, demo.url) : cleaned;
  const issues = checkReply({
    body,
    prices: [settings.monthlyPrice],
    // A follow-up may point to the step the lead stopped at
    allowedLinks: demo
      ? [
          demo.url,
          ...Array.from(
            { length: DEMO_STEPS },
            (_unused, index) => `${demo.url}?passo=${index + 1}`,
          ),
        ]
      : [],
  });

  if (issues.some((issue) => BLOCKING_ISSUES.has(issue))) {
    return { status: 'blocked' as const, issues };
  }

  // A time a person picked is kept as is, even outside business hours
  const chosen = chosenSendTime(options.scheduledFor, null);
  const scheduledFor =
    chosen && chosen > new Date()
      ? chosen
      : sendTimeFor({
          conversation: row.conversation,
          settings,
          repliedAt: answered?.receivedAt,
        });

  const [scheduled] = await db
    .update(outboundEmailSchema)
    .set({
      subject: options.subject,
      body,
      // A person approved past the remaining issues; they stay on record
      issues,
      status: 'scheduled',
      scheduledFor,
      approvedByUserId: options.userId,
      errorMessage: null,
    })
    .where(eq(outboundEmailSchema.id, row.email.id))
    .returning();

  if (!scheduled) {
    return { status: 'not_found' as const };
  }

  // An email approved again for the same time keeps its job, so it never goes out twice
  if (
    row.email.status !== 'scheduled' ||
    row.email.scheduledFor?.getTime() !== scheduled.scheduledFor?.getTime()
  ) {
    await enqueueSend(scheduled);
  }
  await logEvent({
    conversationId: row.conversation.id,
    type: 'reply_approved',
    payload: { outboundEmailId: scheduled.id, scheduledFor: scheduled.scheduledFor },
    actorUserId: options.userId,
  });

  return { status: 'scheduled' as const, email: scheduled };
};

/**
 * Discards a draft or a scheduled email before it leaves.
 * @param options The call options.
 * @param options.organizationId The organization the email must belong to.
 * @param options.userId The person discarding it, recorded in the log.
 * @param options.outboundEmailId The email.
 * @returns Whether it was discarded.
 */
export const discardOutbound = async (options: {
  organizationId: string;
  userId: string;
  outboundEmailId: string;
}) => {
  const row = await findOutbound(options);

  if (!row || row.email.status === 'sent' || row.email.status === 'cancelled') {
    return false;
  }

  await db
    .update(outboundEmailSchema)
    .set({ status: 'cancelled' })
    .where(eq(outboundEmailSchema.id, row.email.id));

  await logEvent({
    conversationId: row.conversation.id,
    type: 'reply_discarded',
    payload: { outboundEmailId: row.email.id },
    actorUserId: options.userId,
  });

  return true;
};

/**
 * Finds why a scheduled email must not leave any more.
 * @param options The check inputs.
 * @param options.email The scheduled email.
 * @param options.conversation Its conversation, as it stands now.
 * @returns The reason to cancel it, or null when it can go.
 */
const findCancelReason = async (options: { email: OutboundEmail; conversation: Conversation }) => {
  const { conversation } = options;

  // Once the call is booked only its confirmation still goes out
  if (
    FINAL_STATES.has(conversation.state) ||
    (conversation.state === 'call_booked' && options.email.kind !== 'booking_confirmation')
  ) {
    return conversation.state;
  }

  // The campaign was handed to the sales reps after this email was written
  if (!(await isBotManaged(conversation))) {
    return 'campaign_unmanaged';
  }

  // A follow-up only makes sense while the lead is still in the sequence
  if (FOLLOW_UP_KINDS.has(options.email.kind) && !FOLLOW_UP_STATES.has(conversation.state)) {
    return conversation.state;
  }

  const suppressed = await db.query.emailSuppressionSchema.findFirst({
    where: and(
      eq(emailSuppressionSchema.organizationId, conversation.organizationId),
      eq(emailSuppressionSchema.email, conversation.leadEmail),
    ),
  });

  if (suppressed) {
    return 'suppressed';
  }

  const answered = options.email.inboundMessageId
    ? await db.query.inboundMessageSchema.findFirst({
        where: eq(inboundMessageSchema.id, options.email.inboundMessageId),
      })
    : undefined;

  // The lead wrote again since the reply this answers, or since a follow-up was written
  const since = answered?.receivedAt ?? options.email.createdAt;
  const newer = await db.query.inboundMessageSchema.findFirst({
    where: and(
      eq(inboundMessageSchema.conversationId, conversation.id),
      gt(inboundMessageSchema.receivedAt, since),
    ),
  });

  return newer ? 'newer_reply' : null;
};

/**
 * Finds the lead's latest email Instantly knows, for a follow-up to answer.
 * @param conversationId The conversation.
 * @returns The Instantly email id, or null when no reply was matched to Instantly.
 */
const findLatestInstantlyEmailId = async (conversationId: string) => {
  const [latest] = await db
    .select({ id: inboundMessageSchema.instantlyEmailId })
    .from(inboundMessageSchema)
    .where(
      and(
        eq(inboundMessageSchema.conversationId, conversationId),
        isNotNull(inboundMessageSchema.instantlyEmailId),
      ),
    )
    .orderBy(desc(inboundMessageSchema.receivedAt))
    .limit(1);

  return latest?.id ?? null;
};

/**
 * Moves the conversation on once an email is out: counts the follow-up, sets the state
 * and schedules the next step for a lead who stays silent.
 * @param options The sent email.
 * @param options.email The email.
 * @param options.conversation Its conversation, as read before sending.
 * @param options.category The category of the reply it answers, if any.
 * @param options.objectionId The objection of the reply it answers, if any.
 * @param options.settings The organization's automation settings.
 * @param options.sentAt When it left.
 */
const afterSend = async (options: {
  email: OutboundEmail;
  conversation: Conversation;
  category: ReplyCategory | null;
  objectionId: string | null;
  settings: AutomationSettings;
  sentAt: Date;
}) => {
  const { email, conversation, settings } = options;
  const hours = { startHour: settings.businessHourStart, endHour: settings.businessHourEnd };
  const followUpAt = addBusinessDays({
    from: options.sentAt,
    days: settings.demoNotOpenedBusinessDays,
    hours,
  });
  const nurturingAt = toBusinessTime(
    new Date(options.sentAt.getTime() + settings.nurturingIntervalDays * 86_400_000),
    hours,
  );

  // The email to a lead back from holiday picks the thread up; their answer decides the rest
  if (conversation.state === 'out_of_office') {
    await setConversationState({ conversation, state: 'replied' });
    await scheduleNextAction(conversation.id, null);

    return;
  }

  if (FOLLOW_UP_KINDS.has(email.kind)) {
    const isNurturing = email.kind === 'nurturing';

    await db
      .update(conversationSchema)
      .set(
        isNurturing
          ? { nurturingCount: sql`${conversationSchema.nurturingCount} + 1` }
          : { followUpCount: sql`${conversationSchema.followUpCount} + 1` },
      )
      .where(eq(conversationSchema.id, conversation.id));

    if (!isNurturing) {
      await setConversationState({ conversation, state: 'follow_up' });
    }

    // After the closing email the next step is WhatsApp, after its own wait
    const whatsappAt = addBusinessDays({
      from: options.sentAt,
      days: settings.whatsappAfterBusinessDays,
      hours,
    });
    const nextAt = email.kind === 'closing' ? whatsappAt : followUpAt;

    await scheduleNextAction(conversation.id, isNurturing ? nurturingAt : nextAt);

    return;
  }

  const demo = await getConversationDemo(conversation.id);

  // The demo is out: the follow-ups start counting from here
  if (demo && email.body.includes(demo.url) && DEMO_SENT_FROM.has(conversation.state)) {
    await setConversationState({ conversation, state: 'demo_sent' });
    await scheduleNextAction(conversation.id, followUpAt);
  }

  // A "not now" moves to nurturing; a thanked wrong person is done
  if (options.category === 'not_now') {
    await setConversationState({ conversation, state: 'nurturing' });
    await scheduleNextAction(conversation.id, nurturingAt);
  }

  if (options.category === 'wrong_person') {
    await setConversationState({ conversation, state: 'wrong_person' });
  }

  // Some objections get one answer and nothing more, such as a tone that does not fit
  const objection = options.objectionId
    ? await db.query.objectionSchema.findFirst({
        where: eq(objectionSchema.id, options.objectionId),
      })
    : undefined;

  if (objection?.closesConversation) {
    await setConversationState({ conversation, state: 'closed_not_interested' });
  }
};

/**
 * Sends a scheduled email in the lead's Instantly thread, after checking it still should go.
 * @param job The reply_send job being processed.
 */
const runReplySendJob = async (job: Job) => {
  const { outboundEmailId, scheduledFor } = sendPayloadSchema.parse(job.payload);

  const [row] = await db
    .select({
      email: outboundEmailSchema,
      conversation: conversationSchema,
      answered: inboundMessageSchema,
      category: replyClassificationSchema.category,
      objectionId: replyClassificationSchema.objectionId,
    })
    .from(outboundEmailSchema)
    .innerJoin(conversationSchema, eq(conversationSchema.id, outboundEmailSchema.conversationId))
    .leftJoin(
      inboundMessageSchema,
      eq(inboundMessageSchema.id, outboundEmailSchema.inboundMessageId),
    )
    .leftJoin(
      replyClassificationSchema,
      eq(replyClassificationSchema.inboundMessageId, outboundEmailSchema.inboundMessageId),
    )
    .where(eq(outboundEmailSchema.id, outboundEmailId));

  // Approved again, discarded, already sent or moved to another time since this job was queued
  if (
    !row ||
    row.email.status !== 'scheduled' ||
    (scheduledFor !== undefined && row.email.scheduledFor?.toISOString() !== scheduledFor)
  ) {
    await completeJob(job.id);

    return;
  }

  const { email, conversation } = row;
  const settings = await getAutomationSettings(conversation.organizationId);

  if (!settings.enabled) {
    await db
      .update(outboundEmailSchema)
      .set({ status: 'draft', errorMessage: 'kill_switch' })
      .where(eq(outboundEmailSchema.id, email.id));
    await logEvent({
      conversationId: conversation.id,
      type: 'reply_held_kill_switch',
      payload: { outboundEmailId: email.id },
    });
    await completeJob(job.id);

    return;
  }

  const cancelReason = await findCancelReason({ email, conversation });

  if (cancelReason) {
    await db
      .update(outboundEmailSchema)
      .set({ status: 'cancelled', errorMessage: cancelReason })
      .where(eq(outboundEmailSchema.id, email.id));
    await logEvent({
      conversationId: conversation.id,
      type: 'reply_cancelled',
      payload: { outboundEmailId: email.id, reason: cancelReason },
    });
    await completeJob(job.id);

    return;
  }

  let instantlyEmailId: string | null = null;

  if (conversation.isTest) {
    await logEvent({
      conversationId: conversation.id,
      type: 'test_skipped_instantly_send',
      payload: { outboundEmailId: email.id },
    });
  } else {
    // A follow-up answers the lead's latest email, keeping the thread together
    const replyToEmailId =
      row.answered?.instantlyEmailId ?? (await findLatestInstantlyEmailId(conversation.id));

    if (!conversation.eaccount || !replyToEmailId) {
      throw new Error(`Email ${email.id} has no mailbox or Instantly email to reply to`);
    }

    instantlyEmailId = await replyToEmail({
      eaccount: conversation.eaccount,
      replyToEmailId,
      subject: email.subject,
      body: email.body,
    });
  }

  const sentAt = new Date();

  await db
    .update(outboundEmailSchema)
    .set({ status: 'sent', sentAt, instantlyEmailId, errorMessage: null })
    .where(eq(outboundEmailSchema.id, email.id));

  await db
    .update(conversationSchema)
    .set({ lastOutboundAt: sentAt })
    .where(eq(conversationSchema.id, conversation.id));

  await logEvent({
    conversationId: conversation.id,
    type: 'reply_sent',
    payload: { outboundEmailId: email.id, instantlyEmailId },
  });

  await afterSend({
    email,
    conversation,
    category: row.category,
    objectionId: row.objectionId,
    settings,
    sentAt,
  });

  await completeJob(job.id);
};

/**
 * Records a send the worker gave up on, so the email can be approved again.
 * @param job The abandoned reply_send job.
 * @param error The last error.
 */
export const markReplySendAbandoned = async (job: Job, error: string) => {
  const parse = sendPayloadSchema.safeParse(job.payload);

  if (!parse.success) {
    return;
  }

  const [failed] = await db
    .update(outboundEmailSchema)
    .set({ status: 'failed', errorMessage: error })
    .where(eq(outboundEmailSchema.id, parse.data.outboundEmailId))
    .returning();

  if (failed) {
    await logEvent({
      conversationId: failed.conversationId,
      type: 'processing_failed',
      payload: { outboundEmailId: failed.id, error },
    });
  }
};

export const outboundJobHandlers = {
  reply_write: runReplyWriteJob,
  reply_send: runReplySendJob,
};
