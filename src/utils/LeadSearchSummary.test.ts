import { describe, expect, it } from 'vitest';
import type { JobObservation } from './JobObservation';
import { summarizeLeadSearch } from './LeadSearchSummary';

const base = {
  category: 'Centro estetico',
  hasWebsite: true,
  email: null,
  emailVerification: null,
};
const sample: JobObservation = {
  version: 1,
  runs: 2,
  failedRuns: 1,
  firstStartedAt: '2026-10-08T10:00:00.000Z',
  lastFinishedAt: '2026-10-08T10:01:00.000Z',
  elapsedMs: 2500,
  reused: 1,
  partial: false,
  providers: { parallel: { starts: 1, polls: 1, reads: 0, failed: 0, elapsedMs: 1000 } },
};
describe('Lead search summary', () => {
  it('separates reserve, missing emails, review and blocked leads', () => {
    const result = summarizeLeadSearch({
      websiteFilter: 'any',
      allowedCategories: ['centro estetico'],
      jobs: [{ type: 'lead_research', status: 'failed', observation: null }],
      leads: [
        { ...base, status: 'ready', email: 'a@example.com', emailVerification: 'valid' },
        { ...base, status: 'ready', email: 'a@example.com', emailVerification: 'catch_all' },
        { ...base, status: 'no_email' },
        { ...base, status: 'failed' },
        { ...base, status: 'researching' },
        { ...base, status: 'reserve', category: 'Dentista' },
      ],
    });
    expect(result).toMatchObject({
      collected: 6,
      matching: 5,
      emailFound: 1,
      pending: 1,
      noEmail: 1,
      review: 1,
      blocked: 1,
      failedJobs: 1,
      reserve: 1,
    });
    expect(result.stages[1]).toMatchObject({ measured: 0, partial: true });
    expect(result.providers).toStrictEqual([]);
  });

  it('aggregates observed time without reconstructing unmeasured jobs', () => {
    const result = summarizeLeadSearch({
      leads: [],
      websiteFilter: 'any',
      allowedCategories: [],
      jobs: [
        { type: 'lead_research', status: 'done', observation: sample },
        { type: 'lead_research', status: 'done', observation: null },
      ],
    });
    expect(result.stages[1]).toMatchObject({
      jobs: 2,
      measured: 1,
      runs: 2,
      errors: 1,
      activeMs: 2500,
      spanMs: 60_000,
      reuses: 1,
      partial: true,
    });
    expect(result.providers).toStrictEqual([
      { provider: 'parallel', starts: 1, polls: 1, reads: 0, failed: 0, elapsedMs: 1000 },
    ]);
  });
});
