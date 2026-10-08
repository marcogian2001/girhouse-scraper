import { readFile, readdir } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/models/Schema';
import type * as Copywriting from '@/services/Copywriting';
import type { WrittenSequence } from '@/services/EmailPrompt';

const fixture = await vi.hoisted(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const tables = await import('@/models/Schema');
  const client = new PGlite();
  return { client, db: drizzle(client, { schema: tables }) };
});
// Isolated database and provider responses; no paid requests.
vi.mock('@/libs/DB', () => ({ db: fixture.db }));
vi.mock(import('@/services/Copywriting'), () => ({
  writeEmailSequence: vi.fn<typeof Copywriting.writeEmailSequence>(),
  submitSequenceBatch: vi.fn<typeof Copywriting.submitSequenceBatch>(),
  fetchSequenceBatch: vi.fn<typeof Copywriting.fetchSequenceBatch>(),
}));

vi.mock(import('@/services/Parallel'), async (original) => ({
  ...(await original()),
  createTaskRun: vi.fn(),
  fetchTaskRunResult: vi.fn(),
}));
vi.mock('@/libs/ApiAuth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    getApiContext: vi.fn(),
    unauthorized: () => NextResponse.json({}, { status: 401 }),
    notFound: () => NextResponse.json({}, { status: 404 }),
  };
});
const { GET, POST } = await import('@/app/api/campaigns/[id]/recovery/route');
const { getApiContext } = await import('@/libs/ApiAuth');
const { getCampaignRecovery, recoverCampaign } = await import('@/libs/CampaignRecovery');
const { processJobs } = await import('@/libs/JobWorker');
const providers = await import('@/services/Copywriting');
const parallel = await import('@/services/Parallel');
const { db, client } = fixture;
const sequence: WrittenSequence = {
  provider: 'anthropic',
  model: 'claude-opus-5',
  externalId: 'response-1',
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  costMicros: 30,
  emails: [{ step: 1, subject: 'Example', body: 'Example body' }],
};

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

const reviewFor = async (campaignId: string) => {
  const result = await getCampaignRecovery({ campaignId, organizationId: 'org' });
  if (!result) {
    throw new Error('Missing recovery review');
  }
  return result.review;
};
const revisionFor = async (campaignId: string) => {
  const review = await reviewFor(campaignId);
  return review.revision;
};
const recover = async (
  campaignId: string,
  action: 'increase' | 'resume' = 'resume',
  budgetUsd = 2,
) =>
  await recoverCampaign({
    campaignId,
    organizationId: 'org',
    request: {
      action,
      budgetUsd,
      reviewed: true,
      revision: await revisionFor(campaignId),
    },
  });

