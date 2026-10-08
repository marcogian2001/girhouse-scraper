import type { JobObservation } from './JobObservation';
import { jobObservationSchema, observationProviderSchema } from './JobObservation';
import { matchesCategoryFilter, matchesWebsiteFilter, RESERVE_LEAD_STATUSES } from './Leads';

export const summarizeLeadSearch = (options: {
  leads: {
    email: string | null;
    emailVerification: string | null;
    status: string;
    category: string | null;
    hasWebsite: boolean;
  }[];
  jobs: { type: string; status: string; observation: JobObservation | null }[];
  websiteFilter: 'any' | 'with' | 'without';
  allowedCategories: string[];
}) => {
  const active = options.leads.filter(
    (lead) => !RESERVE_LEAD_STATUSES.some((status) => status === lead.status),
  );
  const emails = new Set(
    options.leads
      .filter((lead) => lead.email?.trim())
      .map((lead) => lead.email?.trim().toLowerCase()),
  );
  const stages = ['lead_search', 'lead_research', 'lead_email'].map((type) => {
    const jobs = options.jobs.filter((job) => job.type === type);
    const observations = jobs
      .map((job) => jobObservationSchema.safeParse(job.observation))
      .filter((result) => result.success)
      .map((result) => result.data);
    return {
      type,
      jobs: jobs.length,
      measured: observations.length,
      runs: observations.reduce((sum, item) => sum + item.runs, 0),
      errors: observations.reduce((sum, item) => sum + item.failedRuns, 0),
      spanMs: observations.length
        ? Math.max(...observations.map((item) => Date.parse(item.lastFinishedAt))) -
          Math.min(...observations.map((item) => Date.parse(item.firstStartedAt)))
        : 0,
      activeMs: observations.reduce((sum, item) => sum + item.elapsedMs, 0),
      reuses: observations.reduce((sum, item) => sum + item.reused, 0),
      partial:
        observations.some((item) => item.partial) ||
        observations.length < jobs.length ||
        jobs.some((job) => job.status !== 'done'),
    };
  });
  const observations = options.jobs
    .map((job) => jobObservationSchema.safeParse(job.observation))
    .filter((result) => result.success)
    .map((result) => result.data);
  const providers = observationProviderSchema.options.flatMap((provider) => {
    const entries = observations.flatMap((item) =>
      item.providers[provider] ? [item.providers[provider]] : [],
    );
    return entries.length
      ? [
          {
            provider,
            starts: entries.reduce((sum, item) => sum + item.starts, 0),
            polls: entries.reduce((sum, item) => sum + item.polls, 0),
            reads: entries.reduce((sum, item) => sum + item.reads, 0),
            failed: entries.reduce((sum, item) => sum + item.failed, 0),
            elapsedMs: entries.reduce((sum, item) => sum + item.elapsedMs, 0),
          },
        ]
      : [];
  });
  return {
    collected: options.leads.length,
    matching: options.leads.filter(
      (lead) =>
        matchesCategoryFilter({
          category: lead.category,
          allowedCategories: options.allowedCategories,
        }) && matchesWebsiteFilter({ hasWebsite: lead.hasWebsite, filter: options.websiteFilter }),
    ).length,
    emailFound: emails.size,
    pending: active.filter((lead) =>
      ['found', 'researching', 'finding_email'].includes(lead.status),
    ).length,
    noEmail: active.filter((lead) => lead.status === 'no_email').length,
    review: active.filter(
      (lead) =>
        lead.status === 'ready' && (!lead.email?.trim() || lead.emailVerification !== 'valid'),
    ).length,
    blocked: active.filter((lead) => lead.status === 'failed').length,
    failedJobs: options.jobs.filter((job) => job.status === 'failed').length,
    reserve: options.leads.length - active.length,
    stages,
    providers,
  };
};
