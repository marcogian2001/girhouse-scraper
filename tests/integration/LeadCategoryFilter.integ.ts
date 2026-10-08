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
vi.mock('@/services/GooglePlaces', () => ({ fetchAreaViewport: vi.fn(), scanRectangle: vi.fn() }));
vi.mock('@/services/Parallel', () => ({
  createDecisionMakerRun: vi.fn(),
  fetchTaskRunResult: vi.fn(),
}));
vi.mock('@/services/Prospeo', () => ({ findEmail: vi.fn() }));
vi.mock('@/services/MillionVerifier', () => ({ verifyEmail: vi.fn() }));
const { db, client } = fixture;
const { leadJobHandlers } = await import('@/libs/LeadJobs');
const maps = await import('@/services/Apify');
const parallel = await import('@/services/Parallel');
const google = await import('@/services/GooglePlaces');

const seed = async (allowedCategories: string[]) => {
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
      searchTerms: ['test'],
      location: 'Test',
      locationPlaceId: 'area',
      maxResults: 1,
      allowedCategories,
    })
    .returning();
  if (!search) {
    throw new Error('Missing search');
  }
  const [job] = await db
    .insert(schema.jobSchema)
    .values({ leadSearchId: search.id, type: 'lead_search' })
    .returning();
  if (!job) {
    throw new Error('Missing job');
  }
  return { search, job };
};

const store = async (allowedCategories: string[]) => {
  const { search, job } = await seed(allowedCategories);
  await db
    .update(schema.leadSearchSchema)
    .set({ apifyRunId: 'run', scrapeRounds: 3 })
    .where(eq(schema.leadSearchSchema.id, search.id));
  vi.mocked(maps.fetchMapsRun).mockResolvedValue({
    state: 'succeeded',
    datasetId: 'dataset',
    costMicros: 0,
  });
  vi.mocked(maps.fetchMapsPlaces).mockResolvedValue([
    { placeId: 'excluded', title: 'Dentist', categoryName: 'Dentista' },
    { placeId: 'unknown', title: 'Unknown' },
    { placeId: 'allowed', title: 'Beauty', categoryName: '  CENTRO\t estetico  ' },
  ]);
  await leadJobHandlers.lead_search({
    ...job,
    payload: { apifyCost: { runId: 'run', observedAt: 0 } },
  });
  return { search, job };
};

const reserve = async (options: { allowedCategories: string[]; category: string | null }) => {
  const { search, job } = await seed(options.allowedCategories);
  const [area] = await db
    .insert(schema.searchAreaSchema)
    .values({ organizationId: 'org', locationPlaceId: 'area', searchTerm: 'test' })
    .returning();
  if (!area) {
    throw new Error('Missing area');
  }
  await db
    .insert(schema.discoveredPlaceSchema)
    .values({ searchAreaId: area.id, placeId: 'reserve', scrapedAt: new Date() });
  const [lead] = await db
    .insert(schema.leadSchema)
    .values({
      organizationId: 'org',
      leadSearchId: search.id,
      placeId: 'reserve',
      company: 'Test',
      hasWebsite: true,
      status: 'reserve',
      category: options.category,
    })
    .returning();
  if (!lead) {
    throw new Error('Missing lead');
  }
  await leadJobHandlers.lead_search(job);
  return { lead, search };
};

const expectNoExternalCalls = () => {
  expect(maps.startMapsRun).not.toHaveBeenCalled();
  expect(parallel.createDecisionMakerRun).not.toHaveBeenCalled();
  expect(google.scanRectangle).not.toHaveBeenCalled();
  expect(google.fetchAreaViewport).not.toHaveBeenCalled();
};

describe('Lead category filter', () => {
  beforeAll(async () => {
    const files = await readdir('migrations');
    for (const file of files.filter((name) => name.endsWith('.sql')).toSorted()) {
      // oxlint-disable-next-line no-await-in-loop
      await client.exec(await readFile(`migrations/${file}`, 'utf-8'));
    }
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Unexpected network call');
      }),
    );
    await client.exec('TRUNCATE "user", organization CASCADE');
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await client.close();
  });

  it('queues research only for admitted Maps categories', async () => {
    await store(['centro estetico']);
    const leads = await db.select().from(schema.leadSchema);
    expect(
      leads
        .map((lead) => [lead.placeId, lead.status])
        .toSorted((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '')),
    ).toStrictEqual([
      ['allowed', 'found'],
      ['excluded', 'reserve'],
      ['unknown', 'reserve'],
    ]);
    const jobs = await db
      .select()
      .from(schema.jobSchema)
      .where(eq(schema.jobSchema.type, 'lead_research'));
    expect(jobs.map((job) => job.leadId)).toStrictEqual(
      leads.filter((lead) => lead.placeId === 'allowed').map((lead) => lead.id),
    );
    expectNoExternalCalls();
  });

  it('preserves the old selection when the filter is empty', async () => {
    await store([]);
    const leads = await db.select().from(schema.leadSchema);
    expect(leads.find((lead) => lead.status === 'found')?.placeId).toBe('excluded');
  });

  it('reuses a matching reserve without another Maps run', async () => {
    const { lead, search } = await reserve({
      allowedCategories: ['centro estetico'],
      category: '\t CENTRO\n  estetico \t',
    });
    const updatedLead = await db.query.leadSchema.findFirst({
      where: eq(schema.leadSchema.id, lead.id),
    });
    expect(updatedLead?.status).toBe('found');
    const updatedSearch = await db.query.leadSearchSchema.findFirst({
      where: eq(schema.leadSearchSchema.id, search.id),
    });
    expect(updatedSearch?.reserveClaimed).toBe(1);
    expectNoExternalCalls();
  });

  it.each(['Dentista', null, 'Centro estetico medico'])(
    'keeps an excluded reserve category %s without enrichment jobs',
    async (category) => {
      const { lead } = await reserve({ allowedCategories: ['centro estetico'], category });
      const updatedLead = await db.query.leadSchema.findFirst({
        where: eq(schema.leadSchema.id, lead.id),
      });
      expect(updatedLead?.status).toBe('reserve');
      expect(
        await db.select().from(schema.jobSchema).where(eq(schema.jobSchema.type, 'lead_research')),
      ).toHaveLength(0);
      expectNoExternalCalls();
    },
  );

  it('reuses an unknown reserve when the filter is empty', async () => {
    const { lead } = await reserve({ allowedCategories: [], category: null });
    const updatedLead = await db.query.leadSchema.findFirst({
      where: eq(schema.leadSchema.id, lead.id),
    });
    expect(updatedLead?.status).toBe('found');
    expectNoExternalCalls();
  });
});
