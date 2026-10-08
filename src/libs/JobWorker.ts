import { and, eq, inArray } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import { campaignSchema, contactSchema, emailDraftSchema, enrichmentSchema } from '@/models/Schema';
import { writeEmailSequence } from '@/services/Copywriting';
import {
  addLeads,
  buildCampaignPayload,
  buildLeadPayload,
  chunkLeads,
  createCampaign,
} from '@/services/Instantly';
import { createTaskRun, fetchTaskRunResult, PROCESSOR_RUN_COST_MICROS } from '@/services/Parallel';
import { EnrichmentContentValidation } from '@/validations/EnrichmentValidation';
import {
  CampaignBudgetError,
  reserveCampaignBudget,
  reserveSequenceMicros,
  settleCampaignBudget,
} from './CampaignBudget';
import {
  enqueueWriting,
  loadKnowledgeAssets,
  requireCampaign,
  saveSequence,
  syncCampaignStatus,
} from './CampaignWriting';
import {
  checkpointResearch,
  checkpointSequence,
  CopywritingReviewRequiredError,
} from './CopywritingCheckpoint';
import { db } from './DB';
import { observeLeadJob } from './JobObservation';
import {
  claimJobs,
  completeJob,
  failJob,
  pollDelaySeconds,
  releaseStaleJobs,
  rescheduleJob,
} from './JobQueue';
import { LeadEmailReviewRequiredError } from './LeadEmailCheckpoint';
import { leadJobHandlers, markLeadJobAbandoned } from './LeadJobs';
import { logger } from './Logger';
import { recordParallelUsage } from './Usage';
import { markWriteBatchAbandoned, writeBatchJobHandlers } from './WriteBatchJobs';

/** How long Parallel may hold a poll open. Short, so the worker stays snappy. */
const PARALLEL_POLL_TIMEOUT_SECONDS = 5;

type Job = typeof jobSchema.$inferSelect;

const pushPayloadSchema = z.object({
  emailList: z.array(z.string()).min(1),
  timezone: z.string(),
});

/**
 * Loads the contact a job targets.
 * @param contactId The contact to load, when the job carries one.
 * @returns The contact row.
 * @throws {Error} When the job has no contact or the contact is gone.
 */
const requireContact = async (contactId: string | null) => {
  if (!contactId) {
    throw new Error('Job is missing its contact');
  }

  const contact = await db.query.contactSchema.findFirst({
    where: eq(contactSchema.id, contactId),
  });

  if (!contact) {
    throw new Error(`Contact ${contactId} no longer exists`);
  }

  return contact;
};

/**
 * Starts or polls the Parallel research for one contact.
 * The first pass creates the run and reschedules; later passes poll it. Both
 * finish in seconds, so the worker request never blocks on the research.
 * @param job The enrich job being processed.
 */
