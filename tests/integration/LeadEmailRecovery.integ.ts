import { readFile, readdir } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/models/Schema';
import type * as MillionVerifier from '@/services/MillionVerifier';
import type * as Prospeo from '@/services/Prospeo';

const fixture = await vi.hoisted(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const tables = await import('@/models/Schema');
  const client = new PGlite();
  return { client, db: drizzle(client, { schema: tables }) };
});

vi.mock('@/libs/DB', () => ({ db: fixture.db }));
vi.mock(import('@/services/Prospeo'), async (original) => ({
  ...(await original()),
  findEmail: vi.fn<typeof Prospeo.findEmail>(),
}));
vi.mock(import('@/services/MillionVerifier'), async (original) => ({
  ...(await original()),
  verifyEmail: vi.fn<typeof MillionVerifier.verifyEmail>(),
}));
const { db, client } = fixture;
const { findEmail } = await import('@/services/Prospeo');
const { verifyEmail } = await import('@/services/MillionVerifier');
const { leadJobHandlers, markLeadJobAbandoned } = await import('@/libs/LeadJobs');
const { processJobs } = await import('@/libs/JobWorker');
const { checkpointEmailVerification } = await import('@/libs/LeadEmailCheckpoint');
const { recordMillionVerifierUsage } = await import('@/libs/Usage');

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
    .values({ leadSearchId: search.id, leadId: lead.id, type: 'lead_email', runAfter: new Date(0) })
    .returning();
  if (!job) {
    throw new Error('Missing job');
  }
  return { search, lead, job };
};

