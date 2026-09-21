import { and, eq, inArray } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import {
  campaignSchema,
  contactSchema,
  emailDraftSchema,
  enrichmentSchema,
  knowledgeAssetSchema,
} from '@/models/Schema';
import { COPYWRITING_MODEL, writeEmailSequence } from '@/services/Claude';
import {
  addLeads,
  buildCampaignPayload,
  buildLeadPayload,
  chunkLeads,
  createCampaign,
} from '@/services/Instantly';
import { createTaskRun, fetchTaskRunResult } from '@/services/Parallel';
import { EnrichmentContentValidation } from '@/validations/EnrichmentValidation';
import { db } from './DB';
import {
  claimJobs,
  completeJob,
  enqueue,
  failJob,
  pollDelaySeconds,
  releaseStaleJobs,
  rescheduleJob,
} from './JobQueue';
import { logger } from './Logger';

/** How long Parallel may hold a poll open. Short, so the worker stays snappy. */
const PARALLEL_POLL_TIMEOUT_SECONDS = 5;

type Job = typeof jobSchema.$inferSelect;

const pushPayloadSchema = z.object({
  emailList: z.array(z.string()).min(1),
  timezone: z.string(),
});

/**
 * Loads the campaign a job belongs to.
 * @param campaignId The campaign to load.
 * @returns The campaign row.
 * @throws {Error} When the campaign no longer exists.
 */
const requireCampaign = async (campaignId: string) => {
  const campaign = await db.query.campaignSchema.findFirst({
    where: eq(campaignSchema.id, campaignId),
  });

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} no longer exists`);
  }

  return campaign;
};

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
 * Derives the campaign status from where its contacts are.
 * Terminal campaign states are left alone: a campaign being pushed is no longer
 * described by its contacts.
 * @param campaignId The campaign to refresh.
 */
const syncCampaignStatus = async (campaignId: string) => {
  const campaign = await requireCampaign(campaignId);

  if (['pushing', 'pushed', 'failed'].includes(campaign.status)) {
    return;
  }

  const contacts = await db
    .select({ status: contactSchema.status })
    .from(contactSchema)
    .where(eq(contactSchema.campaignId, campaignId));

  const has = (...statuses: (typeof contactSchema.$inferSelect)['status'][]) =>
    contacts.some((contact) => statuses.includes(contact.status));

  let status: (typeof campaignSchema.$inferSelect)['status'] = 'review';

  if (has('pending', 'enriching')) {
    status = 'enriching';
  } else if (has('enriched', 'writing')) {
    status = 'writing';
  }

  if (status !== campaign.status) {
    await db.update(campaignSchema).set({ status }).where(eq(campaignSchema.id, campaignId));
  }
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

  const existing = await db.query.enrichmentSchema.findFirst({
    where: eq(enrichmentSchema.contactId, contact.id),
  });

  if (!existing?.parallelRunId) {
    const run = await createTaskRun({ contact, processor: campaign.processor });
    const startedAt = new Date();

    await db
      .insert(enrichmentSchema)
      .values({
        contactId: contact.id,
        processor: campaign.processor,
        parallelRunId: run.run_id,
        startedAt,
      })
      .onConflictDoUpdate({
        target: enrichmentSchema.contactId,
        set: { parallelRunId: run.run_id, startedAt, error: null },
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

  await enqueue([{ campaignId: campaign.id, contactId: contact.id, type: 'write' }]);
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

  await db.update(contactSchema).set({ status: 'writing' }).where(eq(contactSchema.id, contact.id));

  const enrichment = await db.query.enrichmentSchema.findFirst({
    where: eq(enrichmentSchema.contactId, contact.id),
  });

  const parsedEnrichment = EnrichmentContentValidation.safeParse(enrichment?.content);

  const knowledgeAssets =
    campaign.knowledgeAssetIds.length > 0
      ? await db
          .select()
          .from(knowledgeAssetSchema)
          .where(inArray(knowledgeAssetSchema.id, campaign.knowledgeAssetIds))
      : [];

  const emails = await writeEmailSequence({
    campaign,
    contact,
    enrichment: parsedEnrichment.success ? parsedEnrichment.data : null,
    knowledgeAssets,
  });

  // Upserted so a retry after a partial write refreshes the drafts in place
  await Promise.all(
    emails.map((email) =>
      db
        .insert(emailDraftSchema)
        .values({
          contactId: contact.id,
          stepIndex: email.step,
          subject: email.subject,
          body: email.body,
          model: COPYWRITING_MODEL,
        })
        .onConflictDoUpdate({
          target: [emailDraftSchema.contactId, emailDraftSchema.stepIndex],
          set: {
            subject: email.subject,
            body: email.body,
            model: COPYWRITING_MODEL,
            edited: false,
          },
        }),
    ),
  );

  await db.update(contactSchema).set({ status: 'ready' }).where(eq(contactSchema.id, contact.id));

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
  if (job.contactId) {
    await db
      .update(contactSchema)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(contactSchema.id, job.contactId));

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
      await handlers[job.type](job);
    } catch (error) {
      failed += 1;

      const message = error instanceof Error ? error.message : String(error);
      // oxlint-disable-next-line no-await-in-loop
      const exhausted = await failJob({ job, error: message });

      // Passed as a property: LogTape reads `{...}` in the message as a
      // placeholder, which would swallow the JSON body of an API error
      logger.error('Job {jobId} ({type}) failed: {error}', {
        jobId: job.id,
        type: job.type,
        error: message,
      });

      if (exhausted) {
        // oxlint-disable-next-line no-await-in-loop
        await markAbandoned(job, message);
      }
    }
  }

  return { processed: jobs.length, failed };
};
