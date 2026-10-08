import { and, eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { jobSchema } from '@/models/Schema';
import { verifyEmail } from '@/services/MillionVerifier';
import { findEmail } from '@/services/Prospeo';
import { db } from './DB';
import { observeProviderOperation, observeSavedResult } from './JobObservation';

/** Stops retries when an email provider may already have charged the request. */
export class LeadEmailReviewRequiredError extends Error {
  override name = 'LeadEmailReviewRequiredError';
}

const matchSchema = z.object({ email: z.string(), charged: z.boolean() }).nullable();
const verdictSchema = z.enum(['valid', 'catch_all', 'invalid', 'unknown']);

const checkpoint = async <Result>(options: {
  jobId: string;
  provider: 'prospeo' | 'millionverifier';
  schema: z.ZodType<Result>;
  run: () => Promise<Result | 'rate_limited'>;
}) => {
  const key = `leadEmail:${options.provider}`;
  const operationId = `${options.jobId}:${options.provider}`;
  const job = await db.query.jobSchema.findFirst({ where: eq(jobSchema.id, options.jobId) });
  if (!job) {
    throw new Error('Email job no longer exists');
  }
  const state = job.payload?.[key];
  if (state !== undefined) {
    const saved = z.object({ result: options.schema }).safeParse(state);
    if (saved.success) {
      observeSavedResult();
      return { operationId, result: saved.data.result };
    }
    throw new LeadEmailReviewRequiredError(
      'Email request outcome is unknown; inspect the provider',
    );
  }
  const [claimed] = await db
    .update(jobSchema)
    .set({
      payload: sql`coalesce(${jobSchema.payload}, '{}'::jsonb) || ${JSON.stringify({ [key]: { started: true } })}::jsonb`,
    })
    .where(and(eq(jobSchema.id, options.jobId), sql`${jobSchema.payload} -> ${key} is null`))
    .returning({ id: jobSchema.id });
  if (!claimed) {
    throw new LeadEmailReviewRequiredError('Email request already claimed; inspect its outcome');
  }
  let result: Result | 'rate_limited';
  try {
    result = await observeProviderOperation({
      provider: options.provider,
      kind: 'starts',
      run: options.run,
    });
  } catch {
    throw new LeadEmailReviewRequiredError(
      'Email request outcome is unknown; inspect the provider',
    );
  }
  // A confirmed rate limit did not perform an enrichment and can safely wait.
  if (result === 'rate_limited') {
    await db
      .update(jobSchema)
      .set({ payload: sql`${jobSchema.payload} - ${key}` })
      .where(eq(jobSchema.id, options.jobId));
    return { operationId, result };
  }
  await db
    .update(jobSchema)
    .set({
      payload: sql`coalesce(${jobSchema.payload}, '{}'::jsonb) || ${JSON.stringify({ [key]: { result } })}::jsonb`,
    })
    .where(eq(jobSchema.id, options.jobId));
  return { operationId, result };
};

export const checkpointEmailLookup = async (options: {
  jobId: string;
  firstName: string;
  lastName: string;
  domain: string;
}) =>
  await checkpoint({
    jobId: options.jobId,
    provider: 'prospeo',
    schema: matchSchema,
    run: async () => await findEmail(options),
  });

export const checkpointEmailVerification = async (options: { jobId: string; email: string }) =>
  await checkpoint({
    jobId: options.jobId,
    provider: 'millionverifier',
    schema: verdictSchema,
    run: async () => await verifyEmail(options.email),
  });
