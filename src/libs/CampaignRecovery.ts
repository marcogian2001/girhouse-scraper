import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import * as z from 'zod';
import { campaignSchema, contactSchema, enrichmentSchema, jobSchema } from '@/models/Schema';
import type { CampaignRecoveryValidation } from '@/validations/CampaignRecoveryValidation';
import { sequenceSchema } from './CopywritingCheckpoint';
import { db } from './DB';

type Campaign = typeof campaignSchema.$inferSelect;
type Job = typeof jobSchema.$inferSelect;
type Contact = typeof contactSchema.$inferSelect;
type Enrichment = typeof enrichmentSchema.$inferSelect;

const budgetErrors = new Set([
  'Campaign budget has insufficient available funds; processing stopped',
  'Campaign budget is blocked; manual review required',
]);
const batchPayload = z.object({
  contactIds: z.array(z.string()),
  doneIds: z.array(z.string()).default([]),
  batchId: z.string().min(1).optional(),
});

const inspectCheckpoints = (payload: Record<string, unknown>) => {
  for (const [key, state] of Object.entries(payload).filter(([name]) => name.startsWith('paid'))) {
    if (!key.startsWith('paidSequence:') && !['paidResearch', 'paidBatch'].includes(key)) {
      return 'manual' as const;
    }
    const schema = key.startsWith('paidSequence:') ? sequenceSchema : z.string().min(1);
    const saved = z.object({ result: schema }).safeParse(state);
    if (!saved.success) {
      return 'uncertain' as const;
    }
    if (typeof saved.data.result !== 'string' && !saved.data.result.emails) {
      return 'manual' as const;
    }
  }
  return null;
};

const savedBatch = (options: { payload: Record<string, unknown>; contacts: Contact[] }) => {
  const batch = batchPayload.safeParse(options.payload);
  if (
    !batch.success ||
    batch.data.contactIds.some((id) => !options.contacts.some((item) => item.id === id))
  ) {
    return 'manual' as const;
  }
  const checkpoint = z.object({ result: z.string().min(1) }).safeParse(options.payload.paidBatch);
  if (batch.data.batchId && checkpoint.success && batch.data.batchId !== checkpoint.data.result) {
    return 'manual' as const;
  }
  return batch.data.batchId || checkpoint.success ? ('saved' as const) : null;
};

/**
 * Classifies failed work without clearing or fabricating a paid-call checkpoint.
 * @param options The job and its campaign-owned contacts and research.
 * @returns The recoverable work type, or a reason requiring technical review.
 */
const inspectRecoveryJob = (options: {
  job: Job;
  contacts: Contact[];
  enrichments: Enrichment[];
}) => {
  const { job } = options;
  const payload = job.payload ?? {};
  const checkpointProblem = inspectCheckpoints(payload);
  if (checkpointProblem) {
    return checkpointProblem;
  }
  if (!['enrich', 'write', 'write_batch'].includes(job.type)) {
    return 'manual' as const;
  }
  if (job.type === 'write_batch') {
    const result = savedBatch({ payload, contacts: options.contacts });
    if (result) {
      return result;
    }
  } else {
    if (!options.contacts.some((item) => item.id === job.contactId)) {
      return 'manual' as const;
    }
    if (
      job.type === 'write' &&
      z.object({ result: sequenceSchema }).safeParse(payload[`paidSequence:${job.contactId}`])
        .success
    ) {
      return 'saved' as const;
    }
    if (job.type === 'enrich') {
      const run = options.enrichments.find(
        (item) => item.contactId === job.contactId,
      )?.parallelRunId;
      const checkpoint = z.object({ result: z.string().min(1) }).safeParse(payload.paidResearch);
      if (run && checkpoint.success && run !== checkpoint.data.result) {
        return 'manual' as const;
      }
      if (run || checkpoint.success) {
        return 'saved' as const;
      }
    }
  }
  return budgetErrors.has(job.lastError ?? '') ? ('budget' as const) : ('manual' as const);
};

/**
 * Summarises recorded budget operations and safe recovery candidates.
 * @param options The current campaign rows.
 * @returns A revision-bound review that cannot authorise unknown paid requests.
 */
