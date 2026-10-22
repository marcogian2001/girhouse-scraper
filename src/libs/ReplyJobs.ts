import { and, asc, desc, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import {
  conversationSchema,
  inboundMessageSchema,
  objectionSchema,
  outboundEmailSchema,
  replyClassificationSchema,
  whatsappHandoffSchema,
} from '@/models/Schema';
import type { InstantlyEmail } from '@/services/Instantly';
import {
  emailText,
  emailTimestamp,
  findManualReply,
  findReplyThread,
  firstCampaignEmailAt,
  listLeadEmails,
  toInterestLabel,
} from '@/services/Instantly';
import { classifyReply } from '@/services/ReplyClassifier';
import type { ThreadMessage } from '@/services/ReplyPrompt';
import { addBusinessDays } from '@/utils/BusinessHours';
import { buildOfferBrief } from '@/utils/Offer';
import { toE164 } from '@/utils/Phone';
import {
  CATEGORY_FROM_CLASSIFIER,
  decideState,
  FINAL_STATES,
  needsAnswer,
  parseReturnDate,
} from '@/utils/ReplyRouting';
import { stripQuotedReply } from '@/utils/ReplyText';
import { slotKey, slotLabel } from '@/utils/Slots';
import { isStopRequest } from '@/utils/StopGuard';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation, EventType } from './Conversations';
import { applyStop, isBotManaged, logEvent, setConversationState } from './Conversations';
import { db } from './DB';
import { completeJob, enqueue } from './JobQueue';
import { loadLeadContext } from './LeadContext';
import { scheduleNextAction } from './NextAction';
import { createObjection, listObjections } from './Objections';
import { createReferralContact } from './Referrals';
import { recordCopywritingUsage } from './Usage';

type Job = typeof jobSchema.$inferSelect;

type InboundMessage = typeof inboundMessageSchema.$inferSelect;

type Classification = typeof replyClassificationSchema.$inferSelect;

type AutomationSettings = Awaited<ReturnType<typeof getAutomationSettings>>;

const payloadSchema = z.object({ inboundMessageId: z.uuid() });

/** Working days to wait for a lead out of office who gave no return date. */
const OUT_OF_OFFICE_FALLBACK_DAYS = 5;

const previousEmailSchema = z.object({ previous_email: z.string() });

/** What the thread says around a reply. */
type ReplyContext = {
  thread: ThreadMessage[];
  manualReply: InstantlyEmail | undefined;
  interestLabel: string | null;
};

/**
 * Turns an Instantly email into a message the classifier reads.
 * @param email The Instantly email.
 * @returns The message, with quoted text dropped from the lead's replies.
 */
const toThreadMessage = (email: InstantlyEmail): ThreadMessage => ({
  direction: email.ue_type === 2 ? 'inbound' : 'outbound',
  sentAt: emailTimestamp(email),
  text: email.ue_type === 2 ? stripQuotedReply(emailText(email)) : emailText(email),
});

/**
 * Reads the Instantly thread of a reply and records what it reveals: the email id,
 * the sending mailbox, the thread and when the first cold email went out.
 * @param options The call options.
 * @param options.conversation The conversation the reply belongs to.
 * @param options.message The stored reply.
 * @returns The thread context, or `duplicate` when another stored reply is the same email.
 * @throws {Error} When Instantly has not indexed the reply yet, so the job retries.
 */
