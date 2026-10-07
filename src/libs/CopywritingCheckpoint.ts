import { and, eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { jobSchema } from '@/models/Schema';
import { emailSequenceSchema } from '@/services/EmailPrompt';
import { COPYWRITING_MODEL_IDS } from '@/utils/CopywritingModels';
import { db } from './DB';

/** Stops automatic paid retries when the previous outcome needs inspection. */
export class CopywritingReviewRequiredError extends Error {
  override name = 'CopywritingReviewRequiredError';
}

const sequenceSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.enum(COPYWRITING_MODEL_IDS),
  externalId: z.string(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheWriteTokens: z.number(),
    cacheReadTokens: z.number(),
  }),
  costMicros: z.number(),
  emails: emailSequenceSchema.shape.emails.nullable(),
});

/**
 * Claims a paid operation atomically and keeps its result for database-only retries.
 * A lost response requires inspection; it must never silently start another paid operation.
 * @param options The job, result schema and paid operation.
 * @returns The stored or newly generated result.
 */
const checkpoint = async <Result>(options: {
  jobId: string;
  key: string;
  schema: z.ZodType<Result>;
  run: () => Promise<Result>;
  beforeStart?: () => Promise<void>;
}) => {
  const job = await db.query.jobSchema.findFirst({ where: eq(jobSchema.id, options.jobId) });
  if (!job) {
    throw new Error('Copywriting job no longer exists');
  }
  const state = job.payload?.[options.key];
  if (state !== undefined) {
    const saved = z.object({ result: options.schema }).safeParse(state);
    if (saved.success) {
      return saved.data.result;
    }
    throw new CopywritingReviewRequiredError(
      'Paid request outcome is unknown; inspect the provider before retrying',
    );
  }

  await options.beforeStart?.();

  const [claimed] = await db
    .update(jobSchema)
    .set({
      payload: sql`coalesce(${jobSchema.payload}, '{}'::jsonb) || ${JSON.stringify({ [options.key]: { started: true } })}::jsonb`,
    })
    .where(
      and(eq(jobSchema.id, options.jobId), sql`${jobSchema.payload} -> ${options.key} is null`),
    )
    .returning({ id: jobSchema.id });

  if (!claimed) {
    throw new CopywritingReviewRequiredError(
      'Paid request already claimed; inspect its outcome before retrying',
    );
  }

  const result = await options.run();
  await db
    .update(jobSchema)
    .set({
      payload: sql`coalesce(${jobSchema.payload}, '{}'::jsonb) || ${JSON.stringify({ [options.key]: { result } })}::jsonb`,
    })
    .where(eq(jobSchema.id, options.jobId));
  return result;
};

/**
 * Reuses a paid sequence after an interrupted database save.
 * @param options The job and generation callback.
 * @returns The sequence already paid for.
 */
export const checkpointSequence = async (options: {
  jobId: string;
  contactId: string;
  run: () => Promise<z.infer<typeof sequenceSchema>>;
  beforeStart?: () => Promise<void>;
}) =>
  await checkpoint({
    ...options,
    key: `paidSequence:${options.contactId}`,
    schema: sequenceSchema,
  });

/**
 * Reuses a submitted batch id after an interrupted queue update.
 * @param options The job and submission callback.
 * @returns The submitted batch identifier.
 */
export const checkpointBatch = async (options: {
  jobId: string;
  run: () => Promise<string>;
  beforeStart?: () => Promise<void>;
}) => await checkpoint({ ...options, key: 'paidBatch', schema: z.string().min(1) });

export const checkpointResearch = async (options: {
  jobId: string;
  run: () => Promise<string>;
  beforeStart: () => Promise<void>;
}) => await checkpoint({ ...options, key: 'paidResearch', schema: z.string().min(1) });
