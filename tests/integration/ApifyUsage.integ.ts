import { readFile, readdir } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/models/Schema';

const fixture = await vi.hoisted(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const tables = await import('@/models/Schema');
  const client = new PGlite();
  return { client, db: drizzle(client, { schema: tables }) };
});

vi.mock('@/libs/DB', () => ({ db: fixture.db }));
vi.mock(import('@/services/Apify'), async (original) => ({
  ...(await original()),
  fetchMapsRun: vi.fn(),
  fetchMapsPlaces: vi.fn(),
  startMapsRun: vi.fn(),
}));
const { db, client } = fixture;
const { recordApifyUsage } = await import('@/libs/Usage');
const { reconcileApifyUsage } = await import('@/libs/ApifyUsage');
const { leadJobHandlers } = await import('@/libs/LeadJobs');
const { processJobs } = await import('@/libs/JobWorker');
const provider = await import('@/services/Apify');
const seed = async () => {
  await db
    .insert(schema.organizationSchema)
    .values({ id: 'org', name: 'Test', slug: 'test', createdAt: new Date() });
  await db.insert(schema.userSchema).values({
    id: 'user',
    name: 'Test',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [search] = await db
    .insert(schema.leadSearchSchema)
    .values({
      organizationId: 'org',
      userId: 'user',
      name: 'Test',
      searchTerms: ['Test'],
      location: 'Test',
      maxResults: 1,
    })
    .returning();
  if (!search) {
    throw new Error('Missing search');
  }
  const [lead] = await db
    .insert(schema.leadSchema)
    .values({
      organizationId: 'org',
      leadSearchId: search.id,
      placeId: 'test-place',
      company: 'Test',
      hasWebsite: true,
      status: 'finding_email',
      domain: 'example.com',
      firstName: 'Test',
      lastName: 'Person',
      research: {
        decision_maker_found: true,
        first_name: 'Test',
        last_name: 'Person',
        role: '',
        linkedin_url: '',
        public_email: 'public@example.com',
        public_email_source: '',
        confidence: 'high',
        reasoning: '',
      },
    })
    .returning();
  if (!lead) {
    throw new Error('Missing lead');
  }
  const [job] = await db
    .insert(schema.jobSchema)
    .values({
      leadSearchId: search.id,
      type: 'lead_search',
      runAfter: new Date(0),
    })
    .returning();
  if (!job) {
    throw new Error('Missing job');
  }
  return { search, lead, job };
};

describe('Apify usage', () => {
  beforeAll(async () => {
    const files = await readdir('migrations');
    for (const file of files.filter((name) => name.endsWith('.sql')).toSorted()) {
      // Local in-memory database only; applies the repository's real schema.
      // oxlint-disable-next-line no-await-in-loop
      await client.exec(await readFile(`migrations/${file}`, 'utf-8'));
    }
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    await client.exec('TRUNCATE "user", organization CASCADE');
  });

  afterAll(async () => {
    await client.close();
  });

  it('updates a run cost instead of adding another charge', async () => {
    const { search } = await seed();
    const owner = { userId: 'user', organizationId: 'org', leadSearchId: search.id, runId: 'run' };
    await recordApifyUsage({ ...owner, costMicros: 100 });
    await recordApifyUsage({ ...owner, costMicros: 230 });
    await recordApifyUsage({ ...owner, costMicros: 230 });
    const rows = await db.select().from(schema.apiUsageSchema);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costMicros).toBe(230);
  });
  it('records an explicit zero from the provider', async () => {
    const { search } = await seed();
    await recordApifyUsage({
      userId: 'user',
      organizationId: 'org',
      leadSearchId: search.id,
      runId: 'run',
      costMicros: 0,
    });
    const rows = await db.select().from(schema.apiUsageSchema);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costMicros).toBe(0);
  });
  it('waits before rereading a preliminary cost', async () => {
    const { job, search } = await seed();
    await expect(reconcileApifyUsage({ job, search, runId: 'run', costMicros: 100 })).resolves.toBe(
      false,
    );
    const updated = await db.query.jobSchema.findFirst({ where: eq(schema.jobSchema.id, job.id) });
    expect(updated?.payload?.apifyCost).toMatchObject({ runId: 'run', costMicros: 100 });
    expect(updated?.runAfter.getTime()).toBeGreaterThan(Date.now());
  });
  it('leaves missing costs unknown instead of inserting zero', async () => {
    const { job, search } = await seed();
    const settled = { ...job, payload: { apifyCost: { runId: 'run', observedAt: 0 } } };
    await expect(
      reconcileApifyUsage({ job: settled, search, runId: 'run', costMicros: null }),
    ).rejects.toThrow('cost is unavailable');
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(0);
  });
  it('preserves the last known charge when the provider omits cost', async () => {
    const { job, search } = await seed();
    await recordApifyUsage({
      userId: 'user',
      organizationId: 'org',
      leadSearchId: search.id,
      runId: 'run',
      costMicros: 120,
    });
    await expect(
      reconcileApifyUsage({
        job: { ...job, payload: { apifyCost: { runId: 'run', observedAt: 0 } } },
        search,
        runId: 'run',
        costMicros: null,
      }),
    ).rejects.toThrow('cost is unavailable');
    const rows = await db.select().from(schema.apiUsageSchema);
    expect(rows[0]?.costMicros).toBe(120);
  });
  it.each(['FAILED', 'ABORTED', 'TIMED-OUT'])(
    'records the charge of a %s run before reporting failure',
    async (status) => {
      const { job, search } = await seed();
      await db
        .update(schema.leadSearchSchema)
        .set({ apifyRunId: 'run' })
        .where(eq(schema.leadSearchSchema.id, search.id));
      vi.mocked(provider.fetchMapsRun).mockResolvedValue({
        state: 'failed',
        costMicros: 900,
        error: status,
      });
      await expect(
        leadJobHandlers.lead_search({
          ...job,
          payload: { apifyCost: { runId: 'run', observedAt: 0 } },
        }),
      ).rejects.toThrow(status);
      const rows = await db.select().from(schema.apiUsageSchema);
      expect(rows[0]?.costMicros).toBe(900);
      expect(provider.startMapsRun).not.toHaveBeenCalled();
      expect(provider.fetchMapsPlaces).not.toHaveBeenCalled();
    },
  );
  it('keeps the charge when downloading the dataset fails', async () => {
    const { job, search } = await seed();
    await db
      .update(schema.leadSearchSchema)
      .set({ apifyRunId: 'run' })
      .where(eq(schema.leadSearchSchema.id, search.id));
    vi.mocked(provider.fetchMapsRun).mockResolvedValue({
      state: 'succeeded',
      datasetId: 'dataset',
      costMicros: 700,
    });
    vi.mocked(provider.fetchMapsPlaces).mockRejectedValue(new Error('Dataset unavailable'));
    await expect(
      leadJobHandlers.lead_search({
        ...job,
        payload: { apifyCost: { runId: 'run', observedAt: 0 } },
      }),
    ).rejects.toThrow('Dataset unavailable');
    const rows = await db.select().from(schema.apiUsageSchema);
    expect(rows[0]?.costMicros).toBe(700);
  });
  it('stops polling an unavailable cost after bounded retries without starting a scrape', async () => {
    const { job, search } = await seed();
    await db
      .update(schema.leadSearchSchema)
      .set({ apifyRunId: 'run' })
      .where(eq(schema.leadSearchSchema.id, search.id));
    await db
      .update(schema.jobSchema)
      .set({ payload: { apifyCost: { runId: 'run', observedAt: 0, costMicros: null } } })
      .where(eq(schema.jobSchema.id, job.id));
    vi.mocked(provider.fetchMapsRun).mockResolvedValue({
      state: 'succeeded',
      datasetId: 'dataset',
      costMicros: null,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await db
        .update(schema.jobSchema)
        .set({ runAfter: new Date(0) })
        .where(eq(schema.jobSchema.id, job.id));
      // oxlint-disable-next-line no-await-in-loop
      await processJobs(1);
    }
    const updated = await db.query.jobSchema.findFirst({ where: eq(schema.jobSchema.id, job.id) });
    expect(updated?.status).toBe('failed');
    expect(updated?.lastError).toContain('cost is unavailable');
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(0);
    expect(provider.startMapsRun).not.toHaveBeenCalled();
    expect(provider.fetchMapsPlaces).not.toHaveBeenCalled();
  });
});