const syncInstantlyThread = async (options: {
  conversation: Conversation;
  message: InboundMessage;
}): Promise<ReplyContext | 'duplicate'> => {
  const known = await db
    .select({ id: inboundMessageSchema.instantlyEmailId })
    .from(inboundMessageSchema)
    .where(
      and(
        eq(inboundMessageSchema.conversationId, options.conversation.id),
        isNotNull(inboundMessageSchema.instantlyEmailId),
        ne(inboundMessageSchema.id, options.message.id),
      ),
    );

  const found = findReplyThread({
    emails: await listLeadEmails(options.conversation.leadEmail),
    knownEmailIds: new Set(known.flatMap((row) => (row.id ? [row.id] : []))),
  });

  if (!found) {
    throw new Error(`Reply ${options.message.id} is not in Instantly yet`);
  }

  // Another conversation, or a redelivery hashed differently, already holds this email
  const claimed = await db.query.inboundMessageSchema.findFirst({
    where: and(
      eq(inboundMessageSchema.instantlyEmailId, found.reply.id),
      ne(inboundMessageSchema.id, options.message.id),
    ),
  });

  if (claimed) {
    return 'duplicate';
  }

  const interestLabel = toInterestLabel(found.reply.i_status);

  await db
    .update(inboundMessageSchema)
    .set({
      instantlyEmailId: found.reply.id,
      instantlyInterestLabel: interestLabel,
      isAutoReply: options.message.isAutoReply || found.reply.is_auto_reply === 1,
    })
    .where(eq(inboundMessageSchema.id, options.message.id));

  await db
    .update(conversationSchema)
    .set({
      threadId: found.reply.thread_id ?? options.conversation.threadId,
      eaccount: options.conversation.eaccount ?? found.reply.eaccount,
      firstEmailSentAt: options.conversation.firstEmailSentAt ?? firstCampaignEmailAt(found.thread),
    })
    .where(eq(conversationSchema.id, options.conversation.id));

  const own = await db
    .select({ id: outboundEmailSchema.instantlyEmailId })
    .from(outboundEmailSchema)
    .where(
      and(
        eq(outboundEmailSchema.conversationId, options.conversation.id),
        isNotNull(outboundEmailSchema.instantlyEmailId),
      ),
    );

  return {
    thread: found.thread
      .filter((email) => email.id !== found.reply.id && email.ue_type !== 4)
      .map(toThreadMessage),
    manualReply: findManualReply({
      thread: found.thread,
      ownEmailIds: new Set(own.flatMap((row) => (row.id ? [row.id] : []))),
    }),
    interestLabel,
  };
};

/**
 * Rebuilds the thread of a simulated conversation from what was stored.
 * @param options The call options.
 * @param options.conversation The test conversation.
 * @param options.message The reply being processed.
 * @returns The thread context, with no Instantly call.
 */
const loadTestThread = async (options: {
  conversation: Conversation;
  message: InboundMessage;
}): Promise<ReplyContext> => {
  const earlier = await db
    .select()
    .from(inboundMessageSchema)
    .where(
      and(
        eq(inboundMessageSchema.conversationId, options.conversation.id),
        lt(inboundMessageSchema.receivedAt, options.message.receivedAt),
      ),
    )
    .orderBy(asc(inboundMessageSchema.receivedAt));

  const coldEmail = [...earlier, options.message]
    .map((message) => previousEmailSchema.safeParse(message.raw))
    .find((parse) => parse.success && parse.data.previous_email)?.data?.previous_email;

  return {
    thread: [
      ...(coldEmail ? [{ direction: 'outbound' as const, sentAt: null, text: coldEmail }] : []),
      ...earlier.map((message) => ({
        direction: 'inbound' as const,
        sentAt: message.receivedAt,
        text: stripQuotedReply(message.bodyText),
      })),
    ],
    manualReply: undefined,
    interestLabel: null,
  };
};

/**
 * Stores a classification once, keeping the first one if a retried job races it.
 * @param values The classification to store.
 * @returns The stored classification.
 */
const saveClassification = async (values: typeof replyClassificationSchema.$inferInsert) => {
  await db.insert(replyClassificationSchema).values(values).onConflictDoNothing();

  const saved = await db.query.replyClassificationSchema.findFirst({
    where: eq(replyClassificationSchema.inboundMessageId, values.inboundMessageId),
  });

  if (!saved) {
    throw new Error(`Classification of ${values.inboundMessageId} could not be stored`);
  }

  return saved;
};

/**
 * Reads the call times the latest sent email offered, so the classifier can tell which one
 * a lead picks with "il primo" or "giovedì".
 * @param conversationId The conversation.
 * @returns The times as the classifier reads them, with their Italian labels.
 */
const loadOfferedSlots = async (conversationId: string) => {
  const [latest] = await db
    .select({ offeredSlots: outboundEmailSchema.offeredSlots })
    .from(outboundEmailSchema)
    .where(
      and(
        eq(outboundEmailSchema.conversationId, conversationId),
        eq(outboundEmailSchema.status, 'sent'),
      ),
    )
    .orderBy(desc(outboundEmailSchema.sentAt))
    .limit(1);

  return (latest?.offeredSlots ?? []).map((slot) => ({
    key: slotKey(slot),
    label: slotLabel(slot),
  }));
};

/**
 * Classifies a reply with the AI, adding an unseen objection to the library for review.
 * @param options The call options.
 * @param options.conversation The conversation the reply belongs to.
 * @param options.message The stored reply.
 * @param options.reply The lead's own words.
 * @param options.context The thread around the reply.
 * @param options.settings The organization's automation settings.
 * @returns The stored classification.
 * @throws {Error} When the AI answer does not parse, so the job retries.
 */
