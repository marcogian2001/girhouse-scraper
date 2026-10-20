import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { inboundMessageSchema, outboundEmailSchema } from '@/models/Schema';
import type { ThreadMessage } from '@/services/ReplyPrompt';
import { stripQuotedReply } from '@/utils/ReplyText';
import { db } from './DB';

/**
 * Rebuilds the thread a follow-up or the WhatsApp hand-off continues: what the lead's latest reply came after,
 * the reply itself, and every email the platform sent since.
 * @param conversationId The conversation.
 * @returns The latest reply and the thread around it, or null when the lead never replied.
 */
export const loadThread = async (conversationId: string) => {
  const [latest] = await db
    .select()
    .from(inboundMessageSchema)
    .where(eq(inboundMessageSchema.conversationId, conversationId))
    .orderBy(desc(inboundMessageSchema.receivedAt))
    .limit(1);

  if (!latest) {
    return null;
  }

  const sent = await db
    .select({ body: outboundEmailSchema.body, sentAt: outboundEmailSchema.sentAt })
    .from(outboundEmailSchema)
    .where(
      and(
        eq(outboundEmailSchema.conversationId, conversationId),
        eq(outboundEmailSchema.status, 'sent'),
        gt(outboundEmailSchema.sentAt, latest.receivedAt),
      ),
    )
    .orderBy(asc(outboundEmailSchema.sentAt));

  const reply = stripQuotedReply(latest.bodyText) || latest.bodyText;
  const thread: ThreadMessage[] = [
    ...(latest.thread ?? []).map((item) => ({
      ...item,
      sentAt: item.sentAt ? new Date(item.sentAt) : null,
    })),
    { direction: 'inbound', sentAt: latest.receivedAt, text: reply },
    ...sent.map((email) => ({
      direction: 'outbound' as const,
      sentAt: email.sentAt,
      text: email.body,
    })),
  ];

  return { latest, reply, thread };
};