export const buildRecoveryReview = (options: {
  campaign: Campaign;
  jobs: Job[];
  contacts: Contact[];
  enrichments: Enrichment[];
}) => {
  const jobs = options.jobs.toSorted((a, b) => a.id.localeCompare(b.id));
  const candidates = jobs
    .filter((job) => job.status === 'failed')
    .map((job) => ({
      id: job.id,
      type: job.type,
      error: job.lastError,
      disposition: inspectRecoveryJob({
        job,
        contacts: options.contacts,
        enrichments: options.enrichments,
      }),
    }));
  const parsedLedger = z
    .record(z.string(), z.object({ amount: z.number().int().nonnegative(), settled: z.boolean() }))
    .safeParse(options.campaign.budgetOperations);
  const operations = Object.entries(parsedLedger.success ? parsedLedger.data : {}).map(
    ([id, operation]) => ({
      id,
      amount: operation.amount,
      state: operation.settled ? ('recorded' as const) : ('reserved' as const),
    }),
  );
  const recordedMicros = operations
    .filter((op) => op.state === 'recorded')
    .reduce((sum, op) => sum + op.amount, 0);
  const reservedMicros = operations
    .filter((op) => op.state === 'reserved')
    .reduce((sum, op) => sum + op.amount, 0);
  const ledgerConsistent =
    parsedLedger.success &&
    recordedMicros + reservedMicros === options.campaign.budgetCommittedMicros;
  const unresolvedReservations = operations.filter(
    (op) =>
      op.state === 'reserved' &&
      !jobs.some((job) => op.id.startsWith(`${job.id}:`) && job.status !== 'done'),
  ).length;
  const queuedUncertain = jobs.filter(
    (job) =>
      job.status === 'queued' &&
      inspectRecoveryJob({ job, contacts: options.contacts, enrichments: options.enrichments }) ===
        'uncertain',
  ).length;
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        campaign: options.campaign,
        jobs,
        contacts: options.contacts.toSorted((a, b) => a.id.localeCompare(b.id)),
        enrichments: options.enrichments.toSorted((a, b) => a.contactId.localeCompare(b.contactId)),
      }),
    )
    .digest('hex');
  return {
    revision,
    ledgerConsistent,
    recordedMicros,
    reservedMicros,
    operations,
    candidates,
    running: jobs.some((job) => job.status === 'running'),
    uncertain:
      candidates.filter((item) => item.disposition === 'uncertain').length +
      unresolvedReservations +
      queuedUncertain,
    manual: candidates.filter((item) => item.disposition === 'manual').length,
    resumable: candidates.filter((item) => ['saved', 'budget'].includes(item.disposition)).length,
  };
};

/**
 * Reads a campaign recovery review inside its organization.
 * @param options The authorized organization and campaign.
 * @returns The campaign and review, or null when unavailable.
 */
export const getCampaignRecovery = async (options: {
  campaignId: string;
  organizationId: string;
}) => {
  const campaign = await db.query.campaignSchema.findFirst({
    where: and(
      eq(campaignSchema.id, options.campaignId),
      eq(campaignSchema.organizationId, options.organizationId),
    ),
  });
  if (!campaign) {
    return null;
  }
  const [jobs, contacts, enrichments] = await Promise.all([
    db.select().from(jobSchema).where(eq(jobSchema.campaignId, campaign.id)),
    db.select().from(contactSchema).where(eq(contactSchema.campaignId, campaign.id)),
    db
      .select({ enrichment: enrichmentSchema })
      .from(enrichmentSchema)
      .innerJoin(contactSchema, eq(contactSchema.id, enrichmentSchema.contactId))
      .where(eq(contactSchema.campaignId, campaign.id)),
  ]);
  return {
    campaign,
    review: buildRecoveryReview({
      campaign,
      jobs,
      contacts,
      enrichments: enrichments.map((row) => row.enrichment),
    }),
  };
};

export class CampaignRecoveryError extends Error {
  override name = 'CampaignRecoveryError';
}