const classifyWithAi = async (options: {
  conversation: Conversation;
  message: InboundMessage;
  reply: string;
  context: ReplyContext;
  settings: AutomationSettings;
}) => {
  const { conversation, message } = options;
  const objections = await listObjections(conversation.organizationId);

  const { output, call } = await classifyReply({
    model: options.settings.classificationModel,
    offer: buildOfferBrief(options.settings),
    objections,
    lead: await loadLeadContext(conversation),
    thread: options.context.thread,
    reply: options.reply,
    interestLabel: options.context.interestLabel,
    offeredSlots: await loadOfferedSlots(conversation.id),
  });

  // Recorded before the answer is checked: an unparsable answer is still billed
  await recordCopywritingUsage({
    userId: conversation.userId,
    organizationId: conversation.organizationId,
    campaignId: conversation.campaignId,
    sequence: call,
  });

  if (!output) {
    throw new Error(`${call.model} returned no parsable classification for ${message.id}`);
  }

  const category = CATEGORY_FROM_CLASSIFIER[output.categoria];
  let objectionId = objections.find((objection) => objection.key === output.tipo_obiezione)?.id;

  if (category === 'objection' && !objectionId && output.nuova_obiezione) {
    const created = await createObjection({
      organizationId: conversation.organizationId,
      sourceMessageId: message.id,
      objection: {
        title: output.nuova_obiezione.titolo,
        description: output.nuova_obiezione.descrizione,
        examples: [options.reply.slice(0, 300)],
        responseAngle: output.nuova_obiezione.angolo_risposta,
        status: 'needs_review',
        closesConversation: false,
      },
    });

    objectionId = created.id;

    await logEvent({
      conversationId: conversation.id,
      type: 'objection_created',
      payload: { objectionId: created.id, key: created.key },
    });
  }

  return await saveClassification({
    inboundMessageId: message.id,
    category,
    objectionId,
    phoneE164: toE164(output.telefono_fornito),
    referral: output.referente_indicato,
    chosenSlot: output.orario_scelto,
    returnDate: output.data_rientro,
    recontactAt: output.data_ricontatto,
    confidence: Math.min(Math.max(output.confidenza, 0), 1),
    reasoning: output.motivazione,
    source: 'ai',
    model: call.model,
  });
};

/**
 * Tells whether the classification's objection was added to the library by this very reply.
 * @param classification The classification.
 * @returns True when a person still has to review the objection's angle.
 */
const hasNewObjection = async (classification: Classification) => {
  if (!classification.objectionId) {
    return false;
  }

  const objection = await db.query.objectionSchema.findFirst({
    where: eq(objectionSchema.id, classification.objectionId),
  });

  return (
    objection?.sourceMessageId === classification.inboundMessageId &&
    objection.status === 'needs_review'
  );
};

/**
 * Marks a reply as fully handled, so a re-run of its job does nothing.
 * @param messageId The reply.
 * @param executor The transaction to write in, when there is one.
 */
const markProcessed = async (messageId: string, executor: Pick<typeof db, 'update'> = db) => {
  await executor
    .update(inboundMessageSchema)
    .set({ processedAt: new Date() })
    .where(eq(inboundMessageSchema.id, messageId));
};

/**
 * Moves the conversation to the state its latest reply calls for.
 * Counters, state and the processed mark change together, so a retry never counts twice.
 * @param options The call options.
 * @param options.conversation The conversation as last read.
 * @param options.message The reply being processed.
 * @param options.classification Its classification.
 * @param options.settings The organization's automation settings.
 */
