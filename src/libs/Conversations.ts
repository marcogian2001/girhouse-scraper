import { and, desc, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import {
  campaignSchema,
  contactSchema,
  conversationEventSchema,
  conversationSchema,
  emailSuppressionSchema,
  inboundMessageSchema,
  jobSchema,
  leadSchema,
  objectionSchema,
  outboundEmailSchema,
  replyClassificationSchema,
  userSchema,
  whatsappHandoffSchema,
  whatsappMessageSchema,
} from '@/models/Schema';
import { findContactByEmail, isGhlConfigured, setContactDnd } from '@/services/GoHighLevel';
import { addToBlocklist } from '@/services/Instantly';
import type { ConversationState, ReplyCategory } from '@/utils/ReplyRouting';
import { decideState, needsAnswer } from '@/utils/ReplyRouting';
import { sha256Hex } from '@/utils/Secrets';
import type { InstantlyWebhook } from '@/validations/InstantlyWebhookValidation';
import { REPLY_EVENTS } from '@/validations/InstantlyWebhookValidation';
import { db } from './DB';
import { Env } from './Env';
import { enqueue } from './JobQueue';
import { logger } from './Logger';
import { scheduleNextAction } from './NextAction';

export type Conversation = typeof conversationSchema.$inferSelect;

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every entry the conversation log can hold. */
export const EVENT_TYPES = [
  'reply_received',
  'reply_simulated',
  'duplicate_ignored',
  'state_changed',
  'classified',
  'objection_created',
  'instantly_blocklisted',
  'test_skipped_instantly_blocklist',
  'reply_while_inactive',
  'paused_manual_reply',
  'classification_overridden',
  'processing_failed',
  'reply_drafted',
  'reply_scheduled',
  'reply_approved',
  'reply_rewritten',
  'reply_discarded',
  'reply_held_kill_switch',
  'reply_cancelled',
  'reply_sent',
  'test_skipped_instantly_send',
  'demo_created',
  'demo_opened',
  'demo_completed',
  'demo_whatsapp_click',
  'demo_phone_left',
  'call_booked',
  'test_skipped_ghl_booking',
  'booking_slot_taken',
  'ghl_opportunity_saved',
  'ghl_opportunity_failed',
  'ghl_dnd_set',
  'ghl_dnd_failed',
  'ghl_appointment_booked',
  'ghl_handover',
  'ghl_dnd_received',
  'follow_up_scheduled',
  'follow_up_drafted',
  'follow_up_held_kill_switch',
  'whatsapp_drafted',
  'whatsapp_started',
  'whatsapp_failed',
  'whatsapp_cancelled',
  'whatsapp_reply',
  'test_skipped_ghl_whatsapp',
  'out_of_office_sequence_running',
  'referral_contact_created',
  'referral_contact_skipped',
  'test_skipped_referral_contact',
  'campaign_unmanaged',
  'ghl_bot_assigned',
  'ghl_bot_assign_failed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Appends an entry to a conversation's log.
 * @param options The event.
 * @param options.conversationId The conversation it belongs to.
 * @param options.type What happened.
 * @param options.payload Details worth keeping.
 * @param options.actorUserId The person who acted, when it was not the automation.
 * @param executor The transaction to write in, when there is one.
 */
export const logEvent = async (
  options: {
    conversationId: string;
    type: EventType;
    payload?: Record<string, unknown>;
    actorUserId?: string | null;
  },
  executor: Executor = db,
) => {
  await executor.insert(conversationEventSchema).values({
    conversationId: options.conversationId,
    type: options.type,
    payload: options.payload ?? {},
    actorUserId: options.actorUserId ?? null,
  });
};

/**
 * Tells whether the reply bot handles a conversation: always for a simulated one, otherwise
 * only when its campaign was marked as handled by the bot.
 * @param conversation The conversation.
 * @returns True when the bot may classify, answer and follow up.
 */
export const isBotManaged = async (conversation: Conversation) => {
  if (conversation.isTest) {
    return true;
  }

  const campaign = conversation.campaignId
    ? await db.query.campaignSchema.findFirst({
        where: eq(campaignSchema.id, conversation.campaignId),
        columns: { botManaged: true },
      })
    : undefined;

  return campaign?.botManaged ?? false;
};

/**
 * Moves a conversation to a new state and logs the change.
 * @param options The change.
 * @param options.conversation The conversation as last read.
 * @param options.state The state to move to.
 * @param options.actorUserId The person who moved it, when it was not the automation.
 * @param executor The transaction to write in, when there is one.
 */
export const setConversationState = async (
  options: { conversation: Conversation; state: ConversationState; actorUserId?: string | null },
  executor: Executor = db,
) => {
  if (options.conversation.state === options.state) {
    return;
  }

  await executor
    .update(conversationSchema)
    .set({ state: options.state })
    .where(eq(conversationSchema.id, options.conversation.id));

  await logEvent(
    {
      conversationId: options.conversation.id,
      type: 'state_changed',
      payload: { from: options.conversation.state, to: options.state },
      actorUserId: options.actorUserId,
    },
    executor,
  );
};

/**
 * Marks the lead Do Not Disturb on GHL too, once, when GHL knows them. GHL is secondary
 * here: the stop already holds, so a failure is logged for a person instead of retried.
 * @param conversation The stopped conversation.
 */
const setGhlDnd = async (conversation: Conversation) => {
  if (!isGhlConfigured()) {
    return;
  }

  const done = await db.query.conversationEventSchema.findFirst({
    where: and(
      eq(conversationEventSchema.conversationId, conversation.id),
      eq(conversationEventSchema.type, 'ghl_dnd_set'),
    ),
  });

  if (done) {
    return;
  }

  try {
    const contactId =
      conversation.ghlContactId ?? (await findContactByEmail(conversation.leadEmail));

    if (!contactId) {
      return;
    }

    await setContactDnd(contactId);
    await logEvent({
      conversationId: conversation.id,
      type: 'ghl_dnd_set',
      payload: { contactId },
    });
  } catch (error) {
    await logEvent({
      conversationId: conversation.id,
      type: 'ghl_dnd_failed',
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
  }
};

/**
 * Stops all contact with a lead for good: suppressed in the database, blocked on Instantly.
 * Safe to repeat, so a retried job finishes what a failed one started.
 * @param options The call options.
 * @param options.conversation The conversation to stop.
 * @param options.reason Why, for the suppression list.
 * @param options.actorUserId The person who stopped it, when it was not the automation.
 * @throws {Error} When Instantly rejects the blocklist entry.
 */
export const applyStop = async (options: {
  conversation: Conversation;
  reason: string;
  actorUserId?: string | null;
}) => {
  const { conversation } = options;

  await db.transaction(async (tx) => {
    await tx
      .insert(emailSuppressionSchema)
      .values({
        organizationId: conversation.organizationId,
        email: conversation.leadEmail,
        reason: options.reason,
        conversationId: conversation.id,
      })
      .onConflictDoNothing();

    await setConversationState(
      { conversation, state: 'stop', actorUserId: options.actorUserId },
      tx,
    );
    await scheduleNextAction(conversation.id, null, tx);
  });

  if (conversation.isTest) {
    await logEvent({ conversationId: conversation.id, type: 'test_skipped_instantly_blocklist' });

    return;
  }

  const blocked = await db.query.conversationEventSchema.findFirst({
    where: and(
      eq(conversationEventSchema.conversationId, conversation.id),
      eq(conversationEventSchema.type, 'instantly_blocklisted'),
    ),
  });

  if (!blocked) {
    await addToBlocklist(conversation.leadEmail);
    await logEvent({ conversationId: conversation.id, type: 'instantly_blocklisted' });
  }

  await setGhlDnd(conversation);
};

/**
 * Finds the newest lead of an organization with this email.
 * @param options The lookup options.
 * @param options.organizationId The organization the lead must belong to.
 * @param options.email The lower-cased email.
 * @returns The lead, or undefined when no lead search found this address.
 */
const findLeadByEmail = async (options: { organizationId: string; email: string }) => {
  const [lead] = await db
    .select({ id: leadSchema.id, company: leadSchema.company })
    .from(leadSchema)
    .where(
      and(
        eq(leadSchema.organizationId, options.organizationId),
        eq(sql`lower(${leadSchema.email})`, options.email),
      ),
    )
    .orderBy(desc(leadSchema.updatedAt))
    .limit(1);

  return lead;
};

/**
 * Stores a reply delivered by the Instantly webhook and queues its processing.
 * The webhook carries no email id, so redeliveries are caught by a hash of the payload.
 * @param webhook The validated webhook payload.
 * @returns What happened to the delivery.
 */
export const receiveInstantlyReply = async (webhook: InstantlyWebhook) => {
  if (!REPLY_EVENTS.has(webhook.event_type) || !webhook.campaign_id || !webhook.lead_email) {
    return { status: 'ignored' as const };
  }

  const campaign = await db.query.campaignSchema.findFirst({
    where: eq(campaignSchema.instantlyCampaignId, webhook.campaign_id),
  });

  if (!campaign) {
    logger.warn(`Ignored a reply for unknown Instantly campaign ${webhook.campaign_id}`);

    return { status: 'ignored' as const };
  }

  const leadEmail = webhook.lead_email.toLowerCase();

  const contact = await db.query.contactSchema.findFirst({
    where: and(
      eq(contactSchema.campaignId, campaign.id),
      eq(sql`lower(${contactSchema.email})`, leadEmail),
    ),
  });

  const lead = await findLeadByEmail({ organizationId: campaign.organizationId, email: leadEmail });
  const receivedAt = new Date(webhook.timestamp);

  const [conversation] = await db
    .insert(conversationSchema)
    .values({
      organizationId: campaign.organizationId,
      userId: campaign.userId,
      campaignId: campaign.id,
      contactId: contact?.id,
      leadId: lead?.id,
      instantlyCampaignId: webhook.campaign_id,
      leadEmail,
      company: contact?.company ?? lead?.company,
      eaccount: webhook.email_account,
      lastInboundAt: receivedAt,
    })
    .onConflictDoUpdate({
      target: [
        conversationSchema.organizationId,
        conversationSchema.instantlyCampaignId,
        conversationSchema.leadEmail,
      ],
      set: { lastInboundAt: receivedAt },
    })
    .returning();

  if (!conversation) {
    throw new Error(`Conversation for ${leadEmail} could not be stored`);
  }

  const bodyText = webhook.reply_text ?? webhook.reply_text_snippet ?? '';

  const [message] = await db
    .insert(inboundMessageSchema)
    .values({
      conversationId: conversation.id,
      dedupeKey: sha256Hex(
        [webhook.event_type, webhook.campaign_id, leadEmail, webhook.timestamp, bodyText].join('|'),
      ),
      eventType: webhook.event_type,
      subject: webhook.reply_subject,
      bodyText,
      receivedAt,
      raw: webhook,
    })
    .onConflictDoNothing()
    .returning();

  if (!message) {
    return { status: 'duplicate' as const };
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'reply_received',
    payload: { inboundMessageId: message.id, eventType: webhook.event_type },
  });

  // A bot-managed lead goes to the bot user on GHL, before the GHL workflows assign a rep
  const handToBot = campaign.botManaged && isGhlConfigured() && Boolean(Env.GHL_BOT_USER_ID);

  await enqueue([
    { type: 'reply_process', payload: { inboundMessageId: message.id } },
    ...(handToBot
      ? [{ type: 'ghl_bot_assign' as const, payload: { conversationId: conversation.id } }]
      : []),
  ]);

  return { status: 'queued' as const, conversationId: conversation.id };
};

/**
 * Stores a made-up reply on a test conversation and queues it like a real one.
 * Replies to the same address continue the same test conversation, so multi-turn
 * cases such as a second negative reply can be tried.
 * @param options The call options.
 * @param options.userId The person simulating, billed for the AI calls.
 * @param options.organizationId The organization to simulate in.
 * @param options.company The made-up business name.
 * @param options.leadEmail The made-up lead address.
 * @param options.previousEmail The cold email the lead is answering, if given.
 * @param options.replyText The lead's reply.
 * @returns The test conversation id.
 */
export const simulateReply = async (options: {
  userId: string;
  organizationId: string;
  company: string;
  leadEmail: string;
  previousEmail: string;
  replyText: string;
}) => {
  const leadEmail = options.leadEmail.toLowerCase();
  const receivedAt = new Date();

  const existing = await db.query.conversationSchema.findFirst({
    where: and(
      eq(conversationSchema.organizationId, options.organizationId),
      eq(conversationSchema.leadEmail, leadEmail),
      eq(conversationSchema.isTest, true),
    ),
  });

  // The address of a real lead links its data, so the test demo shows real reviews and photos
  const lead = await findLeadByEmail({ organizationId: options.organizationId, email: leadEmail });

  const [conversation] = existing
    ? [existing]
    : await db
        .insert(conversationSchema)
        .values({
          organizationId: options.organizationId,
          userId: options.userId,
          leadId: lead?.id,
          leadEmail,
          company: lead?.company ?? options.company,
          isTest: true,
          firstEmailSentAt: receivedAt,
        })
        .returning();

  if (!conversation) {
    throw new Error('Test conversation could not be created');
  }

  await db
    .update(conversationSchema)
    .set({ lastInboundAt: receivedAt })
    .where(eq(conversationSchema.id, conversation.id));

  const [message] = await db
    .insert(inboundMessageSchema)
    .values({
      conversationId: conversation.id,
      dedupeKey: `simulated:${crypto.randomUUID()}`,
      eventType: 'simulated',
      bodyText: options.replyText,
      receivedAt,
      raw: { previous_email: options.previousEmail },
    })
    .returning();

  if (!message) {
    throw new Error('Simulated reply could not be stored');
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'reply_simulated',
    payload: { inboundMessageId: message.id },
    actorUserId: options.userId,
  });

  await enqueue([{ type: 'reply_process', payload: { inboundMessageId: message.id } }]);

  return conversation.id;
};

/** States a person has to look at, shown first in the dashboard. */
export const REVIEW_STATES: ConversationState[] = ['manual_review'];

/** How many conversations a page of the dashboard list shows. */
export const CONVERSATIONS_PAGE_SIZE = 25;

/**
 * Lists a page of an organization's conversations, latest reply first, with the lead's name
 * and the category of their latest reply.
 * @param options The call options.
 * @param options.organizationId The organization to list.
 * @param options.states Only these states, when given.
 * @param options.search Text the lead's email, company, first or last name must contain.
 * @param options.page The 1-based page to read.
 * @returns The page of conversations and how many match in all.
 */
export const listConversations = async (options: {
  organizationId: string;
  states?: ConversationState[];
  search?: string;
  page: number;
}) => {
  const pattern = options.search ? `%${options.search.replaceAll(/[\\%_]/gu, '\\$&')}%` : undefined;
  const firstName = sql<
    string | null
  >`coalesce(${contactSchema.firstName}, ${leadSchema.firstName})`;
  const lastName = sql<string | null>`coalesce(${contactSchema.lastName}, ${leadSchema.lastName})`;

  const where = and(
    eq(conversationSchema.organizationId, options.organizationId),
    options.states ? inArray(conversationSchema.state, options.states) : undefined,
    pattern
      ? or(
          ilike(conversationSchema.leadEmail, pattern),
          ilike(conversationSchema.company, pattern),
          // Lets "Mario Rossi" match as well as "Mario" or "Rossi" alone
          sql`concat_ws(' ', ${firstName}, ${lastName}) ilike ${pattern}`,
          sql`concat_ws(' ', ${lastName}, ${firstName}) ilike ${pattern}`,
        )
      : undefined,
  );

  const rows = await db
    .select({
      conversation: conversationSchema,
      firstName,
      lastName,
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(conversationSchema)
    .leftJoin(contactSchema, eq(contactSchema.id, conversationSchema.contactId))
    .leftJoin(leadSchema, eq(leadSchema.id, conversationSchema.leadId))
    .where(where)
    .orderBy(desc(conversationSchema.lastInboundAt), desc(conversationSchema.id))
    .limit(CONVERSATIONS_PAGE_SIZE)
    .offset((options.page - 1) * CONVERSATIONS_PAGE_SIZE);

  if (rows.length === 0) {
    return { conversations: [], total: 0 };
  }

  const latest = await db
    .selectDistinctOn([inboundMessageSchema.conversationId], {
      conversationId: inboundMessageSchema.conversationId,
      category: replyClassificationSchema.category,
    })
    .from(inboundMessageSchema)
    .leftJoin(
      replyClassificationSchema,
      eq(replyClassificationSchema.inboundMessageId, inboundMessageSchema.id),
    )
    .where(
      inArray(
        inboundMessageSchema.conversationId,
        rows.map((row) => row.conversation.id),
      ),
    )
    .orderBy(inboundMessageSchema.conversationId, desc(inboundMessageSchema.receivedAt));

  const categories = new Map(latest.map((row) => [row.conversationId, row.category]));

  return {
    conversations: rows.map((row) => ({
      ...row.conversation,
      leadName: [row.firstName, row.lastName].filter(Boolean).join(' ') || null,
      category: categories.get(row.conversation.id) ?? null,
    })),
    total: rows[0]?.total ?? 0,
  };
};

/**
 * Counts an organization's conversations per state.
 * @param organizationId The organization to count.
 * @returns The count of each state that has any conversation.
 */
export const countConversationsByState = async (organizationId: string) => {
  const rows = await db
    .select({
      state: conversationSchema.state,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(conversationSchema)
    .where(eq(conversationSchema.organizationId, organizationId))
    .groupBy(conversationSchema.state);

  return new Map(rows.map((row) => [row.state, row.count]));
};

/**
 * Counts the reply jobs of a conversation still waiting for the worker.
 * @param conversationId The conversation to check.
 * @returns How many are queued or running.
 */
const countPendingJobs = async (conversationId: string) => {
  const messageIds = db
    .select({ id: sql`${inboundMessageSchema.id}::text` })
    .from(inboundMessageSchema)
    .where(eq(inboundMessageSchema.conversationId, conversationId));

  const emailIds = db
    .select({ id: sql`${outboundEmailSchema.id}::text` })
    .from(outboundEmailSchema)
    .where(eq(outboundEmailSchema.conversationId, conversationId));

  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(jobSchema)
    .where(
      and(
        inArray(jobSchema.status, ['queued', 'running']),
        // A send waiting for its time is shown on the email, not as work in progress
        lte(jobSchema.runAfter, sql`now()`),
        or(
          and(
            inArray(jobSchema.type, ['reply_process', 'reply_write']),
            inArray(sql`${jobSchema.payload}->>'inboundMessageId'`, messageIds),
          ),
          and(
            eq(jobSchema.type, 'reply_send'),
            inArray(sql`${jobSchema.payload}->>'outboundEmailId'`, emailIds),
          ),
        ),
      ),
    );

  return row?.count ?? 0;
};

/**
 * Reads a conversation of the organization.
 * @param options The call options.
 * @param options.organizationId The organization it must belong to.
 * @param options.conversationId The conversation to read.
 * @returns The conversation, or undefined when it is not the organization's.
 */
const findConversation = async (options: { organizationId: string; conversationId: string }) =>
  await db.query.conversationSchema.findFirst({
    where: and(
      eq(conversationSchema.id, options.conversationId),
      eq(conversationSchema.organizationId, options.organizationId),
    ),
  });

/**
 * Reads where a conversation stands, for the page that polls it.
 * @param options The call options.
 * @param options.organizationId The organization it must belong to.
 * @param options.conversationId The conversation to read.
 * @returns The state and pending work, or null when it is not the organization's.
 */
export const getConversationStatus = async (options: {
  organizationId: string;
  conversationId: string;
}) => {
  const conversation = await findConversation(options);

  if (!conversation) {
    return null;
  }

  return {
    state: conversation.state,
    updatedAt: conversation.updatedAt.toISOString(),
    pendingJobs: await countPendingJobs(conversation.id),
  };
};

/**
 * Reads a conversation with its replies, their classifications and its log.
 * @param options The call options.
 * @param options.organizationId The organization it must belong to.
 * @param options.conversationId The conversation to read.
 * @returns The detail, or null when it is not the organization's.
 */
export const getConversationDetail = async (options: {
  organizationId: string;
  conversationId: string;
}) => {
  const conversation = await findConversation(options);

  if (!conversation) {
    return null;
  }

  const messages = await db
    .select({
      message: inboundMessageSchema,
      classification: replyClassificationSchema,
      objection: { id: objectionSchema.id, title: objectionSchema.title },
    })
    .from(inboundMessageSchema)
    .leftJoin(
      replyClassificationSchema,
      eq(replyClassificationSchema.inboundMessageId, inboundMessageSchema.id),
    )
    .leftJoin(objectionSchema, eq(objectionSchema.id, replyClassificationSchema.objectionId))
    .where(eq(inboundMessageSchema.conversationId, conversation.id))
    .orderBy(inboundMessageSchema.receivedAt);

  const events = await db
    .select({ event: conversationEventSchema, actorName: userSchema.name })
    .from(conversationEventSchema)
    .leftJoin(userSchema, eq(userSchema.id, conversationEventSchema.actorUserId))
    .where(eq(conversationEventSchema.conversationId, conversation.id))
    .orderBy(desc(conversationEventSchema.createdAt))
    .limit(200);

  const outbound = await db
    .select()
    .from(outboundEmailSchema)
    .where(eq(outboundEmailSchema.conversationId, conversation.id))
    .orderBy(outboundEmailSchema.createdAt);

  const whatsappHandoff = await db.query.whatsappHandoffSchema.findFirst({
    where: eq(whatsappHandoffSchema.conversationId, conversation.id),
  });

  const whatsappMessages = await db
    .select()
    .from(whatsappMessageSchema)
    .where(eq(whatsappMessageSchema.conversationId, conversation.id))
    .orderBy(whatsappMessageSchema.receivedAt);

  return {
    conversation,
    messages,
    outbound,
    events,
    whatsappHandoff: whatsappHandoff ?? null,
    whatsappMessages,
    pendingJobs: await countPendingJobs(conversation.id),
  };
};

/**
 * Replaces the category of a reply with one a person chose. When it is the latest
 * reply, the conversation moves to the state that category leads to.
 * @param options The call options.
 * @param options.organizationId The organization the reply must belong to.
 * @param options.userId The person overriding, recorded in the log.
 * @param options.classificationId The classification to change.
 * @param options.category The category the person chose.
 * @returns The updated classification, or null when it is not the organization's.
 * @throws {Error} When the lead must be blocked and Instantly rejects it.
 */
export const overrideClassification = async (options: {
  organizationId: string;
  userId: string;
  classificationId: string;
  category: ReplyCategory;
}) => {
  const [row] = await db
    .select({
      classification: replyClassificationSchema,
      message: inboundMessageSchema,
      conversation: conversationSchema,
    })
    .from(replyClassificationSchema)
    .innerJoin(
      inboundMessageSchema,
      eq(inboundMessageSchema.id, replyClassificationSchema.inboundMessageId),
    )
    .innerJoin(conversationSchema, eq(conversationSchema.id, inboundMessageSchema.conversationId))
    .where(
      and(
        eq(replyClassificationSchema.id, options.classificationId),
        eq(conversationSchema.organizationId, options.organizationId),
      ),
    );

  if (!row) {
    return null;
  }

  const { classification, conversation } = row;
  const previous = classification.category;

  // Keep the count of negative replies true to the corrected categories
  const negativeDelta =
    Number(options.category === 'not_interested') - Number(previous === 'not_interested');

  const [updated] = await db
    .update(replyClassificationSchema)
    .set({ category: options.category, source: 'manual', confidence: 1 })
    .where(eq(replyClassificationSchema.id, classification.id))
    .returning();

  await db
    .update(conversationSchema)
    .set({ negativeReplyCount: sql`${conversationSchema.negativeReplyCount} + ${negativeDelta}` })
    .where(eq(conversationSchema.id, conversation.id));

  await logEvent({
    conversationId: conversation.id,
    type: 'classification_overridden',
    payload: { inboundMessageId: row.message.id, from: previous, to: options.category },
    actorUserId: options.userId,
  });

  const [latest] = await db
    .select({ id: inboundMessageSchema.id })
    .from(inboundMessageSchema)
    .where(eq(inboundMessageSchema.conversationId, conversation.id))
    .orderBy(desc(inboundMessageSchema.receivedAt))
    .limit(1);

  // An older reply no longer decides where the conversation stands, and a stop
  // is permanent: the lead is suppressed and blocked whatever the correction
  if (latest?.id !== row.message.id || conversation.state === 'stop') {
    return updated;
  }

  const state = decideState({
    category: options.category,
    confidence: 1,
    threshold: 0,
    isNewObjection: false,
    hasReferral: Boolean(classification.referral),
    // Replies before this one only
    negativeReplyCount:
      conversation.negativeReplyCount +
      negativeDelta -
      Number(options.category === 'not_interested'),
  });

  await (state === 'stop'
    ? applyStop({ conversation, reason: 'manual_override', actorUserId: options.userId })
    : setConversationState({ conversation, state, actorUserId: options.userId }));

  // The draft answered the old category: it is written again for the new one
  await db
    .delete(outboundEmailSchema)
    .where(
      and(
        eq(outboundEmailSchema.inboundMessageId, row.message.id),
        eq(outboundEmailSchema.status, 'draft'),
      ),
    );

  if (
    needsAnswer({
      category: options.category,
      state,
      hasReferral: Boolean(classification.referral),
    })
  ) {
    await enqueue([{ type: 'reply_write', payload: { inboundMessageId: row.message.id } }]);
  }

  return updated;
};
