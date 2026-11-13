import { and, desc, eq } from 'drizzle-orm';
import {
  conversationSchema,
  emailSuppressionSchema,
  inboundMessageSchema,
  replyClassificationSchema,
} from '@/models/Schema';
import {
  AUTOMATIC_FOLLOW_UPS,
  FOLLOW_UP_STATES,
  followUpDueAt,
  mentionsDemo,
} from '@/utils/FollowUps';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation } from './Conversations';
import { logEvent, setConversationState } from './Conversations';
import { db } from './DB';
import { getConversationDemo } from './Demos';
import { scheduleNextAction } from './NextAction';

/** States a conversation leaves for `demo_sent` once a person sent the demo link by hand. */
const HAND_DEMO_FROM = new Set<Conversation['state']>([
  'replied',
  'classified',
  'manual_review',
  'paused',
]);

/** A lead whose latest reply is one of these is never followed up. Objections count as a no. */
const NO_FOLLOW_UP_CATEGORIES = new Set<ReplyCategory>(['objection', 'not_interested', 'stop']);

/**
 * Reads the category of the lead's latest classified reply.
 * @param conversationId The conversation.
 * @returns The category, or undefined when no reply is classified.
 */
const latestCategory = async (conversationId: string) => {
  const [latest] = await db
    .select({ category: replyClassificationSchema.category })
    .from(replyClassificationSchema)
    .innerJoin(
      inboundMessageSchema,
      eq(inboundMessageSchema.id, replyClassificationSchema.inboundMessageId),
    )
    .where(eq(inboundMessageSchema.conversationId, conversationId))
    .orderBy(desc(inboundMessageSchema.receivedAt))
    .limit(1);

  return latest?.category;
};

/**
 * Tells whether a lead may get the follow-ups after the demo: they got it, never booked,
 * and neither asked to stop nor said no.
 * @param conversation The conversation, as it stands now.
 * @returns True when the lead may be followed up.
 */
export const mayFollowUp = async (conversation: Conversation) => {
  if (!FOLLOW_UP_STATES.has(conversation.state)) {
    return false;
  }

  const suppressed = await db.query.emailSuppressionSchema.findFirst({
    where: and(
      eq(emailSuppressionSchema.organizationId, conversation.organizationId),
      eq(emailSuppressionSchema.email, conversation.leadEmail),
    ),
  });
  const category = await latestCategory(conversation.id);

  if (suppressed || (category && NO_FOLLOW_UP_CATEGORIES.has(category))) {
    return false;
  }

  const demo = await getConversationDemo(conversation.id);

  return Boolean(demo && !demo.summary.booked);
};

/**
 * Plans the first follow-up once the email with the demo is out, whoever sent it: a day
 * later, unless the lead answers, books or stops first.
 * @param options The email with the demo.
 * @param options.conversationId The conversation.
 * @param options.sentAt When it left.
 * @param options.dueAt When the first follow-up is due instead, for leads catching up.
 * @returns When the first follow-up is due, or null when the lead is not followed up.
 */
export const startFollowUps = async (options: {
  conversationId: string;
  sentAt: Date;
  dueAt?: Date;
}) => {
  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, options.conversationId),
  });

  if (
    !AUTOMATIC_FOLLOW_UPS ||
    !conversation ||
    conversation.followUpCount > 0 ||
    conversation.nextActionAt ||
    !(await mayFollowUp(conversation))
  ) {
    return null;
  }

  const settings = await getAutomationSettings(conversation.organizationId);
  const dueAt =
    options.dueAt ??
    followUpDueAt({
      from: options.sentAt,
      hours: { startHour: settings.businessHourStart, endHour: settings.businessHourEnd },
    });

  await scheduleNextAction(conversation.id, dueAt);
  await logEvent({
    conversationId: conversation.id,
    type: 'follow_ups_started',
    payload: { sentAt: options.sentAt, dueAt },
  });

  return dueAt;
};

/**
 * Picks up an email a person sent by hand from Instantly: when it carries the lead's demo
 * link the demo counts as sent and the follow-ups start from when it left.
 * @param options The email sent by hand.
 * @param options.conversationId The conversation.
 * @param options.text The email text.
 * @param options.sentAt When it left.
 * @param options.dueAt When the first follow-up is due instead, for leads catching up.
 * @returns When the first follow-up is due, or null when the email has no demo link or the
 * lead is not followed up.
 */
export const startFollowUpsAfterHandSent = async (options: {
  conversationId: string;
  text: string;
  sentAt: Date;
  dueAt?: Date;
}) => {
  const demo = await getConversationDemo(options.conversationId);
  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, options.conversationId),
  });

  if (!demo || !conversation || !mentionsDemo(options.text, demo.demo.slug)) {
    return null;
  }

  if (HAND_DEMO_FROM.has(conversation.state)) {
    await setConversationState({ conversation, state: 'demo_sent' });
  }

  return await startFollowUps(options);
};
