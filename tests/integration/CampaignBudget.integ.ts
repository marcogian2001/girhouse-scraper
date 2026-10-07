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
}));
const { reserveCampaignBudget, settleCampaignBudget } = await import('@/libs/CampaignBudget');
const { processJobs } = await import('@/libs/JobWorker');
const { writeBatchJobHandlers } = await import('@/libs/WriteBatchJobs');
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
      status: 'enriched',
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
    })
    .returning();
  if (!job) {
    throw new Error('Missing test job');
  }
  return { campaign, contact, job };
};

describe('Campaign budget', () => {
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

  it('serializes concurrent reservations against the same available funds', async () => {
    const { campaign } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 1000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    const results = await Promise.allSettled([
      reserveCampaignBudget({
        campaignId: campaign.id,
        items: [{ operationId: 'one', amount: 700 }],
      }),
      reserveCampaignBudget({
        campaignId: campaign.id,
        items: [{ operationId: 'two', amount: 700 }],
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetCommittedMicros).toBe(700);
  });

  it('reuses reservations and releases only the difference after settlement', async () => {
    const { campaign } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 1000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    const reservation = { campaignId: campaign.id, items: [{ operationId: 'one', amount: 700 }] };
    await reserveCampaignBudget(reservation);
    await reserveCampaignBudget(reservation);
    const settled = { campaignId: campaign.id, operationId: 'one', costMicros: 200 };
    await settleCampaignBudget(settled);
    await settleCampaignBudget(settled);
    await reserveCampaignBudget({
      campaignId: campaign.id,
      items: [{ operationId: 'two', amount: 700 }],
    });
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetCommittedMicros).toBe(900);
  });

  it('rejects a whole batch reservation without partial commitments', async () => {
    const { campaign } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 1000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await expect(
      reserveCampaignBudget({
        campaignId: campaign.id,
        items: [
          { operationId: 'one', amount: 700 },
          { operationId: 'two', amount: 700 },
        ],
      }),
    ).rejects.toThrow('insufficient');
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetCommittedMicros).toBe(0);
    expect(updated?.budgetOperations).toEqual({});
  });

  it('blocks direct generation before calling the provider', async () => {
    const { campaign, job } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 1000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await processJobs(1);
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetBlocked).toBe(true);
    expect(updated?.errorMessage).toContain('budget');
    const updatedJob = await db.query.jobSchema.findFirst({
      where: eq(schema.jobSchema.id, job.id),
    });
    expect(updatedJob?.status).toBe('failed');
    expect(updatedJob?.payload).toBeNull();
  });

  it('settles a successful generation to its recorded cost', async () => {
    const { campaign } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 2_000_000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    vi.mocked(providers.writeEmailSequence).mockResolvedValue(sequence);
    await processJobs(1);
    expect(providers.writeEmailSequence).toHaveBeenCalledOnce();
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetCommittedMicros).toBe(sequence.costMicros);
  });

  it('retains funds when the provider response is lost', async () => {
    const { campaign } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 2_000_000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    vi.mocked(providers.writeEmailSequence).mockRejectedValue(new Error('Response lost'));
    await processJobs(1);
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetCommittedMicros).toBeGreaterThan(0);
    expect(
      Object.values(updated?.budgetOperations ?? {}).every((operation) => !operation.settled),
    ).toBe(true);
  });

  it('blocks a submitted batch when its requests exceed the remaining budget', async () => {
    const { campaign, contact, job } = await seed(true);
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 1000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await expect(
      writeBatchJobHandlers.write_batch({
        ...job,
        payload: { contactIds: [contact.id], doneIds: ['previous-warmup'] },
      }),
    ).rejects.toThrow('insufficient');
    expect(providers.submitSequenceBatch).not.toHaveBeenCalled();
  });

  it('blocks Parallel before starting research', async () => {
    const { campaign, job } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 1000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await db
      .update(schema.jobSchema)
      .set({ type: 'enrich' })
      .where(eq(schema.jobSchema.id, job.id));
    await processJobs(1);
    expect(parallel.createTaskRun).not.toHaveBeenCalled();
  });

  it('keeps uncapped campaigns unchanged', async () => {
    const { campaign } = await seed();
    vi.mocked(providers.writeEmailSequence).mockResolvedValue(sequence);
    await processJobs(1);
    expect(providers.writeEmailSequence).toHaveBeenCalledOnce();
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetMicros).toBeNull();
    expect(updated?.budgetCommittedMicros).toBe(0);
  });
  it('settles batch results even after the campaign budget has been blocked', async () => {
    const { campaign, contact, job } = await seed(true);
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 2_000_000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await reserveCampaignBudget({
      campaignId: campaign.id,
      items: [{ operationId: `${job.id}:write:${contact.id}`, amount: 500_000 }],
    });
    await db
      .update(schema.campaignSchema)
      .set({ budgetBlocked: true })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await db
      .update(schema.contactSchema)
      .set({ status: 'writing' })
      .where(eq(schema.contactSchema.id, contact.id));
    vi.mocked(providers.fetchSequenceBatch).mockResolvedValue({
      state: 'ended',
      results: [{ customId: contact.id, sequence }],
    });
    await writeBatchJobHandlers.write_batch({
      ...job,
      payload: { contactIds: [contact.id], doneIds: [], batchId: 'batch' },
    });
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetCommittedMicros).toBe(sequence.costMicros);
    expect(updated?.budgetBlocked).toBe(true);
    expect(providers.submitSequenceBatch).not.toHaveBeenCalled();
  });

  it('blocks unpriced PDF input before generation', async () => {
    const { campaign } = await seed();
    const [asset] = await db
      .insert(schema.knowledgeAssetSchema)
      .values({
        organizationId: 'org',
        userId: 'user',
        kind: 'document',
        name: 'Test PDF',
        anthropicFileId: 'file-test',
      })
      .returning();
    if (!asset) {
      throw new Error('Missing test asset');
    }
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 2_000_000, knowledgeAssetIds: [asset.id] })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await processJobs(1);
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetBlocked).toBe(true);
    expect(updated?.errorMessage).toContain('PDF');
  });

  it('retains an unexpectedly higher actual cost and blocks further reservations', async () => {
    const { campaign } = await seed();
    await db
      .update(schema.campaignSchema)
      .set({ budgetMicros: 1000 })
      .where(eq(schema.campaignSchema.id, campaign.id));
    await reserveCampaignBudget({
      campaignId: campaign.id,
      items: [{ operationId: 'one', amount: 700 }],
    });
    await settleCampaignBudget({ campaignId: campaign.id, operationId: 'one', costMicros: 1200 });
    await expect(
      reserveCampaignBudget({
        campaignId: campaign.id,
        items: [{ operationId: 'two', amount: 1 }],
      }),
    ).rejects.toThrow('insufficient');
    const updated = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updated?.budgetCommittedMicros).toBe(1200);
  });
});
