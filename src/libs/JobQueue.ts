import { and, asc, eq, inArray, lt, lte } from 'drizzle-orm';
import { jobSchema } from '@/models/Schema';
import { db } from './DB';

/** A job that keeps failing is abandoned rather than retried forever. */
const MAX_ATTEMPTS = 5;

/** A job left running past this point is assumed to belong to a dead worker. */
const STALE_LOCK_MS = 5 * 60 * 1000;

type Job = typeof jobSchema.$inferSelect;

/**
 * Backoff before retrying a job that threw.
 * @param attempts How many times the job has already failed.
 * @returns Seconds to wait before the next attempt.
 */
export const retryDelaySeconds = (attempts: number) =>
  Math.min(20 * 2 ** Math.max(attempts - 1, 0), 300);

/**
 * Backoff before polling a Parallel run again. Long-running research is polled
 * less often the longer it has been going, to keep the worker cheap.
 * @param elapsedMs How long the run has been in flight.
 * @returns Seconds to wait before polling again.
 */
export const pollDelaySeconds = (elapsedMs: number) => {
  if (elapsedMs < 60_000) {
    return 15;
  }

  if (elapsedMs < 300_000) {
    return 30;
  }

  return 60;
};

/**
 * Adds jobs to the queue.
 * @param jobs The jobs to enqueue.
 */
export const enqueue = async (jobs: (typeof jobSchema.$inferInsert)[]) => {
  if (jobs.length === 0) {
    return;
  }

  await db.insert(jobSchema).values(jobs);
};

/**
 * Returns jobs abandoned by a worker that died mid-run to the queue.
 */
export const releaseStaleJobs = async () => {
  await db
    .update(jobSchema)
    .set({ status: 'queued', lockedAt: null })
    .where(
      and(
        eq(jobSchema.status, 'running'),
        lt(jobSchema.lockedAt, new Date(Date.now() - STALE_LOCK_MS)),
      ),
    );
};

/**
 * Takes ownership of the next due jobs.
 * Locks the rows with `SKIP LOCKED` so concurrent workers never pick the same
 * job, then flips them to `running` in the same transaction.
 * @param limit How many jobs to claim at most.
 * @returns The claimed jobs.
 */
export const claimJobs = async (limit: number): Promise<Job[]> =>
  await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: jobSchema.id })
      .from(jobSchema)
      .where(and(eq(jobSchema.status, 'queued'), lte(jobSchema.runAfter, new Date())))
      .orderBy(asc(jobSchema.runAfter))
      .limit(limit)
      .for('update', { skipLocked: true });

    if (due.length === 0) {
      return [];
    }

    return await tx
      .update(jobSchema)
      .set({ status: 'running', lockedAt: new Date() })
      .where(
        inArray(
          jobSchema.id,
          due.map((job) => job.id),
        ),
      )
      .returning();
  });

/**
 * Marks a job as finished.
 * @param jobId The job to close.
 */
export const completeJob = async (jobId: string) => {
  await db.update(jobSchema).set({ status: 'done', lockedAt: null }).where(eq(jobSchema.id, jobId));
};

/**
 * Puts a job back in the queue without counting it as a failure.
 * Used while waiting on an external run that has not finished yet.
 * @param options The call options.
 * @param options.jobId The job to reschedule.
 * @param options.delaySeconds How long to wait before picking it up again.
 */
export const rescheduleJob = async (options: { jobId: string; delaySeconds: number }) => {
  await db
    .update(jobSchema)
    .set({
      status: 'queued',
      lockedAt: null,
      runAfter: new Date(Date.now() + options.delaySeconds * 1000),
    })
    .where(eq(jobSchema.id, options.jobId));
};

/**
 * Records a failed attempt, retrying with backoff until the attempt cap.
 * @param options The call options.
 * @param options.job The job that threw.
 * @param options.error The message to store for the user.
 * @returns Whether the job has been abandoned for good.
 */
export const failJob = async (options: { job: Job; error: string }) => {
  const attempts = options.job.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;

  await db
    .update(jobSchema)
    .set({
      attempts,
      lastError: options.error,
      lockedAt: null,
      status: exhausted ? 'failed' : 'queued',
      runAfter: new Date(Date.now() + retryDelaySeconds(attempts) * 1000),
    })
    .where(eq(jobSchema.id, options.job.id));

  return exhausted;
};
