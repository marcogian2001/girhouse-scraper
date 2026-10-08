import { readFile, readdir } from 'node:fs/promises';
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
const { getResultCostProviders, countReadySequences, countVerifiedEmails } =
  await import('@/libs/ResultCosts');
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

describe('Result cost metrics', () => {
  beforeAll(async () => {
    const files = await readdir('migrations');
    for (const file of files.filter((name) => name.endsWith('.sql')).toSorted()) {
      // Local in-memory database only; applies the repository's real schema.
      // oxlint-disable-next-line no-await-in-loop
      await client.exec(await readFile(`migrations/${file}`, 'utf-8'));
    }
  }, 30_000);
  beforeEach(async () => {
    await client.exec('TRUNCATE "user", organization CASCADE');
  });

  afterAll(async () => {
    await client.close();
  });

  it('separates reported, historical and estimated amounts within the campaign scope', async () => {
    const { campaign } = await seed();
    await db.insert(schema.apiUsageSchema).values([
      {
        organizationId: 'org',
        userId: 'user',
        campaignId: campaign.id,
        provider: 'apify',
        externalId: 'a',
        model: 'google_maps_reported',
        costMicros: 100,
      },
      {
        organizationId: 'org',
        userId: 'user',
        campaignId: campaign.id,
        provider: 'apify',
        externalId: 'b',
        model: 'google_maps',
        costMicros: 200,
      },
      {
        organizationId: 'org',
        userId: 'user',
        campaignId: campaign.id,
        provider: 'anthropic',
        externalId: 'c',
        model: 'test',
        costMicros: 300,
      },
      {
        organizationId: 'org',
        userId: 'user',
        provider: 'anthropic',
        externalId: 'outside',
        model: 'test',
        costMicros: 900,
      },
    ]);
    const costs = await getResultCostProviders({ organizationId: 'org', campaignId: campaign.id });
    expect(costs).toHaveLength(3);
    expect(costs).toContainEqual({ provider: 'apify', basis: 'provider', costMicros: 100 });
    expect(costs).toContainEqual({ provider: 'apify', basis: 'historical', costMicros: 200 });
    expect(costs).toContainEqual({ provider: 'anthropic', basis: 'estimate', costMicros: 300 });
    expect(
      await getResultCostProviders({ organizationId: 'other', campaignId: campaign.id }),
    ).toStrictEqual([]);
  });

  it('counts valid emails once and separates catch-all and unverified results', () => {
    expect(
      countVerifiedEmails([
        { email: 'A@example.com', status: 'ready', emailVerification: 'valid' },
        { email: ' a@example.com ', status: 'ready', emailVerification: 'valid' },
        { email: 'catch@example.com', status: 'ready', emailVerification: 'catch_all' },
        { email: 'failed@example.com', status: 'failed', emailVerification: 'valid' },
        { email: 'unknown@example.com', status: 'ready', emailVerification: null },
      ]),
    ).toStrictEqual({ valid: 1, catchAll: 1 });
    expect(countVerifiedEmails([])).toStrictEqual({ valid: 0, catchAll: 0 });
  });

  it('counts only complete sequences and deduplicates recipients without claiming verification', () => {
    const contacts = [
      { id: 'a', email: 'a@example.com', status: 'ready' },
      { id: 'b', email: ' A@example.com ', status: 'approved' },
      { id: 'c', email: 'c@example.com', status: 'ready' },
      { id: 'd', email: 'd@example.com', status: 'failed' },
    ];
    const drafts = ['a', 'b', 'd'].flatMap((contactId) =>
      [1, 2].map((stepIndex) => ({ contactId, stepIndex, subject: 'Subject', body: 'Body' })),
    );
    drafts.push({ contactId: 'c', stepIndex: 1, subject: 'Subject', body: 'Body' });
    expect(countReadySequences({ contacts, drafts, emailCount: 2 })).toBe(1);
    expect(countReadySequences({ contacts: [], drafts: [], emailCount: 2 })).toBe(0);
  });
});
