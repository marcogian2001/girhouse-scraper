import { and, count, eq, inArray } from 'drizzle-orm';
import { jobSchema, leadSchema, leadSearchSchema } from '@/models/Schema';
import { fetchMapsRun, startMapsRun, toLeadRow } from '@/services/Apify';
import { verifyEmail } from '@/services/MillionVerifier';
import { createDecisionMakerRun, fetchTaskRunResult } from '@/services/Parallel';
import { findEmail } from '@/services/Prospeo';
import {
  matchesWebsiteFilter,
  OPEN_LEAD_STATUSES,
  pickEmailRoutes,
  readPublicEmail,
  readResearchField,
  uniqueByPlaceId,
} from '@/utils/Leads';
import type { DecisionMaker } from '@/validations/LeadSearchValidation';
import { DecisionMakerValidation } from '@/validations/LeadSearchValidation';
import { db } from './DB';
import { completeJob, pollDelaySeconds, rescheduleJob } from './JobQueue';
import {
  recordApifyUsage,
  recordMillionVerifierUsage,
  recordParallelUsage,
  recordProspeoUsage,
} from './Usage';

/** How long Parallel may hold a poll open. Short, so the worker stays snappy. */
const PARALLEL_POLL_TIMEOUT_SECONDS = 5;

type Job = typeof jobSchema.$inferSelect;

type Lead = typeof leadSchema.$inferSelect;

/**
 * Loads the lead search a job belongs to.
 * @param leadSearchId The lead search to load, when the job carries one.
 * @returns The lead search row.
 * @throws {Error} When the job has no lead search or it no longer exists.
 */
const requireLeadSearch = async (leadSearchId: string | null) => {
  if (!leadSearchId) {
    throw new Error('Job is missing its lead search');
  }

  const search = await db.query.leadSearchSchema.findFirst({
    where: eq(leadSearchSchema.id, leadSearchId),
  });

  if (!search) {
    throw new Error(`Lead search ${leadSearchId} no longer exists`);
  }

  return search;
};

/**
 * Loads the lead a job targets.
 * @param leadId The lead to load, when the job carries one.
 * @returns The lead row.
 * @throws {Error} When the job has no lead or the lead is gone.
 */
const requireLead = async (leadId: string | null) => {
  if (!leadId) {
    throw new Error('Job is missing its lead');
  }

  const lead = await db.query.leadSchema.findFirst({ where: eq(leadSchema.id, leadId) });

  if (!lead) {
    throw new Error(`Lead ${leadId} no longer exists`);
  }

  return lead;
};

/**
 * Picks the contact fields out of the decision maker research.
 * Without a confirmed decision maker the lead is still mailed, addressed to the business.
 * @param research The research Parallel returned, when it parsed.
 * @returns The lead columns describing the decision maker.
 */
const toContactFields = (research: DecisionMaker | null) => {
  const person = research?.decision_maker_found ? research : null;

  return {
    firstName: readResearchField(person?.first_name),
    lastName: readResearchField(person?.last_name),
    role: readResearchField(person?.role),
    linkedinUrl: readResearchField(person?.linkedin_url),
  };
};

/**
 * Marks a lead search as done once none of its leads is still being worked on.
 * @param leadSearchId The lead search to refresh.
 */
const syncLeadSearchStatus = async (leadSearchId: string) => {
  const search = await requireLeadSearch(leadSearchId);

  if (search.status !== 'qualifying') {
    return;
  }

  const [open] = await db
    .select({ total: count() })
    .from(leadSchema)
    .where(
      and(
        eq(leadSchema.leadSearchId, leadSearchId),
        inArray(leadSchema.status, [...OPEN_LEAD_STATUSES]),
      ),
    );

  if ((open?.total ?? 0) === 0) {
    await db
      .update(leadSearchSchema)
      .set({ status: 'done' })
      .where(eq(leadSearchSchema.id, leadSearchId));
  }
};