describe('Guided campaign recovery', () => {
  beforeAll(async () => {
    const files = await readdir('migrations');
    for (const file of files.filter((name) => name.endsWith('.sql')).toSorted()) {
      // Local in-memory database only; applies the repository's real schema.
      // oxlint-disable-next-line no-await-in-loop
      await client.exec(await readFile(`migrations/${file}`, 'utf-8'));
    }
  }, 30_000);
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(getApiContext).mockResolvedValue({ organizationId: 'org', userId: 'user' });
    await client.exec('TRUNCATE "user", organization CASCADE');
  });

  afterAll(async () => {
    await client.close();
  });

  it('increases the total limit without unblocking or resubmitting work', async () => {
    const { campaign, job } = await seed();
    expect(await recover(campaign.id, 'increase')).toStrictEqual({ resumed: 0 });
    const updated = await db.query.campaignSchema.findFirst();
    expect(updated?.budgetMicros).toBe(2_000_000);
    expect(updated?.budgetBlocked).toBe(true);
    const snapshot1 = await db.query.jobSchema.findFirst();
    expect(snapshot1?.id).toBe(job.id);
    const snapshot2 = await db.query.jobSchema.findFirst();
    expect(snapshot2?.status).toBe('failed');
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
  });

  it('resumes the same budget-stopped job and completes once', async () => {
    const { campaign, job } = await seed();
    vi.mocked(providers.writeEmailSequence).mockResolvedValue(sequence);
    expect(await recover(campaign.id)).toStrictEqual({ resumed: 1 });
    const snapshot3 = await db.query.jobSchema.findFirst();
    expect(snapshot3?.id).toBe(job.id);
    await processJobs(5);
    await processJobs(5);
    expect(providers.writeEmailSequence).toHaveBeenCalledTimes(1);
    const snapshot4 = await db.query.contactSchema.findFirst();
    expect(snapshot4?.status).toBe('ready');
    expect(await db.select().from(schema.jobSchema)).toHaveLength(1);
  });

  it('replays a saved paid sequence without another provider request', async () => {
    const { campaign, contact, job } = await seed();
    const payload = { [`paidSequence:${contact.id}`]: { result: sequence } };
    await db.update(schema.jobSchema).set({ payload }).where(eq(schema.jobSchema.id, job.id));
    const snapshot5 = await reviewFor(campaign.id);
    expect(snapshot5.candidates[0]?.disposition).toBe('saved');
    await recover(campaign.id);
    const snapshot6 = await db.query.jobSchema.findFirst();
    expect(snapshot6?.payload).toStrictEqual(payload);
    await processJobs(5);
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
    const snapshot7 = await db.query.contactSchema.findFirst();
    expect(snapshot7?.status).toBe('ready');
  });

  it('keeps unknown paid requests and their reservation blocked even with more funds', async () => {
    const { campaign, contact, job } = await seed();
    const operation = `${job.id}:write:${contact.id}`;
    await db
      .update(schema.jobSchema)
      .set({ payload: { [`paidSequence:${contact.id}`]: { started: true } } })
      .where(eq(schema.jobSchema.id, job.id));
    await db
      .update(schema.campaignSchema)
      .set({
        budgetCommittedMicros: 500_000,
        budgetOperations: { [operation]: { amount: 500_000, settled: false } },
      })
      .where(eq(schema.campaignSchema.id, campaign.id));
    const review = await reviewFor(campaign.id);
    expect(review.reservedMicros).toBe(500_000);
    expect(review.uncertain).toBe(1);
    await expect(recover(campaign.id)).rejects.toThrow('review');
    await recover(campaign.id, 'increase');
    const snapshot8 = await db.query.campaignSchema.findFirst();
    expect(snapshot8?.budgetBlocked).toBe(true);
    const snapshot9 = await db.query.campaignSchema.findFirst();
    expect(snapshot9?.budgetCommittedMicros).toBe(500_000);
    const snapshot10 = await db.query.jobSchema.findFirst();
    expect(snapshot10?.status).toBe('failed');
  });

  it('rejects a stale review after a job changes', async () => {
    const { campaign, job } = await seed();
    const review = await reviewFor(campaign.id);
    await db.update(schema.jobSchema).set({ attempts: 6 }).where(eq(schema.jobSchema.id, job.id));
    await expect(
      recoverCampaign({
        campaignId: campaign.id,
        organizationId: 'org',
        request: { action: 'resume', budgetUsd: 2, reviewed: true, revision: review.revision },
      }),
    ).rejects.toThrow('stale');
    const snapshot11 = await db.query.campaignSchema.findFirst();
    expect(snapshot11?.budgetMicros).toBe(1_000_000);
  });

  it('allows only one concurrent resume using the same reviewed snapshot', async () => {
    const { campaign } = await seed();
    const request = {
      action: 'resume' as const,
      budgetUsd: 2,
      reviewed: true as const,
      revision: await revisionFor(campaign.id),
    };
    const results = await Promise.allSettled([
      recoverCampaign({ campaignId: campaign.id, organizationId: 'org', request }),
      recoverCampaign({ campaignId: campaign.id, organizationId: 'org', request }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.select().from(schema.jobSchema)).toHaveLength(1);
  });

  it('rejects recovery across organizations', async () => {
    const { campaign } = await seed();
    expect(
      await getCampaignRecovery({ campaignId: campaign.id, organizationId: 'other' }),
    ).toBeNull();
    await expect(
      recoverCampaign({
        campaignId: campaign.id,
        organizationId: 'other',
        request: {
          action: 'resume',
          budgetUsd: 2,
          reviewed: true,
          revision: await revisionFor(campaign.id),
        },
      }),
    ).rejects.toThrow('not_found');
  });

  it('does not retry unclassified failures or PDF estimate failures', async () => {
    const { campaign, job } = await seed();
    await db
      .update(schema.jobSchema)
      .set({ lastError: 'Campaign budget cannot estimate PDF input; processing stopped' })
      .where(eq(schema.jobSchema.id, job.id));
    const snapshot12 = await reviewFor(campaign.id);
    expect(snapshot12.manual).toBe(1);
    await expect(recover(campaign.id)).rejects.toThrow('review');
  });

  it('rejects active workers and lower total limits', async () => {
    const { campaign, job } = await seed();
    await expect(recover(campaign.id, 'resume', 0.5)).rejects.toThrow('budget');
    await db
      .update(schema.jobSchema)
      .set({ status: 'running' })
      .where(eq(schema.jobSchema.id, job.id));
    await expect(recover(campaign.id, 'increase')).rejects.toThrow('running');
  });

  it('preserves approved drafts during replay', async () => {
    const { campaign, contact, job } = await seed();
    await db
      .update(schema.contactSchema)
      .set({ status: 'approved' })
      .where(eq(schema.contactSchema.id, contact.id));
    await db.insert(schema.emailDraftSchema).values({
      contactId: contact.id,
      stepIndex: 1,
      subject: 'Edited subject',
      body: 'Edited body',
    });
    await db
      .update(schema.jobSchema)
      .set({ payload: { [`paidSequence:${contact.id}`]: { result: sequence } } })
      .where(eq(schema.jobSchema.id, job.id));
    await recover(campaign.id);
    await processJobs(5);
    const snapshot13 = await db.query.contactSchema.findFirst();
    expect(snapshot13?.status).toBe('approved');
    const snapshot14 = await db.query.emailDraftSchema.findFirst();
    expect(snapshot14?.subject).toBe('Edited subject');
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
  });

  it('retains batch identifiers and warm-up progress', async () => {
    const { campaign, contact, job } = await seed(true);
    const payload = {
      contactIds: [contact.id],
      doneIds: [contact.id],
      batchId: 'batch-1',
      paidBatch: { result: 'batch-1' },
    };
    await db.update(schema.jobSchema).set({ payload }).where(eq(schema.jobSchema.id, job.id));
    await recover(campaign.id);
    const snapshot15 = await db.query.jobSchema.findFirst();
    expect(snapshot15?.payload).toStrictEqual(payload);
    expect(providers.submitSequenceBatch).not.toHaveBeenCalled();
  });

  it('blocks inconsistent ledgers and unresolved reservations left by completed jobs', async () => {
    const { campaign, job } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetCommittedMicros: 99 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    const snapshot16 = await reviewFor(campaign.id);
    expect(snapshot16.ledgerConsistent).toBe(false);
    await expect(recover(campaign.id)).rejects.toThrow('review');
    await db
      .update(schema.campaignSchema)
      .set({ budgetOperations: { [`${job.id}:write:x`]: { amount: 99, settled: false } } })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await db
      .update(schema.jobSchema)
      .set({ status: 'done' })
      .where(eq(schema.jobSchema.id, job.id));
    const snapshot17 = await reviewFor(campaign.id);
    expect(snapshot17.uncertain).toBe(1);
    await expect(recover(campaign.id)).rejects.toThrow('review');
  });
  it('polls a known research run without creating another paid request', async () => {
    const { campaign, contact, job } = await seed();
    await db
      .update(schema.jobSchema)
      .set({ type: 'enrich', payload: { paidResearch: { result: 'run-1' } } })
      .where(eq(schema.jobSchema.id, job.id));
    await db
      .insert(schema.enrichmentSchema)
      .values({ contactId: contact.id, processor: 'core', parallelRunId: 'run-1' });
    vi.mocked(parallel.fetchTaskRunResult).mockResolvedValue({ state: 'pending' });
    await recover(campaign.id);
    await processJobs(1);
    expect(parallel.createTaskRun).not.toHaveBeenCalled();
    expect(parallel.fetchTaskRunResult).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1' }),
    );
    const updatedJob = await db.query.jobSchema.findFirst();
    expect(updatedJob?.status).toBe('queued');
  });

  it('collects the existing batch without regenerating its warm-up', async () => {
    const { campaign, contact, job } = await seed(true);
    await db
      .update(schema.contactSchema)
      .set({ status: 'ready' })
      .where(eq(schema.contactSchema.id, contact.id));
    await db
      .update(schema.jobSchema)
      .set({
        payload: {
          contactIds: [contact.id],
          doneIds: [contact.id],
          batchId: 'batch-1',
          paidBatch: { result: 'batch-1' },
        },
      })
      .where(eq(schema.jobSchema.id, job.id));
    vi.mocked(providers.fetchSequenceBatch).mockResolvedValue({ state: 'ended', results: [] });
    await recover(campaign.id);
    await processJobs(1);
    expect(providers.submitSequenceBatch).not.toHaveBeenCalled();
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
    expect(providers.fetchSequenceBatch).toHaveBeenCalledWith({
      batchId: 'batch-1',
      campaign: expect.objectContaining({ id: campaign.id }),
    });
    const updatedContact = await db.query.contactSchema.findFirst();
    expect(updatedContact?.status).toBe('ready');
  });

  it('authenticates both API methods and hides other organizations', async () => {
    const { campaign } = await seed();
    const props = { params: Promise.resolve({ id: campaign.id }) };
    const request = new Request('http://localhost/api/recovery');
    vi.mocked(getApiContext).mockResolvedValue(null);
    const anonymousGet = await GET(request, props);
    const anonymousPost = await POST(request, props);
    expect(anonymousGet.status).toBe(401);
    expect(anonymousPost.status).toBe(401);
    vi.mocked(getApiContext).mockResolvedValue({ organizationId: 'other', userId: 'user' });
    const hiddenGet = await GET(request, props);
    const hiddenPost = await POST(
      new Request('http://localhost/api/recovery', {
        method: 'POST',
        body: JSON.stringify({
          action: 'resume',
          budgetUsd: 2,
          reviewed: true,
          revision: await revisionFor(campaign.id),
        }),
      }),
      props,
    );
    expect(hiddenGet.status).toBe(404);
    expect(hiddenPost.status).toBe(404);
  });

  it('validates explicit review, limits and snapshot revision at the API boundary', async () => {
    const { campaign } = await seed();
    const props = { params: Promise.resolve({ id: campaign.id }) };
    const valid = {
      action: 'resume',
      budgetUsd: 2,
      reviewed: true,
      revision: await revisionFor(campaign.id),
    };
    for (const invalid of [
      { ...valid, reviewed: false },
      { ...valid, budgetUsd: 2001 },
      { ...valid, revision: 'invalid' },
      { ...valid, budgetUsd: 2.001 },
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await POST(
        new Request('http://localhost/api/recovery', {
          method: 'POST',
          body: JSON.stringify(invalid),
        }),
        props,
      );
      expect(response.status).toBe(422);
    }
    const applied = await POST(
      new Request('http://localhost/api/recovery', { method: 'POST', body: JSON.stringify(valid) }),
      props,
    );
    expect(applied.status).toBe(200);
    const repeated = await POST(
      new Request('http://localhost/api/recovery', { method: 'POST', body: JSON.stringify(valid) }),
      props,
    );
    expect(repeated.status).toBe(409);
  });
});
