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
// The in-memory Postgres driver deliberately replaces the production pg pool.
vi.mock('@/libs/DB', () => ({ db: fixture.db }));
vi.mock(import('@/services/Copywriting'), () => ({
  writeEmailSequence: vi.fn<typeof Copywriting.writeEmailSequence>(),
  submitSequenceBatch: vi.fn<typeof Copywriting.submitSequenceBatch>(),
  fetchSequenceBatch: vi.fn<typeof Copywriting.fetchSequenceBatch>(),
}));

const { checkpointSequence, checkpointBatch } = await import('@/libs/CopywritingCheckpoint');
const { enqueueWriting, saveSequence } = await import('@/libs/CampaignWriting');
const { rescheduleJob } = await import('@/libs/JobQueue');
const { writeBatchJobHandlers } = await import('@/libs/WriteBatchJobs');
const { processJobs } = await import('@/libs/JobWorker');
const providers = await import('@/services/Copywriting');
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

describe('Copywriting recovery', () => {
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

  it('reuses a result after a database-only retry', async () => {
    const { job } = await seed();
    const run = vi.fn<() => Promise<WrittenSequence>>().mockResolvedValue(sequence);
    await checkpointSequence({ jobId: job.id, contactId: 'contact', run });
    await rescheduleJob({ jobId: job.id, delaySeconds: 0, payload: { doneIds: ['one'] } });
    await expect(
      checkpointSequence({ jobId: job.id, contactId: 'contact', run }),
    ).resolves.toStrictEqual(sequence);
    expect(run).toHaveBeenCalledOnce();
  });

  it('blocks a repeated paid request after a lost response', async () => {
    const { job } = await seed();
    const run = vi
      .fn<() => Promise<WrittenSequence>>()
      .mockRejectedValue(new Error('Response lost'));
    await expect(checkpointSequence({ jobId: job.id, contactId: 'contact', run })).rejects.toThrow(
      'Response lost',
    );
    await expect(checkpointSequence({ jobId: job.id, contactId: 'contact', run })).rejects.toThrow(
      'outcome is unknown',
    );
    expect(run).toHaveBeenCalledOnce();
  });

  it('claims one paid request under concurrent execution', async () => {
    const { job } = await seed();
    const run = vi.fn<() => Promise<WrittenSequence>>().mockResolvedValue(sequence);
    await Promise.allSettled([
      checkpointSequence({ jobId: job.id, contactId: 'contact', run }),
      checkpointSequence({ jobId: job.id, contactId: 'contact', run }),
    ]);
    expect(run).toHaveBeenCalledOnce();
  });

  it('reuses the batch id when queue rescheduling is repeated', async () => {
    const { job } = await seed(true);
    const run = vi.fn<() => Promise<string>>().mockResolvedValue('batch-1');
    await checkpointBatch({ jobId: job.id, run });
    await expect(checkpointBatch({ jobId: job.id, run })).resolves.toBe('batch-1');
    expect(run).toHaveBeenCalledOnce();
  });

  it('preserves edited drafts when a batch result is replayed', async () => {
    const { campaign, contact } = await seed();
    await saveSequence({ campaign, contactId: contact.id, sequence });
    await db.update(schema.emailDraftSchema).set({ body: 'Human edit', edited: true });
    await saveSequence({ campaign, contactId: contact.id, sequence });
    const drafts = await db.select().from(schema.emailDraftSchema);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.body).toBe('Human edit');
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(1);
  });

  it('rolls back partial draft writes and resumes without another paid call', async () => {
    const { campaign, contact, job } = await seed();
    const run = vi.fn<() => Promise<WrittenSequence>>().mockResolvedValue(sequence);
    await client.exec(`CREATE FUNCTION reject_ready() RETURNS trigger AS $$ BEGIN
      IF NEW.status = 'ready' THEN RAISE EXCEPTION 'injected failure'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_failure BEFORE UPDATE ON contact FOR EACH ROW EXECUTE FUNCTION reject_ready();`);
    const result = await checkpointSequence({ jobId: job.id, contactId: 'contact', run });
    await expect(
      saveSequence({ campaign, contactId: contact.id, sequence: result }),
    ).rejects.toThrow('Failed query');
    await expect(db.select().from(schema.emailDraftSchema)).resolves.toHaveLength(0);
    await client.exec('DROP TRIGGER test_failure ON contact; DROP FUNCTION reject_ready();');
    await saveSequence({
      campaign,
      contactId: contact.id,
      sequence: await checkpointSequence({ jobId: job.id, contactId: 'contact', run }),
    });
    expect(run).toHaveBeenCalledOnce();
    await expect(db.select().from(schema.emailDraftSchema)).resolves.toHaveLength(1);
  });

  it('keeps one direct job when enrichment queues writing twice', async () => {
    const { campaign, contact } = await seed();
    await Promise.all([
      enqueueWriting({ campaign, contactIds: [contact.id] }),
      enqueueWriting({ campaign, contactIds: [contact.id] }),
    ]);
    await expect(db.select().from(schema.jobSchema)).resolves.toHaveLength(1);
  });

  it('does not generate again for an already completed contact', async () => {
    const { campaign, contact } = await seed();
    await saveSequence({ campaign, contactId: contact.id, sequence });
    await expect(processJobs(1)).resolves.toStrictEqual({ processed: 1, failed: 0 });
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
  });

  it('flags missing batch results without scheduling paid direct fallbacks', async () => {
    const { campaign, contact, job } = await seed(true);
    await db
      .update(schema.contactSchema)
      .set({ status: 'writing' })
      .where(eq(schema.contactSchema.id, contact.id));
    vi.mocked(providers.fetchSequenceBatch).mockResolvedValue({ state: 'ended', results: [] });
    await writeBatchJobHandlers.write_batch({
      ...job,
      payload: { contactIds: [contact.id], doneIds: [], batchId: 'batch-1' },
    });
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
    await expect(db.select().from(schema.jobSchema)).resolves.toHaveLength(1);
    const updated = await db.query.contactSchema.findFirst({
      where: eq(schema.contactSchema.id, contact.id),
    });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toContain('no direct retry');
    const updatedCampaign = await db.query.campaignSchema.findFirst({
      where: eq(schema.campaignSchema.id, campaign.id),
    });
    expect(updatedCampaign?.status).toBe('review');
  });

  it('stops malformed direct output without spending on another attempt', async () => {
    const { contact } = await seed();
    vi.mocked(providers.writeEmailSequence).mockResolvedValue({ ...sequence, emails: null });
    await processJobs(1);
    await processJobs(1);
    expect(providers.writeEmailSequence).toHaveBeenCalledOnce();
    const updated = await db.query.contactSchema.findFirst({
      where: eq(schema.contactSchema.id, contact.id),
    });
    expect(updated?.status).toBe('failed');
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(1);
  });

  it('blocks resubmission when the provider accepted a batch but its response was lost', async () => {
    const { job } = await seed(true);
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('Connection lost'));
    await expect(checkpointBatch({ jobId: job.id, run })).rejects.toThrow('Connection lost');
    await expect(checkpointBatch({ jobId: job.id, run })).rejects.toThrow('outcome is unknown');
    expect(run).toHaveBeenCalledOnce();
  });

  it('keeps warm-up results tied to their original contact', async () => {
    const { job } = await seed(true);
    const run = vi.fn<() => Promise<WrittenSequence>>().mockResolvedValue(sequence);
    await checkpointSequence({ jobId: job.id, contactId: 'first', run });
    await checkpointSequence({ jobId: job.id, contactId: 'second', run });
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('leaves finished contacts intact when an enrichment job is replayed', async () => {
    const { campaign, contact, job } = await seed();
    await saveSequence({ campaign, contactId: contact.id, sequence });
    await db
      .update(schema.jobSchema)
      .set({ type: 'enrich' })
      .where(eq(schema.jobSchema.id, job.id));
    await expect(processJobs(1)).resolves.toStrictEqual({ processed: 1, failed: 0 });
    const updated = await db.query.contactSchema.findFirst({
      where: eq(schema.contactSchema.id, contact.id),
    });
    expect(updated?.status).toBe('ready');
    expect(providers.writeEmailSequence).not.toHaveBeenCalled();
  });
});
