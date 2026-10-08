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
// Isolated database and provider responses; no paid requests.
vi.mock('@/libs/DB', () => ({ db: fixture.db }));
vi.mock('@/libs/ApiAuth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    getApiContext: vi.fn(
      async () => await Promise.resolve({ organizationId: 'org', userId: 'user' }),
    ),
    unauthorized: () => NextResponse.json({}, { status: 401 }),
    notFound: () => NextResponse.json({}, { status: 404 }),
  };
});
const { GET } = await import('@/app/api/lead-searches/[id]/status/route');
const { observeLeadJob, observeProviderOperation, observeSavedResult } =
  await import('@/libs/JobObservation');
const { jobObservationSchema } = await import('@/utils/JobObservation');
const { completeJob } = await import('@/libs/JobQueue');
const { db, client } = fixture;
const seed = async (batch = false) => {
  const [organization] = await db
    .insert(schema.organizationSchema)
    .values({
      id: 'org',
      name: 'Test',
      slug: 'test',
      createdAt: new Date(),
    })
    .returning();
  const [user] = await db
    .insert(schema.userSchema)
    .values({
      id: 'user',
      name: 'Test',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  if (!organization || !user) {
    throw new Error('Missing test owner');
  }
  const [campaign] = await db
    .insert(schema.campaignSchema)
    .values({
      organizationId: organization.id,
      userId: user.id,
      name: 'Test',
      emailCount: 1,
      delaysDays: [0],
      copywritingBatch: batch,
      budgetMicros: 1_000_000,
      budgetBlocked: true,
    })
    .returning();
  if (!campaign) {
    throw new Error('Missing test campaign');
  }
  const [contact] = await db
    .insert(schema.contactSchema)
    .values({
      campaignId: campaign.id,
      rowIndex: 0,
      email: 'lead@example.com',
      status: 'failed',
    })
    .returning();
  if (!contact) {
    throw new Error('Missing test contact');
  }
  const [job] = await db
    .insert(schema.jobSchema)
    .values({
      campaignId: campaign.id,
      contactId: contact.id,
      type: batch ? 'write_batch' : 'write',
      runAfter: new Date(0),
      status: 'failed',
      attempts: 5,
      lastError: 'Campaign budget has insufficient available funds; processing stopped',
    })
    .returning();
  if (!job) {
    throw new Error('Missing test job');
  }
  return { campaign, contact, job };
};

describe('Lead job observation', () => {
  beforeAll(async () => {
    const files = await readdir('migrations');
    for (const file of files.filter((name) => name.endsWith('.sql')).toSorted()) {
      // Local in-memory database only; applies the repository's real schema.
      // oxlint-disable-next-line no-await-in-loop
      await client.exec(await readFile(`migrations/${file}`, 'utf-8'));
    }
  }, 30_000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    await client.exec('TRUNCATE "user", organization CASCADE');
  });

  afterAll(async () => {
    await client.close();
  });

  const leadJob = async () => {
    const { campaign, job } = await seed();
    const [search] = await db
      .insert(schema.leadSearchSchema)
      .values({
        organizationId: 'org',
        userId: 'user',
        name: 'Test',
        searchTerms: ['test'],
        location: 'Test',
        maxResults: 1,
      })
      .returning();
    if (!search) {
      throw new Error('Missing search');
    }
    const [updated] = await db
      .update(schema.jobSchema)
      .set({ campaignId: null, contactId: null, leadSearchId: search.id, type: 'lead_search' })
      .where(eq(schema.jobSchema.id, job.id))
      .returning();
    if (!updated) {
      throw new Error('Missing job');
    }
    return { job: updated, campaign };
  };
  const observed = async (jobId: string) => {
    const job = await db.query.jobSchema.findFirst({ where: eq(schema.jobSchema.id, jobId) });
    return jobObservationSchema.parse(job?.observation);
  };

  it('counts operations separately from polls and accumulates repeated passes', async () => {
    const { job } = await leadJob();
    await observeLeadJob({
      job,
      run: async () => {
        await observeProviderOperation({
          provider: 'apify',
          kind: 'starts',
          run: async () => await Promise.resolve('run'),
        });
      },
    });
    await observeLeadJob({
      job,
      run: async () => {
        await observeProviderOperation({
          provider: 'apify',
          kind: 'polls',
          run: async () => await Promise.resolve('pending'),
        });
        observeSavedResult();
      },
    });
    const result = await observed(job.id);
    expect(result.runs).toBe(2);
    expect(result.reused).toBe(1);
    expect(result.providers.apify).toMatchObject({ starts: 1, polls: 1, reads: 0, failed: 0 });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('records failed operations and preserves the original error', async () => {
    const { job } = await leadJob();
    const error = new Error('Response lost');
    await expect(
      observeLeadJob({
        job,
        run: async () => {
          await observeProviderOperation({
            provider: 'parallel',
            kind: 'starts',
            run: async () => await Promise.reject(error),
          });
        },
      }),
    ).rejects.toBe(error);
    const result = await observed(job.id);
    expect(result.failedRuns).toBe(1);
    expect(result.providers.parallel).toMatchObject({ starts: 1, failed: 1 });
  });

  it('does not fail completed work or repeat operations when metrics cannot be saved', async () => {
    const { job } = await leadJob();
    const call = vi.fn(async () => await Promise.resolve('run'));
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('Telemetry unavailable'));
    await observeLeadJob({
      job,
      run: async () => {
        await observeProviderOperation({ provider: 'apify', kind: 'starts', run: call });
        await completeJob(job.id);
      },
    });
    expect(call).toHaveBeenCalledOnce();
    const updated = await db.query.jobSchema.findFirst({ where: eq(schema.jobSchema.id, job.id) });
    expect(updated?.status).toBe('done');
    expect(updated?.observation).toBeNull();
  });

  it('preserves paid payloads and existing observations during concurrent recording', async () => {
    const { job } = await leadJob();
    const payload = { paidResearch: { started: true } };
    await db.update(schema.jobSchema).set({ payload }).where(eq(schema.jobSchema.id, job.id));
    await Promise.all([
      observeLeadJob({
        job,
        run: async () => {
          observeSavedResult();
          await Promise.resolve();
        },
      }),
      observeLeadJob({
        job,
        run: async () => {
          observeSavedResult();
          await Promise.resolve();
        },
      }),
    ]);
    const result = await observed(job.id);
    expect(result.runs).toBe(2);
    expect(result.reused).toBe(2);
    const updated = await db.query.jobSchema.findFirst({ where: eq(schema.jobSchema.id, job.id) });
    expect(updated?.payload).toStrictEqual(payload);
  });

  it('marks malformed old metrics as partial without fabricating old counts', async () => {
    const { job } = await leadJob();
    await client.query('UPDATE job SET observation = $1::jsonb WHERE id = $2', [
      JSON.stringify({ version: 0 }),
      job.id,
    ]);
    await observeLeadJob({
      job,
      run: async () => {
        await Promise.resolve();
      },
    });
    const result = await observed(job.id);
    expect(result.partial).toBe(true);
    expect(result.runs).toBe(1);
  });
  it('publishes the latest measurement revision after all work completes', async () => {
    const { job } = await leadJob();
    const props = { params: Promise.resolve({ id: job.leadSearchId ?? '' }) };
    await observeLeadJob({
      job,
      run: async () => {
        await completeJob(job.id);
      },
    });
    const response = await GET(new Request('http://localhost/api/status'), props);
    const result: unknown = await response.json();
    const metrics = await observed(job.id);
    expect(result).toMatchObject({
      outstandingJobs: 0,
      observationRevision: metrics.lastFinishedAt,
    });
  });
});