const routeClassification = async (options: {
  conversation: Conversation;
  message: InboundMessage;
  classification: Classification;
  settings: AutomationSettings;
}) => {
  const { conversation, classification } = options;

  await logEvent({
    conversationId: conversation.id,
    type: 'classified',
    payload: {
      inboundMessageId: options.message.id,
      category: classification.category,
      confidence: classification.confidence,
      source: classification.source,
      model: classification.model,
    },
  });

  const state = decideState({
    category: classification.category,
    confidence: classification.confidence,
    threshold: options.settings.confidenceThreshold,
    isNewObjection: await hasNewObjection(classification),
    hasReferral: Boolean(classification.referral),
    negativeReplyCount: conversation.negativeReplyCount,
  });

  if (state === 'stop') {
    await applyStop({ conversation, reason: classification.source });
    await markProcessed(options.message.id);

    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(conversationSchema)
      .set({
        negativeReplyCount:
          classification.category === 'not_interested'
            ? sql`${conversationSchema.negativeReplyCount} + 1`
            : conversation.negativeReplyCount,
        phoneE164: classification.phoneE164 ?? conversation.phoneE164,
        outOfOfficeUntil:
          parseReturnDate(classification.returnDate) ?? conversation.outOfOfficeUntil,
        // The lead answered: any pending follow-up is off, the reply decides what comes next
        nextActionAt: null,
      })
      .where(eq(conversationSchema.id, conversation.id));

    // Follow-ups written while the lead was silent no longer fit
    await tx
      .update(outboundEmailSchema)
      .set({ status: 'cancelled', errorMessage: 'lead_replied' })
      .where(
        and(
          eq(outboundEmailSchema.conversationId, conversation.id),
          inArray(outboundEmailSchema.kind, ['follow_up', 'closing', 'nurturing']),
          inArray(outboundEmailSchema.status, ['draft', 'scheduled']),
        ),
      );

    // A WhatsApp hand-off still waiting for approval no longer fits either
    await tx
      .update(whatsappHandoffSchema)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(whatsappHandoffSchema.conversationId, conversation.id),
          eq(whatsappHandoffSchema.status, 'draft'),
        ),
      );

    await setConversationState({ conversation, state }, tx);
    await markProcessed(options.message.id, tx);
  });

  // The colleague a wrong person points to joins the campaign, for a person to approve
  if (classification.category === 'wrong_person' && classification.referral) {
    await createReferralContact({ conversation, referral: classification.referral });
  }

  // Back from holiday on the stated day, or about a week out when the reply gave none
  if (state === 'out_of_office') {
    const hours = {
      startHour: options.settings.businessHourStart,
      endHour: options.settings.businessHourEnd,
    };
    const returnDate = parseReturnDate(classification.returnDate);

    await scheduleNextAction(
      conversation.id,
      addBusinessDays({
        from: returnDate ?? new Date(),
        days: returnDate ? 1 : OUT_OF_OFFICE_FALLBACK_DAYS,
        hours,
      }),
    );
  }

  if (
    needsAnswer({
      category: classification.category,
      state,
      hasReferral: Boolean(classification.referral),
    })
  ) {
    await enqueue([{ type: 'reply_write', payload: { inboundMessageId: options.message.id } }]);
  }
};

/**
 * Closes a reply that needs no classification, with the reason in the log.
 * @param options The call options.
 * @param options.conversation The conversation the reply belongs to.
 * @param options.message The reply.
 * @param options.type Why it is closed.
 * @param options.payload Details worth keeping.
 */
const closeUnclassified = async (options: {
  conversation: Conversation;
  message: InboundMessage;
  type: EventType;
  payload?: Record<string, unknown>;
}) => {
  await logEvent({
    conversationId: options.conversation.id,
    type: options.type,
    payload: { inboundMessageId: options.message.id, ...options.payload },
  });
  await markProcessed(options.message.id);
};

/**
 * Handles the replies that never reach the AI: stop requests, replies on an inactive
 * conversation and threads a salesperson already answered.
 * @param options The call options.
 * @param options.conversation The conversation the reply belongs to.
 * @param options.message The reply.
 * @param options.reply The lead's own words.
 * @param options.context The thread around the reply.
 * @param options.settings The organization's automation settings.
 * @returns Whether the reply was handled.
 */
const handleWithoutAi = async (options: {
  conversation: Conversation;
  message: InboundMessage;
  reply: string;
  context: ReplyContext;
  settings: AutomationSettings;
}) => {
  const { conversation, message } = options;

  // The stop guard runs before anything else, paused conversations included
  if (isStopRequest(options.reply)) {
    const classification = await saveClassification({
      inboundMessageId: message.id,
      category: 'stop',
      confidence: 1,
      reasoning: 'Richiesta esplicita di non essere più contattato.',
      source: 'stop_guard',
    });

    await routeClassification({
      conversation,
      message,
      classification,
      settings: options.settings,
    });

    return true;
  }

  if (FINAL_STATES.has(conversation.state)) {
    await closeUnclassified({
      conversation,
      message,
      type: 'reply_while_inactive',
      payload: { state: conversation.state },
    });

    return true;
  }

  if (options.context.manualReply) {
    await db
      .update(conversationSchema)
      .set({ pausedReason: 'manual_reply' })
      .where(eq(conversationSchema.id, conversation.id));
    await setConversationState({ conversation, state: 'paused' });
    await closeUnclassified({
      conversation,
      message,
      type: 'paused_manual_reply',
      payload: { instantlyEmailId: options.context.manualReply.id },
    });

    return true;
  }

  return false;
};