const runEnrichJob = async (job: Job) => {
  const contact = await requireContact(job.contactId);
  const campaign = await requireCampaign(job.campaignId);

  if (['writing', 'ready', 'approved'].includes(contact.status)) {
    await syncCampaignStatus(campaign.id);
    await completeJob(job.id);
    return;
  }

  const existing = await db.query.enrichmentSchema.findFirst({
    where: eq(enrichmentSchema.contactId, contact.id),
  });

  if (!existing?.parallelRunId) {
    let runId: string;
    if (campaign.budgetMicros === null) {
      const run = await createTaskRun({ contact, processor: campaign.processor });
      runId = run.run_id;
    } else {
      runId = await checkpointResearch({
        jobId: job.id,
        beforeStart: async () => {
          await reserveCampaignBudget({
            campaignId: campaign.id,
            items: [
              {
                operationId: `${job.id}:research`,
                amount: PROCESSOR_RUN_COST_MICROS[campaign.processor],
              },
            ],
          });
        },
        run: async () => {
          const run = await createTaskRun({ contact, processor: campaign.processor });
          return run.run_id;
        },
      });
    }
    const startedAt = new Date();

    await db
      .insert(enrichmentSchema)
      .values({
        contactId: contact.id,
        processor: campaign.processor,
        parallelRunId: runId,
        startedAt,
      })
      .onConflictDoUpdate({
        target: enrichmentSchema.contactId,
        set: { parallelRunId: runId, startedAt, error: null },
      });

    await db
      .update(contactSchema)
      .set({ status: 'enriching' })
      .where(eq(contactSchema.id, contact.id));

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(0) });

    return;
  }

  const outcome = await fetchTaskRunResult({
    runId: existing.parallelRunId,
    timeoutSeconds: PARALLEL_POLL_TIMEOUT_SECONDS,
  });

  if (outcome.state === 'pending') {
    const elapsedMs = Date.now() - (existing.startedAt?.getTime() ?? Date.now());

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(elapsedMs) });

    return;
  }

  if (outcome.state === 'failed') {
    throw new Error(outcome.error);
  }

  // Parallel bills every completed run, whether or not its output parses
  await recordParallelUsage({
    userId: campaign.userId,
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    runId: existing.parallelRunId,
    processor: existing.processor,
  });

  await settleCampaignBudget({
    campaignId: campaign.id,
    operationId: `${job.id}:research`,
    costMicros: PROCESSOR_RUN_COST_MICROS[existing.processor],
  });

  const parsed = EnrichmentContentValidation.safeParse(outcome.content);

  await db
    .update(enrichmentSchema)
    .set({
      content: parsed.success ? parsed.data : { raw: outcome.content },
      basis: outcome.basis,
      personFound: parsed.success ? parsed.data.person_found : null,
      identityConfidence: parsed.success ? parsed.data.identity_match_confidence : null,
      identityReasoning: parsed.success ? parsed.data.identity_match_reasoning : null,
      completedAt: new Date(),
      error: null,
    })
    .where(eq(enrichmentSchema.contactId, contact.id));

  await db
    .update(contactSchema)
    .set({ status: 'enriched' })
    .where(eq(contactSchema.id, contact.id));

  await enqueueWriting({ campaign, contactIds: [contact.id] });
  await syncCampaignStatus(campaign.id);
  await completeJob(job.id);
};

/**
 * Writes the email sequence for one contact and stores the drafts.
 * @param job The write job being processed.
 */
const runWriteJob = async (job: Job) => {
  const contact = await requireContact(job.contactId);
  const campaign = await requireCampaign(job.campaignId);

  if (['ready', 'approved'].includes(contact.status)) {
    await syncCampaignStatus(campaign.id);
    await completeJob(job.id);
    return;
  }

  await db.update(contactSchema).set({ status: 'writing' }).where(eq(contactSchema.id, contact.id));

  const enrichment = await db.query.enrichmentSchema.findFirst({
    where: eq(enrichmentSchema.contactId, contact.id),
  });

  const parsedEnrichment = EnrichmentContentValidation.safeParse(enrichment?.content);

  const knowledgeAssets = await loadKnowledgeAssets(campaign);

  const writeOptions = {
    campaign,
    contact,
    enrichment: parsedEnrichment.success ? parsedEnrichment.data : null,
    knowledgeAssets,
  };
  const operationId = `${job.id}:write:${contact.id}`;
  const sequence = await checkpointSequence({
    jobId: job.id,
    contactId: contact.id,
    beforeStart: async () => {
      await reserveCampaignBudget({
        campaignId: campaign.id,
        items: [{ operationId, amount: reserveSequenceMicros(writeOptions) }],
      });
    },
    run: async () => await writeEmailSequence(writeOptions),
  });

  const saved = await saveSequence({
    campaign,
    contactId: contact.id,
    sequence,
    budgetOperationId: operationId,
  });

  if (!saved) {
    throw new CopywritingReviewRequiredError(
      `${sequence.model} returned no parsable sequence for contact ${contact.id}`,
    );
  }

  await syncCampaignStatus(campaign.id);
  await completeJob(job.id);
};

/**
 * Creates the Instantly campaign and uploads every approved contact.
 * @param job The push job being processed.
 */
