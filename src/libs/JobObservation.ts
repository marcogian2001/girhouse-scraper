import { AsyncLocalStorage } from 'node:async_hooks';
import { eq } from 'drizzle-orm';
import { jobSchema } from '@/models/Schema';
import type { ObservationProvider, JobObservation } from '@/utils/JobObservation';
import { jobObservationSchema, observationProviderSchema } from '@/utils/JobObservation';
import { db } from './DB';
import { logger } from './Logger';

const observation = new AsyncLocalStorage<JobObservation>();

/**
 * Counts application provider operations without changing their outcome.
 * @param options The provider, operation kind and original call.
 * @returns The unmodified provider response.
 */
export const observeProviderOperation = async <Result>(options: {
  provider: ObservationProvider;
  kind: 'starts' | 'polls' | 'reads';
  run: () => Promise<Result>;
}) => {
  const current = observation.getStore();
  if (!current) {
    return await options.run();
  }
  const stats = current.providers[options.provider] ?? {
    starts: 0,
    polls: 0,
    reads: 0,
    failed: 0,
    elapsedMs: 0,
  };
  current.providers[options.provider] = stats;
  stats[options.kind] += 1;
  const start = performance.now();
  try {
    return await options.run();
  } catch (error) {
    stats.failed += 1;
    throw error;
  } finally {
    stats.elapsedMs += Math.max(0, Math.round(performance.now() - start));
  }
};

/** Counts a saved email operation reused in the current job execution. */
export const observeSavedResult = () => {
  const current = observation.getStore();
  if (current) {
    current.reused += 1;
  }
};

const saveObservation = async (options: { jobId: string; sample: JobObservation }) => {
  await db.transaction(async (tx) => {
    const [job] = await tx
      .select({ observation: jobSchema.observation })
      .from(jobSchema)
      .where(eq(jobSchema.id, options.jobId))
      .for('update');
    if (!job) {
      return;
    }
    const parsed = jobObservationSchema.safeParse(job.observation);
    const previous = parsed.success ? parsed.data : null;
    const merged = { ...options.sample, providers: { ...options.sample.providers } };
    if (previous) {
      merged.lastFinishedAt =
        previous.lastFinishedAt > merged.lastFinishedAt
          ? previous.lastFinishedAt
          : merged.lastFinishedAt;
      merged.runs += previous.runs;
      merged.failedRuns += previous.failedRuns;
      merged.elapsedMs += previous.elapsedMs;
      merged.reused += previous.reused;
      merged.partial ||= previous.partial;
      merged.firstStartedAt =
        previous.firstStartedAt < merged.firstStartedAt
          ? previous.firstStartedAt
          : merged.firstStartedAt;
      for (const key of observationProviderSchema.options) {
        const old = previous.providers[key];
        if (!old) {
          continue;
        }
        const next = merged.providers[key] ?? {
          starts: 0,
          polls: 0,
          reads: 0,
          failed: 0,
          elapsedMs: 0,
        };
        merged.providers[key] = {
          starts: next.starts + old.starts,
          polls: next.polls + old.polls,
          reads: next.reads + old.reads,
          failed: next.failed + old.failed,
          elapsedMs: next.elapsedMs + old.elapsedMs,
        };
      }
    }
    merged.partial ||= job.observation !== null && !parsed.success;
    await tx.update(jobSchema).set({ observation: merged }).where(eq(jobSchema.id, options.jobId));
  });
};

/**
 * Records one lead job pass without retrying work when telemetry fails.
 * @param options The lead job and its original handler.
 */
export const observeLeadJob = async (options: {
  job: typeof jobSchema.$inferSelect;
  run: () => Promise<void>;
}) => {
  if (!options.job.leadSearchId) {
    await options.run();
    return;
  }
  const sample: JobObservation = {
    version: 1,
    runs: 1,
    failedRuns: 0,
    firstStartedAt: new Date().toISOString(),
    lastFinishedAt: new Date().toISOString(),
    elapsedMs: 0,
    reused: 0,
    partial: options.job.attempts > 0 && options.job.observation === null,
    providers: {},
  };
  const start = performance.now();
  try {
    await observation.run(sample, options.run);
  } catch (error) {
    sample.failedRuns = 1;
    throw error;
  } finally {
    sample.elapsedMs = Math.max(0, Math.round(performance.now() - start));
    sample.lastFinishedAt = new Date().toISOString();
    await saveObservation({ jobId: options.job.id, sample }).catch(() => {
      logger.warn('Observation unavailable for job {jobId}', { jobId: options.job.id });
    });
  }
};
