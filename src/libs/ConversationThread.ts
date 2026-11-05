import { and, desc, eq } from 'drizzle-orm';
import type { conversationSchema } from '@/models/Schema';
import { inboundMessageSchema, outboundEmailSchema } from '@/models/Schema';
import { emailText, emailTimestamp, listLeadEmails } from '@/services/Instantly';
import type { ThreadMessage } from '@/services/ReplyPrompt';
import { stripQuotedReply } from '@/utils/ReplyText';
import { db } from './DB';
import { logger } from './Logger';

/** Instantly's email types for a campaign step and an email sent by hand or through the API. */
const CAMPAIGN_EMAIL = 1;
const MANUAL_EMAIL = 3;

/**
 * Reads the emails sent to a lead from Instantly that the platform did not write: the
 * campaign steps and what the team answered by hand. A failure only leaves them out.
 * @param options The call options.
 * @param options.conversation The conversation.
 * @param options.ownEmailIds The Instantly ids of the emails the platform sent itself.
 * @returns The emails, oldest first.
 */
export const listInstantlyEmails = async (options: {
  conversation: typeof conversationSchema.$inferSelect;
  ownEmailIds: Set<string>;
}) => {
  const { conversation } = options;

  // Simulated conversations never reach Instantly
  if (conversation.isTest) {
    return [];
  }

  const emails = await listLeadEmails(conversation.leadEmail).catch((error: unknown) => {
    logger.warn(`Instantly emails of ${conversation.id} could not be read: ${String(error)}`);

    return [];
  });

  return emails.flatMap((email) => {
    const sentAt = emailTimestamp(email);
    const isSkipped =
      (email.ue_type !== CAMPAIGN_EMAIL && email.ue_type !== MANUAL_EMAIL) ||
      options.ownEmailIds.has(email.id) ||
      // The lead may be in other campaigns too
      (conversation.instantlyCampaignId !== null &&
        email.campaign_id !== conversation.instantlyCampaignId);

    if (isSkipped || !sentAt) {
      return [];
    }

    // An HTML-only body can open with its subject and keep the markup's indentation
    const lines = emailText(email)
      .split('\n')
      .map((line) => line.trim());
    const text = (lines[0] === email.subject?.trim() ? lines.slice(1) : lines)
      .join('\n')
      .replaceAll(/\n{3,}/gu, '\n\n')
      .trim();

    return [
      {
        id: email.id,
        kind: email.ue_type === CAMPAIGN_EMAIL ? ('campaign' as const) : ('team' as const),
        sentAt,
        sender: email.eaccount ?? null,
        body: email.ue_type === MANUAL_EMAIL ? stripQuotedReply(text) || text : text,
      },
    ];
  });
};

/**
 * Rebuilds the thread a follow-up or a new email continues: what the lead's latest reply
 * came after, the reply itself, and every email sent since, by the platform or by hand
 * from Instantly.
 * @param conversation The conversation.
 * @returns The latest reply and the thread around it, or null when the lead never replied.
 */
export const loadThread = async (conversation: typeof conversationSchema.$inferSelect) => {
  const [latest] = await db
    .select()
    .from(inboundMessageSchema)
    .where(eq(inboundMessageSchema.conversationId, conversation.id))
    .orderBy(desc(inboundMessageSchema.receivedAt))
    .limit(1);

  if (!latest) {
    return null;
  }

  const sent = await db
    .select({
      body: outboundEmailSchema.body,
      sentAt: outboundEmailSchema.sentAt,
      instantlyEmailId: outboundEmailSchema.instantlyEmailId,
    })
    .from(outboundEmailSchema)
    .where(
      and(
        eq(outboundEmailSchema.conversationId, conversation.id),
        eq(outboundEmailSchema.status, 'sent'),
      ),
    );

  const ownEmailIds = new Set(sent.flatMap((email) => email.instantlyEmailId ?? []));
  const instantlyEmails = await listInstantlyEmails({ conversation, ownEmailIds });
  const byHand = instantlyEmails.filter((email) => email.kind === 'team');

  const since = [
    ...sent.map((email) => ({ sentAt: email.sentAt, text: email.body })),
    ...byHand.map((email) => ({ sentAt: email.sentAt, text: email.body })),
  ]
    .filter((email): email is { sentAt: Date; text: string } =>
      Boolean(email.sentAt && email.sentAt > latest.receivedAt),
    )
    .toSorted((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  const reply = stripQuotedReply(latest.bodyText) || latest.bodyText;
  const thread: ThreadMessage[] = [
    ...(latest.thread ?? []).map((item) => ({
      ...item,
      sentAt: item.sentAt ? new Date(item.sentAt) : null,
    })),
    { direction: 'inbound', sentAt: latest.receivedAt, text: reply },
    ...since.map((email) => ({ direction: 'outbound' as const, ...email })),
  ];

  return { latest, reply, thread };
};