const validateRecovery = (options: {
  campaign: Campaign;
  review: ReturnType<typeof buildRecoveryReview>;
  request: z.infer<typeof CampaignRecoveryValidation>;
}) => {
  const { campaign, review, request } = options;
  if (request.revision !== review.revision) {
    throw new CampaignRecoveryError('stale');
  }
  if (
    campaign.budgetMicros === null ||
    campaign.archivedAt ||
    ['pushing', 'pushed'].includes(campaign.status)
  ) {
    throw new CampaignRecoveryError('unavailable');
  }
  const budgetMicros = Math.round(request.budgetUsd * 1_000_000);
  if (
    budgetMicros < campaign.budgetMicros ||
    budgetMicros < campaign.budgetCommittedMicros ||
    (request.action === 'increase' && budgetMicros === campaign.budgetMicros)
  ) {
    throw new CampaignRecoveryError('budget');
  }
  if (review.running) {
    throw new CampaignRecoveryError('running');
  }
  if (!review.ledgerConsistent) {
    throw new CampaignRecoveryError('review');
  }
  if (
    request.action === 'resume' &&
    (review.uncertain || review.manual || review.resumable === 0)
  ) {
    throw new CampaignRecoveryError('review');
  }
  return budgetMicros;
};

const recoveryContactIds = (job: Job) => {
  if (job.type !== 'write_batch') {
    return job.contactId ? [job.contactId] : [];
  }
  const batch = batchPayload.safeParse(job.payload);
  return batch.success
    ? batch.data.contactIds.filter((id) => !batch.data.doneIds.includes(id))
    : [];
};

/**
 * Raises a budget or requeues reconciled work atomically, preserving paid results.
 * @param options The authorized scope and explicitly reviewed request.
 * @returns The number of existing jobs resumed; this operation never calls a provider.
 */
export const recoverCampaign = async (options: {
  campaignId: string;
  organizationId: string;
  request: z.infer<typeof CampaignRecoveryValidation>;
}) =>
  await db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaignSchema)
      .where(
        and(
          eq(campaignSchema.id, options.campaignId),
          eq(campaignSchema.organizationId, options.organizationId),
        ),
      )
      .for('update');
    if (!campaign) {
      throw new CampaignRecoveryError('not_found');
    }
    const jobs = await tx
      .select()
      .from(jobSchema)
      .where(eq(jobSchema.campaignId, campaign.id))
      .for('update');
    const contacts = await tx
      .select()
      .from(contactSchema)
      .where(eq(contactSchema.campaignId, campaign.id))
      .for('update');
    const enrichments = await tx
      .select({ enrichment: enrichmentSchema })
      .from(enrichmentSchema)
      .innerJoin(contactSchema, eq(contactSchema.id, enrichmentSchema.contactId))
      .where(eq(contactSchema.campaignId, campaign.id));
    const review = buildRecoveryReview({
      campaign,
      jobs,
      contacts,
      enrichments: enrichments.map((row) => row.enrichment),
    });
    const budgetMicros = validateRecovery({ campaign, review, request: options.request });
    if (options.request.action === 'increase') {
      await tx
        .update(campaignSchema)
        .set({ budgetMicros })
        .where(eq(campaignSchema.id, campaign.id));
      return { resumed: 0 };
    }
    for (const candidate of review.candidates) {
      const job = jobs.find((item) => item.id === candidate.id);
      if (!job) {
        continue;
      }
      const contactIds = recoveryContactIds(job);
      if (contactIds.length > 0) {
        // oxlint-disable-next-line no-await-in-loop
        await tx
          .update(contactSchema)
          .set({ status: job.type === 'enrich' ? 'pending' : 'writing', errorMessage: null })
          .where(
            and(
              inArray(contactSchema.id, contactIds),
              eq(contactSchema.campaignId, campaign.id),
              eq(contactSchema.status, 'failed'),
            ),
          );
      }
      // Requeue the same job and keep its payload and operation identifiers.
      // oxlint-disable-next-line no-await-in-loop
      await tx
        .update(jobSchema)
        .set({
          status: 'queued',
          attempts: 0,
          lastError: null,
          lockedAt: null,
          runAfter: new Date(),
        })
        .where(eq(jobSchema.id, job.id));
    }
    await tx
      .update(campaignSchema)
      .set({
        budgetMicros,
        budgetBlocked: false,
        errorMessage: null,
        status: review.candidates.some((item) => item.type === 'enrich') ? 'enriching' : 'writing',
      })
      .where(eq(campaignSchema.id, campaign.id));
    return { resumed: review.resumable };
  });
