import { and, eq, inArray } from 'drizzle-orm';
import * as z from 'zod';
import { contactSchema, enrichmentSchema, jobSchema } from '@/models/Schema';
import {
  fetchSequenceBatch,
  submitSequenceBatch,
  writeEmailSequence,
} from '@/services/Copywriting';
import type { Campaign } from '@/services/EmailPrompt';
import { EnrichmentContentValidation } from '@/validations/EnrichmentValidation';
import {
  loadKnowledgeAssets,
  requireCampaign,
  saveSequence,
  syncCampaignStatus,
} from './CampaignWriting';
import { db } from './DB';
import { completeJob, enqueue, rescheduleJob } from './JobQueue';
import { logger } from './Logger';

type Job = typeof jobSchema.$inferSelect;

/** Time spent saving results per run, so one worker request stays inside its limit. */
const RESULT_BUDGET_MS = 45_000;

const writeBatchPayloadSchema = z.object({
  contactIds: z.array(z.string()),
  batchId: z.string().optional(),
  submittedAt: z.iso.datetime().optional(),
  // Contacts already written: the cache warm-up one, then each saved batch result
  doneIds: z.array(z.string()).default([]),
});

type WriteBatchPayload = z.infer<typeof writeBatchPayloadSchema>;

/**
 * Backoff before polling a batch again. Batches usually take minutes to an
 * hour, so they are polled far less often than a Parallel run.
 * @param elapsedMs How long the batch has been in flight.
 * @returns Seconds to wait before polling again.
 */
const batchPollDelaySeconds = (elapsedMs: number) => {
  if (elapsedMs < 300_000) {
    return 60;
  }

  if (elapsedMs < 1_800_000) {
    return 120;
  }

  return 300;
};

/**
 * Hands one contact back to the direct writer after the batch could not write it.
 * @param options The fallback options.
 * @param options.campaign The campaign being written.
 * @param options.contactId The contact to retry.
 * @param options.reason Why the batch left it unwritten.
 */
const writeDirectly = async (options: {
  campaign: Campaign;
  contactId: string;
  reason: string;
}) => {
  logger.warn(
    `Batch left contact ${options.contactId} unwritten (${options.reason}); writing it directly`,
  );

  await enqueue([{ campaignId: options.campaign.id, contactId: options.contactId, type: 'write' }]);
};

/**
 * Claims every researched contact of the campaign for this job. The status
 * update is atomic, so two workers never put the same contact in two batches.
 * @param options The claim options.
 * @param options.jobId The collecting job.
 * @param options.campaignId The campaign to collect from.
 * @returns The payload that now records the claimed contacts.
 */
const claimContacts = async (options: { jobId: string; campaignId: string }) =>
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(contactSchema)
      .set({ status: 'writing' })
      .where(
        and(eq(contactSchema.campaignId, options.campaignId), eq(contactSchema.status, 'enriched')),
      )
      .returning({ id: contactSchema.id });

    const payload: WriteBatchPayload = {
      contactIds: claimed.map((contact) => contact.id),
      doneIds: [],
    };

    await tx.update(jobSchema).set({ payload }).where(eq(jobSchema.id, options.jobId));

    return payload;
  });

/**
 * Builds and submits the batch for the claimed contacts. The first contact is
 * written directly beforehand: batch requests run in parallel, so without a
 * warm cache each one would pay to write the shared brief and documents itself.
 * @param options The submit options.
 * @param options.job The batch job.
 * @param options.campaign The campaign being written.
 * @param options.payload The claimed contacts.
 */
const submitBatch = async (options: {
  job: Job;
  campaign: Campaign;
  payload: WriteBatchPayload;
}) => {
  const contacts = await db
    .select()
    .from(contactSchema)
    .where(inArray(contactSchema.id, options.payload.contactIds));

  const enrichments = await db
    .select()
    .from(enrichmentSchema)
    .where(inArray(enrichmentSchema.contactId, options.payload.contactIds));

  const knowledgeAssets = await loadKnowledgeAssets(options.campaign);

  const requests = contacts
    .filter((contact) => !options.payload.doneIds.includes(contact.id))
    .map((contact) => {
      const enrichment = enrichments.find((item) => item.contactId === contact.id);
      const parsedEnrichment = EnrichmentContentValidation.safeParse(enrichment?.content);

      return {
        customId: contact.id,
        options: {
          campaign: options.campaign,
          contact,
          enrichment: parsedEnrichment.success ? parsedEnrichment.data : null,
          knowledgeAssets,
        },
      };
    });

  const [first] = requests;

  if (!first) {
    await syncCampaignStatus(options.campaign.id);
    await completeJob(options.job.id);

    return;
  }

  // Nothing is done before submission except the warm-up contact
  if (options.payload.doneIds.length === 0) {
    const sequence = await writeEmailSequence(first.options);
    const saved = await saveSequence({
      campaign: options.campaign,
      contactId: first.customId,
      sequence,
    });

    if (!saved) {
      await writeDirectly({
        campaign: options.campaign,
        contactId: first.customId,
        reason: 'unparsable output',
      });
    }

    logger.info(`Warmed the cache for campaign ${options.campaign.id} before its batch`);

    // Submitted on the next pass, while the one-hour cache is fresh
    await rescheduleJob({
      jobId: options.job.id,
      delaySeconds: 0,
      payload: { ...options.payload, doneIds: [first.customId] },
    });

    return;
  }

  const batchId = await submitSequenceBatch({ campaign: options.campaign, requests });

  await rescheduleJob({
    jobId: options.job.id,
    delaySeconds: batchPollDelaySeconds(0),
    payload: { ...options.payload, batchId, submittedAt: new Date().toISOString() },
  });
};