/**
 * Starts or polls the Google Maps scrape of a lead search, then stores its places.
 * @param job The lead search job being processed.
 */
const runLeadSearchJob = async (job: Job) => {
  const search = await requireLeadSearch(job.leadSearchId);

  if (!search.apifyRunId) {
    const runId = await startMapsRun({
      searchTerms: search.searchTerms,
      location: search.location,
      maxResults: search.maxResults,
    });

    await db
      .update(leadSearchSchema)
      .set({ apifyRunId: runId })
      .where(eq(leadSearchSchema.id, search.id));

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(0) });

    return;
  }

  const outcome = await fetchMapsRun(search.apifyRunId);

  if (outcome.state === 'pending') {
    const elapsedMs = Date.now() - search.createdAt.getTime();

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(elapsedMs) });

    return;
  }

  if (outcome.state === 'failed') {
    throw new Error(outcome.error);
  }

  // Apify bills every place scraped, including those dropped below
  await recordApifyUsage({
    userId: search.userId,
    organizationId: search.organizationId,
    leadSearchId: search.id,
    runId: search.apifyRunId,
    places: outcome.places.length,
  });

  const rows = uniqueByPlaceId(outcome.places)
    .slice(0, search.maxResults)
    .map((place) => {
      const row = toLeadRow(place);
      const wanted = matchesWebsiteFilter({
        hasWebsite: row.hasWebsite,
        filter: search.websiteFilter,
      });

      return {
        ...row,
        leadSearchId: search.id,
        organizationId: search.organizationId,
        status: wanted ? ('found' as const) : ('filtered_out' as const),
      };
    });

  // One transaction, so a retry never leaves leads behind without their jobs
  await db.transaction(async (tx) => {
    // A business another search already found is skipped, so it is never paid for twice
    const inserted =
      rows.length > 0
        ? await tx
            .insert(leadSchema)
            .values(rows)
            .onConflictDoNothing()
            .returning({ id: leadSchema.id, status: leadSchema.status })
        : [];

    const jobs = inserted
      .filter((lead) => lead.status === 'found')
      .map((lead) => ({
        leadSearchId: search.id,
        leadId: lead.id,
        type: 'lead_research' as const,
      }));

    if (jobs.length > 0) {
      await tx.insert(jobSchema).values(jobs);
    }

    await tx
      .update(leadSearchSchema)
      .set({ status: 'qualifying' })
      .where(eq(leadSearchSchema.id, search.id));
  });

  await syncLeadSearchStatus(search.id);
  await completeJob(job.id);
};

/**
 * Starts or polls the Parallel research that finds a lead's decision maker.
 * @param job The lead research job being processed.
 */
const runLeadResearchJob = async (job: Job) => {
  const lead = await requireLead(job.leadId);
  const search = await requireLeadSearch(lead.leadSearchId);

  if (!lead.parallelRunId) {
    const run = await createDecisionMakerRun({ lead, processor: search.processor });

    await db
      .update(leadSchema)
      .set({ parallelRunId: run.run_id, researchStartedAt: new Date(), status: 'researching' })
      .where(eq(leadSchema.id, lead.id));

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(0) });

    return;
  }

  const outcome = await fetchTaskRunResult({
    runId: lead.parallelRunId,
    timeoutSeconds: PARALLEL_POLL_TIMEOUT_SECONDS,
  });

  if (outcome.state === 'pending') {
    const elapsedMs = Date.now() - (lead.researchStartedAt?.getTime() ?? Date.now());

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(elapsedMs) });

    return;
  }

  if (outcome.state === 'failed') {
    throw new Error(outcome.error);
  }

  // Parallel bills every completed run, whether or not its output parses
  await recordParallelUsage({
    userId: search.userId,
    organizationId: search.organizationId,
    leadSearchId: search.id,
    runId: lead.parallelRunId,
    processor: search.processor,
  });

  const parsed = DecisionMakerValidation.safeParse(outcome.content);
  const research = parsed.success ? parsed.data : null;
  const contact = toContactFields(research);

  const routes = pickEmailRoutes({
    lead: { domain: lead.domain, ...contact },
    publicEmail: readPublicEmail(research?.public_email),
  });

  const hasRoute = routes.prospeo || routes.publicEmail;

  await db
    .update(leadSchema)
    .set({
      ...contact,
      research: research ?? { raw: outcome.content },
      status: hasRoute ? 'finding_email' : 'no_email',
    })
    .where(eq(leadSchema.id, lead.id));

  if (hasRoute) {
    await db
      .insert(jobSchema)
      .values({ leadSearchId: search.id, leadId: lead.id, type: 'lead_email' });
  }

  await syncLeadSearchStatus(search.id);
  await completeJob(job.id);
};

