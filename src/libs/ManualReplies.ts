import { setTimeout as sleep } from 'node:timers/promises';
import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { conversationSchema, outboundEmailSchema } from '@/models/Schema';
import { emailTimestamp, findManualReply, listLeadEmails } from '@/services/Instantly';
import { logEvent } from './Conversations';
import { db } from './DB';
import { logger } from './Logger';

/** Conversations read from Instantly per run: it allows 20 calls a minute. */
const MAX_PER_RUN = 10;

/** Between two calls, so a run stays inside Instantly's limit. */
const CALL_SPACING_MS = 3500;

/** How far back an unanswered reply is still looked at. */
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Finds the replies a salesperson sent by hand from Instantly, which the platform never
 * sends itself, and records them as answers: the conversation counts as answered from
 * when the email left. Looks at a random handful of recent unanswered conversations per
 * run, so every one is reached over a few runs.
 * @returns How many conversations were found answered by hand.
 */
export const syncManualReplies = async () => {
  const candidates = await db
    .select({ id: conversationSchema.id, leadEmail: conversationSchema.leadEmail })
    .from(conversationSchema)
    .where(
      and(
        eq(conversationSchema.isTest, false),
        isNull(conversationSchema.lastOutboundAt),
        isNotNull(conversationSchema.lastInboundAt),
        gt(conversationSchema.lastInboundAt, new Date(Date.now() - WINDOW_MS)),
      ),
    )
    .orderBy(sql`random()`)
    .limit(MAX_PER_RUN);

  const own =
    candidates.length > 0
      ? await db
          .select({ id: outboundEmailSchema.instantlyEmailId })
          .from(outboundEmailSchema)
          .where(
            and(
              inArray(
                outboundEmailSchema.conversationId,
                candidates.map((candidate) => candidate.id),
              ),
              isNotNull(outboundEmailSchema.instantlyEmailId),
            ),
          )
      : [];
  const ownEmailIds = new Set(own.flatMap((row) => (row.id ? [row.id] : [])));
  let answered = 0;

  for (const candidate of candidates) {
    let thread: Awaited<ReturnType<typeof listLeadEmails>>;

    try {
      // oxlint-disable-next-line no-await-in-loop
      thread = await listLeadEmails(candidate.leadEmail);
    } catch (error) {
      // Instantly said no, or is slow: the next run tries again
      logger.warn('Could not read the Instantly thread of {lead}: {error}', {
        lead: candidate.leadEmail,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }

    const manual = findManualReply({ thread, ownEmailIds });
    const sentAt = manual ? emailTimestamp(manual) : null;

    if (manual && sentAt) {
      // oxlint-disable-next-line no-await-in-loop
      const [updated] = await db
        .update(conversationSchema)
        .set({ lastOutboundAt: sentAt })
        .where(
          and(eq(conversationSchema.id, candidate.id), isNull(conversationSchema.lastOutboundAt)),
        )
        .returning({ id: conversationSchema.id });

      if (updated) {
        answered += 1;
        // oxlint-disable-next-line no-await-in-loop
        await logEvent({
          conversationId: candidate.id,
          type: 'reply_sent',
          payload: { source: 'instantly_manual', instantlyEmailId: manual.id, sentAt },
        });
      }
    }

    // oxlint-disable-next-line no-await-in-loop
    await sleep(CALL_SPACING_MS);
  }

  if (answered > 0) {
    logger.info('Recorded {count} replies sent by hand from Instantly', { count: answered });
  }

  return answered;
};