describe('Lead email recovery', () => {
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

  it('recovers a billed lookup after the usage insert fails without another request', async () => {
    const { job } = await seed();
    vi.mocked(findEmail).mockResolvedValue({ email: 'found@example.com', charged: true });
    await client.exec(`CREATE FUNCTION reject_usage() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_failure BEFORE INSERT ON api_usage FOR EACH ROW EXECUTE FUNCTION reject_usage();`);
    await expect(leadJobHandlers.lead_email(job)).rejects.toThrow();
    await client.exec('DROP TRIGGER test_failure ON api_usage; DROP FUNCTION reject_usage();');
    await leadJobHandlers.lead_email(job);
    expect(findEmail).toHaveBeenCalledOnce();
    const usage = await db.select().from(schema.apiUsageSchema);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.costMicros).toBe(10_000);
    expect(usage[0]?.externalId).toBe(`${job.id}:prospeo`);
  });

  it('reuses both provider results after saving the lead fails', async () => {
    const { job } = await seed();
    vi.mocked(findEmail).mockResolvedValue(null);
    vi.mocked(verifyEmail).mockResolvedValue('valid');
    await client.exec(`CREATE FUNCTION reject_ready() RETURNS trigger AS $$ BEGIN
      IF NEW.status = 'ready' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_failure BEFORE UPDATE ON lead FOR EACH ROW EXECUTE FUNCTION reject_ready();`);
    await expect(leadJobHandlers.lead_email(job)).rejects.toThrow();
    await client.exec('DROP TRIGGER test_failure ON lead; DROP FUNCTION reject_ready();');
    await leadJobHandlers.lead_email(job);
    expect(findEmail).toHaveBeenCalledOnce();
    expect(verifyEmail).toHaveBeenCalledOnce();
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(1);
  });

  it('preserves a free lookup without recording a charge', async () => {
    const { job } = await seed();
    vi.mocked(findEmail).mockResolvedValue({ email: 'found@example.com', charged: false });
    await leadJobHandlers.lead_email(job);
    await leadJobHandlers.lead_email(job);
    expect(findEmail).toHaveBeenCalledOnce();
    expect(verifyEmail).not.toHaveBeenCalled();
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(0);
  });

  it('allows a confirmed rate limit to wait and resume', async () => {
    const { job } = await seed();
    vi.mocked(findEmail)
      .mockResolvedValueOnce('rate_limited')
      .mockResolvedValueOnce({ email: 'found@example.com', charged: true });
    await leadJobHandlers.lead_email(job);
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(0);
    await leadJobHandlers.lead_email(job);
    expect(findEmail).toHaveBeenCalledTimes(2);
    await expect(db.select().from(schema.apiUsageSchema)).resolves.toHaveLength(1);
  });

  it('stops automatic retries after a lost lookup response', async () => {
    const { job, lead } = await seed();
    vi.mocked(findEmail).mockRejectedValue(new Error('Response lost'));
    await expect(processJobs(1)).resolves.toEqual({ processed: 1, failed: 1 });
    await expect(processJobs(1)).resolves.toEqual({ processed: 0, failed: 0 });
    expect(findEmail).toHaveBeenCalledOnce();
    const updated = await db.query.jobSchema.findFirst({ where: eq(schema.jobSchema.id, job.id) });
    expect(updated?.status).toBe('failed');
    expect(updated?.lastError).toContain('outcome is unknown');
    const updatedLead = await db.query.leadSchema.findFirst({
      where: eq(schema.leadSchema.id, lead.id),
    });
    expect(updatedLead?.status).toBe('failed');
  });

  it('blocks repeating a verification after a lost response', async () => {
    const { job } = await seed();
    vi.mocked(verifyEmail).mockRejectedValue(new Error('Response lost'));
    const options = { jobId: job.id, email: 'public@example.com' };
    await expect(checkpointEmailVerification(options)).rejects.toThrow('outcome is unknown');
    await expect(checkpointEmailVerification(options)).rejects.toThrow('outcome is unknown');
    expect(verifyEmail).toHaveBeenCalledOnce();
  });

  it('claims only one verification when the same job runs concurrently', async () => {
    const { job } = await seed();
    vi.mocked(verifyEmail).mockResolvedValue('valid');
    const options = { jobId: job.id, email: 'public@example.com' };
    const outcomes = await Promise.allSettled([
      checkpointEmailVerification(options),
      checkpointEmailVerification(options),
    ]);
    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(verifyEmail).toHaveBeenCalledOnce();
  });

  it('counts distinct operations for the same lead but deduplicates saved usage', async () => {
    const { job, lead, search } = await seed();
    const [second] = await db
      .insert(schema.jobSchema)
      .values({ leadSearchId: search.id, leadId: lead.id, type: 'lead_email' })
      .returning();
    if (!second) {
      throw new Error('Missing second job');
    }
    vi.mocked(verifyEmail).mockResolvedValue('valid');
    const firstResult = await checkpointEmailVerification({
      jobId: job.id,
      email: 'public@example.com',
    });
    const secondResult = await checkpointEmailVerification({
      jobId: second.id,
      email: 'public@example.com',
    });
    const owner = { organizationId: 'org', userId: 'user', leadSearchId: search.id };
    await recordMillionVerifierUsage({ ...owner, operationId: firstResult.operationId });
    await recordMillionVerifierUsage({ ...owner, operationId: firstResult.operationId });
    await recordMillionVerifierUsage({ ...owner, operationId: secondResult.operationId });
    const usage = await db.select().from(schema.apiUsageSchema);
    expect(usage).toHaveLength(2);
    expect(usage.reduce((sum, row) => sum + row.costMicros, 0)).toBe(7400);
  });

  it('preserves a finished lead when a stale worker reports failure', async () => {
    const { job, lead } = await seed();
    vi.mocked(findEmail).mockResolvedValue({ email: 'found@example.com', charged: true });
    await leadJobHandlers.lead_email(job);
    await markLeadJobAbandoned(job, 'Late failure');
    const updated = await db.query.leadSchema.findFirst({
      where: eq(schema.leadSchema.id, lead.id),
    });
    expect(updated?.status).toBe('ready');
    expect(updated?.email).toBe('found@example.com');
  });
  it('blocks another request when persisting a provider response fails', async () => {
    const { job } = await seed();
    vi.mocked(verifyEmail).mockResolvedValue('valid');
    await client.exec(`CREATE FUNCTION reject_checkpoint() RETURNS trigger AS $$ BEGIN
      IF NEW.payload -> 'leadEmail:millionverifier' ? 'result' THEN RAISE EXCEPTION 'injected failure'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_failure BEFORE UPDATE ON job FOR EACH ROW EXECUTE FUNCTION reject_checkpoint();`);
    const options = { jobId: job.id, email: 'public@example.com' };
    await expect(checkpointEmailVerification(options)).rejects.toThrow();
    await client.exec('DROP TRIGGER test_failure ON job; DROP FUNCTION reject_checkpoint();');
    await expect(checkpointEmailVerification(options)).rejects.toThrow('outcome is unknown');
    expect(verifyEmail).toHaveBeenCalledOnce();
  });

  it.each(['ready', 'no_email', 'reserve', 'filtered_out'] as const)(
    'skips provider calls for a %s lead',
    async (status) => {
      const { job, lead } = await seed();
      await db.update(schema.leadSchema).set({ status }).where(eq(schema.leadSchema.id, lead.id));
      await leadJobHandlers.lead_email(job);
      expect(findEmail).not.toHaveBeenCalled();
      expect(verifyEmail).not.toHaveBeenCalled();
      const updated = await db.query.jobSchema.findFirst({
        where: eq(schema.jobSchema.id, job.id),
      });
      expect(updated?.status).toBe('done');
    },
  );
});