const runPushJob = async (job: Job) => {
  const campaign = await requireCampaign(job.campaignId);
  const payload = pushPayloadSchema.parse(job.payload);

  const contacts = await db
    .select()
    .from(contactSchema)
    .where(and(eq(contactSchema.campaignId, campaign.id), eq(contactSchema.status, 'approved')));

  if (contacts.length === 0) {
    throw new Error('No approved contacts to push');
  }

  const contactIds = contacts.map((contact) => contact.id);

  const drafts = await db
    .select()
    .from(emailDraftSchema)
    .where(inArray(emailDraftSchema.contactId, contactIds));

  const enrichments = await db
    .select()
    .from(enrichmentSchema)
    .where(inArray(enrichmentSchema.contactId, contactIds));

  const leads = contacts.map((contact) => {
    const enrichment = enrichments.find((item) => item.contactId === contact.id);
    const parsedEnrichment = EnrichmentContentValidation.safeParse(enrichment?.content);

    return buildLeadPayload({
      contact,
      drafts: drafts.filter((draft) => draft.contactId === contact.id),
      enrichment: parsedEnrichment.success ? parsedEnrichment.data : null,
    });
  });

  // Reuse the campaign from an earlier attempt so a retry does not duplicate it
  const instantlyCampaignId =
    campaign.instantlyCampaignId ??
    (await createCampaign(
      buildCampaignPayload({
        campaign,
        emailList: payload.emailList,
        timezone: payload.timezone,
      }),
    ));

  await db
    .update(campaignSchema)
    .set({ instantlyCampaignId })
    .where(eq(campaignSchema.id, campaign.id));

  // Sequential on purpose: Instantly rate-limits lead imports
  for (const chunk of chunkLeads(leads)) {
    // oxlint-disable-next-line no-await-in-loop
    const result = await addLeads({ campaignId: instantlyCampaignId, leads: chunk });

    logger.info(
      `Pushed ${result.leads_uploaded ?? 0}/${chunk.length} leads to Instantly campaign ${instantlyCampaignId}`,
    );
  }

  await db
    .update(campaignSchema)
    .set({ status: 'pushed', errorMessage: null })
    .where(eq(campaignSchema.id, campaign.id));

  await completeJob(job.id);
};

/**
 * Records the user-visible outcome of a job that ran out of attempts.
 * @param job The abandoned job.
 * @param message The error to surface.
 */
const markAbandoned = async (job: Job, message: string) => {
  if (job.type === 'write_batch') {
    await markWriteBatchAbandoned(job, message);

    return;
  }

  if (!job.campaignId) {
    await markLeadJobAbandoned(job, message);

    return;
  }

  if (job.contactId) {
    await db
      .update(contactSchema)
      .set({ status: 'failed', errorMessage: message })
      .where(
        and(
          eq(contactSchema.id, job.contactId),
          inArray(contactSchema.status, ['pending', 'enriching', 'enriched', 'writing']),
        ),
      );

    // The campaign may now be fully settled, with this contact simply dropped
    await syncCampaignStatus(job.campaignId);

    return;
  }

  await db
    .update(campaignSchema)
    .set({ status: 'failed', errorMessage: message })
    .where(eq(campaignSchema.id, job.campaignId));
};

const handlers = {
  enrich: runEnrichJob,
  write: runWriteJob,
  push: runPushJob,
  ...writeBatchJobHandlers,
  ...leadJobHandlers,
};

/**
 * Drains a slice of the queue.
 * Each call is deliberately small so a single worker request stays well inside
 * serverless time limits; the UI and the cron keep calling until nothing is due.
 * @param limit How many jobs to process in this pass.
 * @returns How many jobs were processed and how many of those threw.
 */
export const processJobs = async (limit: number) => {
  await releaseStaleJobs();

  const jobs = await claimJobs(limit);
  let failed = 0;

  // Sequential on purpose: one job at a time keeps the external APIs, the
  // connection pool and the request duration predictable
  for (const job of jobs) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      await observeLeadJob({
        job,
        run: async () => {
          await handlers[job.type](job);
        },
      });
    } catch (error) {
      failed += 1;

      const message = error instanceof Error ? error.message : String(error);
      // oxlint-disable-next-line no-await-in-loop
      const exhausted = await failJob({
        job,
        error: message,
        retryable: !(
          error instanceof CopywritingReviewRequiredError ||
          error instanceof LeadEmailReviewRequiredError ||
          error instanceof CampaignBudgetError
        ),
      });

      // Passed as a property: LogTape reads `{...}` in the message as a
      // placeholder, which would swallow the JSON body of an API error
      logger.error('Job {jobId} ({type}) failed: {error}', {
        jobId: job.id,
        type: job.type,
        error: message,
      });

      if (error instanceof CampaignBudgetError && job.campaignId) {
        // Keep existing results; no automatic retry of a budget-blocked operation.
        // oxlint-disable-next-line no-await-in-loop
        await db
          .update(campaignSchema)
          .set({ errorMessage: message, budgetBlocked: true })
          .where(eq(campaignSchema.id, job.campaignId));
      }

      if (exhausted) {
        // oxlint-disable-next-line no-await-in-loop
        await markAbandoned(job, message);
      }
    }
  }

  return { processed: jobs.length, failed };
};
