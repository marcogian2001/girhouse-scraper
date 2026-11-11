/**
 * Ticks "Demo vista completamente" on GHL for the leads who watched their demo to the end
 * before the job existed, on the database in `.env`:
 *
 *   npx dotenv -c -- npx tsx scripts/mark-demo-completed.ts
 *   npx dotenv -c -- npx tsx scripts/mark-demo-completed.ts --apply
 *
 * Without `--apply` it only lists them. With it, it queues one `ghl_demo_completed` job per
 * lead, which the deployed worker runs. Test conversations and leads who said stop or not
 * interested are left out: they are no hot leads.
 */
import { parseArgs } from 'node:util';
import { and, eq, isNotNull, notInArray } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { enqueue } from '@/libs/JobQueue';
import { logger } from '@/libs/Logger';
import { conversationSchema, demoSchema } from '@/models/Schema';
import { isDemoCompletedFieldConfigured } from '@/services/GoHighLevel';

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

/** States whose leads are not hot, whatever they watched. */
const CLOSED_STATES: (typeof conversationSchema.$inferSelect)['state'][] = [
  'stop',
  'closed_not_interested',
];

if (!isDemoCompletedFieldConfigured()) {
  logger.error('GHL_OPPORTUNITY_DEMO_COMPLETED_FIELD_ID is not set');
  process.exit(1);
}

const rows = await db
  .select({
    conversationId: conversationSchema.id,
    company: conversationSchema.company,
    email: conversationSchema.leadEmail,
    completedAt: demoSchema.completedAt,
  })
  .from(demoSchema)
  .innerJoin(conversationSchema, eq(conversationSchema.id, demoSchema.conversationId))
  .where(
    and(
      isNotNull(demoSchema.completedAt),
      eq(conversationSchema.isTest, false),
      notInArray(conversationSchema.state, CLOSED_STATES),
    ),
  );

for (const row of rows) {
  logger.info(`${row.completedAt?.toISOString()} ${row.company ?? row.email}`);
}

if (values.apply) {
  await enqueue(
    rows.map((row) => ({
      type: 'ghl_demo_completed' as const,
      payload: { conversationId: row.conversationId },
    })),
  );
}

logger.info(`${values.apply ? 'Queued' : 'Would queue'} ${rows.length} leads`);
process.exit(0);