/**
 * Polls the submitted batch and, once it has finished, saves its results a
 * slice at a time. Anything the batch could not write goes to the direct writer.
 * @param options The poll options.
 * @param options.job The batch job.
 * @param options.campaign The campaign being written.
 * @param options.payload The submitted batch and the results already saved.
 * @param options.batchId The provider's batch id.
 */
const collectBatch = async (options: {
  job: Job;
  campaign: Campaign;
  payload: WriteBatchPayload;
  batchId: string;
}) => {
  const outcome = await fetchSequenceBatch({
    campaign: options.campaign,
    batchId: options.batchId,
  });

  if (outcome.state === 'pending') {
    const submittedAt = options.payload.submittedAt
      ? Date.parse(options.payload.submittedAt)
      : Date.now();

    await rescheduleJob({
      jobId: options.job.id,
      delaySeconds: batchPollDelaySeconds(Date.now() - submittedAt),
    });

    return;
  }

  // Contacts deleted while the batch ran have nowhere to store their drafts
  const live = await db
    .select({ id: contactSchema.id })
    .from(contactSchema)
    .where(inArray(contactSchema.id, options.payload.contactIds));

  const pending = new Set(
    live.map((contact) => contact.id).filter((id) => !options.payload.doneIds.includes(id)),
  );

  const done = [...options.payload.doneIds];
  const startedAt = Date.now();

  // Sequential on purpose: each result is a handful of writes, and the budget
  // check needs to run between them
  for (const result of outcome.results) {
    if (!pending.has(result.customId)) {
      continue;
    }

    if (Date.now() - startedAt > RESULT_BUDGET_MS) {
      // oxlint-disable-next-line no-await-in-loop
      await rescheduleJob({
        jobId: options.job.id,
        delaySeconds: 0,
        payload: { ...options.payload, doneIds: done },
      });

      return;
    }

    const contactId = result.customId;

    if ('error' in result) {
      // oxlint-disable-next-line no-await-in-loop
      await writeDirectly({ campaign: options.campaign, contactId, reason: result.error });
    } else {
      // oxlint-disable-next-line no-await-in-loop
      const saved = await saveSequence({
        campaign: options.campaign,
        contactId,
        sequence: result.sequence,
      });

      if (!saved) {
        // oxlint-disable-next-line no-await-in-loop
        await writeDirectly({ campaign: options.campaign, contactId, reason: 'unparsable output' });
      }
    }

    pending.delete(contactId);
    done.push(contactId);
  }

  // Requests the provider never answered, e.g. when the whole batch failed validation
  for (const contactId of pending) {
    // oxlint-disable-next-line no-await-in-loop
    await writeDirectly({ campaign: options.campaign, contactId, reason: 'no result' });
  }

  logger.info(`Saved batch ${options.batchId} for campaign ${options.campaign.id}`);

  await syncCampaignStatus(options.campaign.id);
  await completeJob(options.job.id);
};

/**
 * Writes a campaign's researched contacts through the discounted batch API.
 * One job runs four phases across several worker passes: it claims the
 * contacts, writes one directly to warm the cache, submits the rest as one
 * batch, then polls and saves the results.
 * @param job The batch job being processed.
 */
const runWriteBatchJob = async (job: Job) => {
  const campaign = await requireCampaign(job.campaignId);

  const payload = job.payload
    ? writeBatchPayloadSchema.parse(job.payload)
    : await claimContacts({ jobId: job.id, campaignId: campaign.id });

  if (payload.contactIds.length === 0) {
    await completeJob(job.id);

    return;
  }

  if (!payload.batchId) {
    await submitBatch({ job, campaign, payload });

    return;
  }

  await collectBatch({ job, campaign, payload, batchId: payload.batchId });
};

/**
 * Fails the contacts a batch job still held once it has run out of attempts,
 * leaving the rest of the campaign to carry on.
 * @param job The abandoned batch job.
 * @param message The error to surface.
 */
export const markWriteBatchAbandoned = async (job: Job, message: string) => {
  const payload = writeBatchPayloadSchema.safeParse(job.payload);

  if (!job.campaignId || !payload.success) {
    return;
  }

  // Saved contacts are done, and handed-off ones belong to their own write job
  const unsaved = payload.data.contactIds.filter((id) => !payload.data.doneIds.includes(id));

  if (unsaved.length === 0) {
    return;
  }

  await db
    .update(contactSchema)
    .set({ status: 'failed', errorMessage: message })
    .where(and(inArray(contactSchema.id, unsaved), eq(contactSchema.status, 'writing')));

  await syncCampaignStatus(job.campaignId);
};

export const writeBatchJobHandlers = {
  write_batch: runWriteBatchJob,
};