/**
 * Looks up a deliverable email for a lead: Prospeo first, then the address the
 * business publishes, checked with MillionVerifier.
 * @param options The call options.
 * @param options.lead The lead to find an email for.
 * @param options.search The lead search the lead belongs to, billed for the calls.
 * @returns The email columns to store, or null when no deliverable address was found.
 */
const findLeadEmail = async (options: {
  lead: Lead;
  search: typeof leadSearchSchema.$inferSelect;
}) => {
  const { lead, search } = options;
  const research = DecisionMakerValidation.safeParse(lead.research);
  const publicEmail = readPublicEmail(research.success ? research.data.public_email : undefined);
  const routes = pickEmailRoutes({ lead, publicEmail });
  const owner = {
    userId: search.userId,
    organizationId: search.organizationId,
    leadSearchId: search.id,
    leadId: lead.id,
  };

  if (routes.prospeo && lead.domain && lead.firstName && lead.lastName) {
    const match = await findEmail({
      firstName: lead.firstName,
      lastName: lead.lastName,
      domain: lead.domain,
    });

    if (match) {
      if (match.charged) {
        await recordProspeoUsage(owner);
      }

      return {
        email: match.email,
        emailSource: 'prospeo' as const,
        emailVerification: 'valid' as const,
      };
    }
  }

  if (!publicEmail) {
    return null;
  }

  const verdict = await verifyEmail(publicEmail);

  await recordMillionVerifierUsage(owner);

  return verdict === 'valid' || verdict === 'catch_all'
    ? { email: publicEmail, emailSource: 'public' as const, emailVerification: verdict }
    : null;
};

/**
 * Finds and verifies the email of a lead.
 * @param job The lead email job being processed.
 */
const runLeadEmailJob = async (job: Job) => {
  const lead = await requireLead(job.leadId);
  const search = await requireLeadSearch(lead.leadSearchId);

  const found = await findLeadEmail({ lead, search });

  await db
    .update(leadSchema)
    .set(found ? { ...found, status: 'ready' } : { status: 'no_email' })
    .where(eq(leadSchema.id, lead.id));

  await syncLeadSearchStatus(search.id);
  await completeJob(job.id);
};

/**
 * Records the user-visible outcome of a lead search job that ran out of attempts.
 * @param job The abandoned job.
 * @param message The error to surface.
 */
export const markLeadJobAbandoned = async (job: Job, message: string) => {
  if (job.leadId) {
    await db
      .update(leadSchema)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(leadSchema.id, job.leadId));

    if (job.leadSearchId) {
      // The search may now be fully settled, with this lead simply dropped
      await syncLeadSearchStatus(job.leadSearchId);
    }

    return;
  }

  if (job.leadSearchId) {
    await db
      .update(leadSearchSchema)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(leadSearchSchema.id, job.leadSearchId));
  }
};

export const leadJobHandlers = {
  lead_search: runLeadSearchJob,
  lead_research: runLeadResearchJob,
  lead_email: runLeadEmailJob,
};