/**
 * Leaves a reply to the sales reps when its campaign is not handled by the bot: the
 * conversation is paused and nothing is read or written. A stop request is not left
 * here, since it is blocked whoever handles the campaign.
 * @param options The reply.
 * @param options.conversation The conversation.
 * @param options.message The reply.
 * @returns Whether the reply was left to the sales reps.
 */
const leaveToSalesReps = async (options: {
  conversation: Conversation;
  message: InboundMessage;
}) => {
  const { conversation, message } = options;

  if (conversation.state === 'paused' || (await isBotManaged(conversation))) {
    return false;
  }

  await db
    .update(conversationSchema)
    .set({ pausedReason: 'unmanaged_campaign' })
    .where(eq(conversationSchema.id, conversation.id));
  await setConversationState({ conversation, state: 'paused' });
  await closeUnclassified({ conversation, message, type: 'campaign_unmanaged' });

  return true;
};

/**
 * Loads a reply job's reply and conversation.
 * @param job The reply job.
 * @returns Both, or null when the reply is gone or already handled.
 * @throws {Error} When the reply's conversation no longer exists.
 */
const loadReply = async (job: Job) => {
  const { inboundMessageId } = payloadSchema.parse(job.payload);

  const message = await db.query.inboundMessageSchema.findFirst({
    where: eq(inboundMessageSchema.id, inboundMessageId),
  });

  if (!message || message.processedAt) {
    return null;
  }

  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, message.conversationId),
  });

  if (!conversation) {
    throw new Error(`Conversation ${message.conversationId} no longer exists`);
  }

  return { message, conversation };
};

/**
 * Reads the thread, applies the stop guard, pauses on a salesperson's reply,
 * then classifies the reply and moves the conversation on.
 * @param job The reply job being processed.
 */
const runReplyProcessJob = async (job: Job) => {
  const loaded = await loadReply(job);

  if (!loaded) {
    await completeJob(job.id);

    return;
  }

  const { message, conversation } = loaded;
  const reply = stripQuotedReply(message.bodyText) || message.bodyText;

  if (!isStopRequest(reply) && (await leaveToSalesReps({ conversation, message }))) {
    await completeJob(job.id);

    return;
  }

  const settings = await getAutomationSettings(conversation.organizationId);

  const context = conversation.isTest
    ? await loadTestThread({ conversation, message })
    : await syncInstantlyThread({ conversation, message });

  if (context === 'duplicate') {
    await closeUnclassified({ conversation, message, type: 'duplicate_ignored' });
    await completeJob(job.id);

    return;
  }

  await db
    .update(inboundMessageSchema)
    .set({
      thread: context.thread.map((item) => ({
        ...item,
        sentAt: item.sentAt?.toISOString() ?? null,
      })),
    })
    .where(eq(inboundMessageSchema.id, message.id));

  // A retry resumes from a classification an earlier attempt already stored
  const existing = await db.query.replyClassificationSchema.findFirst({
    where: eq(replyClassificationSchema.inboundMessageId, message.id),
  });

  const handled =
    !existing && (await handleWithoutAi({ conversation, message, reply, context, settings }));

  if (!handled) {
    const classification =
      existing ?? (await classifyWithAi({ conversation, message, reply, context, settings }));

    await routeClassification({ conversation, message, classification, settings });
  }

  await completeJob(job.id);
};

/**
 * Hands a reply the worker gave up on to a person.
 * @param job The abandoned reply job.
 * @param error The last error.
 */
export const markReplyJobAbandoned = async (job: Job, error: string) => {
  const parse = payloadSchema.safeParse(job.payload);

  if (!parse.success) {
    return;
  }

  const message = await db.query.inboundMessageSchema.findFirst({
    where: eq(inboundMessageSchema.id, parse.data.inboundMessageId),
  });

  const conversation = message
    ? await db.query.conversationSchema.findFirst({
        where: eq(conversationSchema.id, message.conversationId),
      })
    : undefined;

  if (!conversation) {
    return;
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'processing_failed',
    payload: { inboundMessageId: parse.data.inboundMessageId, error },
  });

  if (!FINAL_STATES.has(conversation.state)) {
    await setConversationState({ conversation, state: 'manual_review' });
  }
};

export const replyJobHandlers = {
  reply_process: runReplyProcessJob,
};
