import * as z from 'zod';
import type { jobSchema, leadSearchSchema } from '@/models/Schema';
import { rescheduleJob } from './JobQueue';
import { recordApifyUsage } from './Usage';

const receiptSchema = z.object({ runId: z.string(), observedAt: z.number() });
const SETTLE_MS = 15_000;

/**
 * Re-reads terminal run costs after Apify's settlement delay, without starting a run.
 * @param options The terminal run and queue context.
 * @param options.job The job polling the run.
 * @param options.search The owner of the scrape.
 * @param options.runId The provider run identifier.
 * @param options.costMicros The provider cost, or null when unavailable.
 * @returns Whether settlement is complete and processing can continue.
 */
export const reconcileApifyUsage = async (options: {
  job: typeof jobSchema.$inferSelect;
  search: typeof leadSearchSchema.$inferSelect;
  runId: string;
  costMicros: number | null;
}) => {
  if (options.costMicros !== null) {
    await recordApifyUsage({
      userId: options.search.userId,
      organizationId: options.search.organizationId,
      leadSearchId: options.search.id,
      runId: options.runId,
      costMicros: options.costMicros,
    });
  }
  const prior = receiptSchema.safeParse(options.job.payload?.apifyCost);
  const observedAt =
    prior.success && prior.data.runId === options.runId ? prior.data.observedAt : Date.now();
  const remaining = SETTLE_MS - (Date.now() - observedAt);
  if (remaining > 0) {
    await rescheduleJob({
      jobId: options.job.id,
      delaySeconds: Math.ceil(remaining / 1000),
      payload: { apifyCost: { runId: options.runId, observedAt, costMicros: options.costMicros } },
    });
    return false;
  }
  if (options.costMicros === null) {
    // Normal bounded job retries poll this same run; absence never means zero.
    throw new Error('Apify cost is unavailable; run requires cost reconciliation');
  }
  return true;
};
