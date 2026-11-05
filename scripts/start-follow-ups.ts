/**
 * Starts the two follow-ups for the leads who got their demo in the last 10 days and have
 * been silent since, on the database in `.env`:
 *
 *   npx dotenv -c -- npx tsx scripts/start-follow-ups.ts
 *   npx dotenv -c -- npx tsx scripts/start-follow-ups.ts --apply
 *
 * Without `--apply` it only lists who would get them and when. The first follow-up is due a
 * day after the email with the demo; when that time is past, within the next hour, spread
 * out. Run it only once the follow-up job is deployed, or the running code clears the times.
 * A conversation whose demo was sent by hand from Instantly is read there, a few seconds apart.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { and, eq, gt, isNotNull, isNull, notInArray, or } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getConversationDemo } from '@/libs/Demos';
import { mayFollowUp, startFollowUps, startFollowUpsAfterHandSent } from '@/libs/FollowUpStart';
import { logger } from '@/libs/Logger';
import { conversationSchema, outboundEmailSchema } from '@/models/Schema';
import { emailText, findManualReply, listLeadEmails } from '@/services/Instantly';
import { isBusinessTime, toBusinessTime } from '@/utils/BusinessHours';
import { FOLLOW_UP_STATES, followUpDueAt, mentionsDemo } from '@/utils/FollowUps';
import { stripQuotedReply } from '@/utils/ReplyText';

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

/** How far back the email with the demo may have left. */
const LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000;

/** Between two Instantly reads, inside its limit of 20 calls a minute. */
const CALL_SPACING_MS = 3500;

/** States a lead is never followed up from, whatever their latest email. */
const CLOSED_STATES: (typeof conversationSchema.$inferSelect)['state'][] = [
  'stop',
  'call_booked',
  'closed_not_interested',
  'closed_no_reply',
  'wrong_person',
  'whatsapp',
];

/** The business hours the follow-ups go out in, as in Automazione by default. */
const HOURS = { startHour: 9, endHour: 18, everyDay: true };

/**
 * Picks when a lead's first follow-up is due: a day after the email with the demo, or soon
 * when that is past, spread over the next hour so they do not all leave at once.
 * @param sentAt When the email with the demo left.
 * @returns The due time.
 */
const dueTimeFor = (sentAt: Date) => {
  const planned = followUpDueAt({ from: sentAt, hours: HOURS });
  const now = Date.now();

  if (planned.getTime() > now) {
    return planned;
  }

  const spreadMs = (5 + Math.random() * 55) * 60_000;
  const soon = new Date(now + spreadMs);

  return isBusinessTime(soon, HOURS)
    ? soon
    : new Date(toBusinessTime(soon, HOURS).getTime() + spreadMs);
};

/**
 * Reads the latest email sent by hand from Instantly, in its own words.
 * @param conversation The conversation.
 * @returns The text of the email, or null when there is none.
 */
const latestHandSentText = async (conversation: typeof conversationSchema.$inferSelect) => {
  const own = await db
    .select({ id: outboundEmailSchema.instantlyEmailId })
    .from(outboundEmailSchema)
    .where(
      and(
        eq(outboundEmailSchema.conversationId, conversation.id),
        isNotNull(outboundEmailSchema.instantlyEmailId),
      ),
    );
  const thread = await listLeadEmails(conversation.leadEmail);
  const manual = findManualReply({
    thread,
    ownEmailIds: new Set(own.flatMap((row) => row.id ?? [])),
  });

  if (!manual) {
    return null;
  }

  const text = emailText(manual);

  return stripQuotedReply(text) || text;
};

const candidates = await db
  .select()
  .from(conversationSchema)
  .where(
    and(
      eq(conversationSchema.isTest, false),
      eq(conversationSchema.followUpCount, 0),
      isNull(conversationSchema.nextActionAt),
      notInArray(conversationSchema.state, CLOSED_STATES),
      gt(conversationSchema.lastOutboundAt, new Date(Date.now() - LOOKBACK_MS)),
      or(
        isNull(conversationSchema.lastInboundAt),
        gt(conversationSchema.lastOutboundAt, conversationSchema.lastInboundAt),
      ),
    ),
  );

const rows: Record<string, string>[] = [];

for (const conversation of candidates) {
  const sentAt = conversation.lastOutboundAt;

  if (!sentAt) {
    continue;
  }

  const dueAt = dueTimeFor(sentAt);
  const byHand = !FOLLOW_UP_STATES.has(conversation.state);
  // oxlint-disable-next-line no-await-in-loop
  const text = byHand ? await latestHandSentText(conversation) : null;

  if (byHand) {
    // oxlint-disable-next-line no-await-in-loop
    await sleep(CALL_SPACING_MS);
  }

  // oxlint-disable-next-line no-await-in-loop
  const demo = byHand ? await getConversationDemo(conversation.id) : null;

  // An email sent by hand starts the follow-ups only when it carries the demo link
  if (byHand && (!demo || !text || !mentionsDemo(text, demo.demo.slug))) {
    continue;
  }

  // A demo sent by hand counts once the state moves on, as it will when applied
  // oxlint-disable-next-line no-await-in-loop
  const eligible = await mayFollowUp(
    byHand ? { ...conversation, state: 'demo_sent' } : conversation,
  );

  if (!eligible) {
    continue;
  }

  let started: Date | null = dueAt;

  if (values.apply) {
    const start = byHand
      ? startFollowUpsAfterHandSent({
          conversationId: conversation.id,
          text: text ?? '',
          sentAt,
          dueAt,
        })
      : startFollowUps({ conversationId: conversation.id, sentAt, dueAt });

    // oxlint-disable-next-line no-await-in-loop
    started = await start;
  }

  if (started) {
    rows.push({
      company: conversation.company ?? conversation.leadEmail,
      state: conversation.state,
      via: byHand ? 'Instantly' : 'state',
      sentAt: sentAt.toISOString(),
      dueAt: started.toISOString(),
    });
  }
}

console.table(rows);
logger.info(
  `${values.apply ? 'Started' : 'Would start'} follow-ups for ${rows.length} of ${candidates.length} conversations`,
);
process.exit(0);
