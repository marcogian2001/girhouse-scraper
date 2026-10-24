import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/models/Schema';

const client = new PGlite();
const testDb = drizzle(client, { schema });

// Only data sources and external effects are replaced. Inserts, uniqueness and reads use SQL.
vi.mock('@/libs/DB', () => ({ db: testDb }));
vi.mock('@/libs/Env', () => ({ Env: {} }));
vi.mock('@/libs/AutomationSettings', () => ({
  getAutomationSettings: vi.fn().mockResolvedValue({ classificationModel: 'test' }),
}));
vi.mock('@/libs/Conversations', () => ({ logEvent: vi.fn(), setConversationState: vi.fn() }));
vi.mock('@/libs/Usage', () => ({ recordCopywritingUsage: vi.fn() }));
vi.mock('@/services/DemoWriter', () => ({
  writeDemoTexts: vi.fn().mockResolvedValue({ texts: {}, call: {} }),
  toDemoContent: () => ({}),
}));
vi.mock('@/libs/DemoReferences', () => ({
  loadContactResearch: vi.fn().mockResolvedValue({ personName: null, raw: '', research: '' }),
  readOutsideSources: vi.fn().mockResolvedValue({ instagram: null, references: [] }),
  copyDemoImages: vi.fn().mockResolvedValue([]),
  deleteUnusedImages: vi.fn(),
  renderReferences: () => '',
  socialFacts: () => null,
  instagramSources: () => ({}),
}));
vi.mock('@/services/WebsiteBrand', () => ({ fetchWebsiteBrand: vi.fn() }));
vi.mock('@/services/MioDottore', () => ({
  fetchMioDottoreProfile: vi.fn(),
  guessMioDottoreUrl: vi.fn(),
  isMioDottoreUrl: () => false,
}));
vi.mock('@/services/Apify', () => ({ isReadableWebsite: () => false }));
vi.mock('@/libs/ApiAuth', () => ({
  getApiContext: vi.fn().mockResolvedValue({ userId: 'test-user', organizationId: 'test-org' }),
  unauthorized: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
  notFound: () => Response.json({ error: 'not_found' }, { status: 404 }),
}));

// Dynamic imports let the real database be initialized before the DB boundary is replaced.
const { DemoSlugConflictError, ensureDemo, rebuildDemo } = await import('@/libs/Demos');
const { writeDemoTexts } = await import('@/services/DemoWriter');
const { getApiContext } = await import('@/libs/ApiAuth');
const { POST } = await import('@/app/api/replies/[id]/demo/route');

/**
 * Creates a synthetic conversation without sources that could make network requests.
 * @param organizationId The owning test organization.
 * @returns The stored conversation.
 */
const createConversation = async (organizationId = 'test-org') => {
  const [conversation] = await testDb
    .insert(schema.conversationSchema)
    .values({
      organizationId,
      userId: 'test-user',
      leadEmail: 'test@example.invalid',
      company: 'Studio Rossi',
      isTest: true,
    })
    .returning();

  if (!conversation) {
    throw new Error('Missing test conversation');
  }

  return conversation;
};

/**
 * Calls the actual route handler with a synthetic authenticated request.
 * @param options The request inputs.
 * @param options.id The conversation ID.
 * @param options.body The raw request body, omitted for legacy callers.
 * @returns The HTTP response.
 */
const createRequest = async (options: { id: string; body?: string }) =>
  await POST(
    new Request('http://localhost/api/replies/test/demo', { method: 'POST', body: options.body }),
    { params: Promise.resolve({ id: options.id }) },
  );

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: './migrations' });
  await testDb.insert(schema.userSchema).values({
    id: 'test-user',
    name: 'Local test',
    email: 'test@example.invalid',
  });
  await testDb.insert(schema.organizationSchema).values([
    { id: 'test-org', name: 'Test', slug: 'test' },
    { id: 'other-org', name: 'Other', slug: 'other' },
  ]);
});

beforeEach(async () => {
  await testDb.delete(schema.conversationSchema);
  vi.mocked(writeDemoTexts).mockClear();
  vi.mocked(getApiContext).mockResolvedValue({ userId: 'test-user', organizationId: 'test-org' });
});

afterAll(async () => {
  await client.close();
});

describe('Demo slug persistence', () => {
  it('stores an exact custom slug and returns the same demo on repeat', async () => {
    const conversation = await createConversation();
    const first = await ensureDemo(conversation, 'studio-personalizzato');
    const second = await ensureDemo(conversation, 'studio-personalizzato');
    expect(first.slug).toBe('studio-personalizzato');
    expect(second.id).toBe(first.id);
    expect(writeDemoTexts).toHaveBeenCalledTimes(1);
  });

  it('numbers automatic slugs for businesses with the same name', async () => {
    const first = await ensureDemo(await createConversation());
    const second = await ensureDemo(await createConversation());
    expect(first.slug).toBe('studio-rossi');
    expect(second.slug).toBe('studio-rossi-2');
  });

  it('rejects a slug taken by another organization before building content', async () => {
    await ensureDemo(await createConversation('other-org'), 'occupato');
    vi.mocked(writeDemoTexts).mockClear();
    await expect(ensureDemo(await createConversation(), 'occupato')).rejects.toMatchObject({
      code: 'slug_taken',
    });
    expect(writeDemoTexts).not.toHaveBeenCalled();
  });

  it('refuses to rename an existing demo', async () => {
    const conversation = await createConversation();
    await ensureDemo(conversation, 'originale');
    await expect(ensureDemo(conversation, 'nuovo')).rejects.toMatchObject({ code: 'demo_exists' });
    const demo = await ensureDemo(conversation);
    expect(demo.slug).toBe('originale');
  });

  it('keeps an unopened email-derived slug during a rebuild', async () => {
    const conversation = await createConversation();
    await ensureDemo(conversation, 'test-example-invalid');
    const demo = await rebuildDemo(conversation, 'Updated guidance');
    expect(demo.slug).toBe('test-example-invalid');
  });

  it('keeps a historical slug when refreshing an old snapshot', async () => {
    const conversation = await createConversation();
    const first = await ensureDemo(conversation, 'originale');
    await testDb
      .update(schema.demoSchema)
      .set({
        slug: 'Legacy-a1B2c3D4e5',
        data: { ...first.data, version: 1 },
      })
      .where(eq(schema.demoSchema.id, first.id));
    const demo = await ensureDemo(conversation);
    expect(demo.slug).toBe('Legacy-a1B2c3D4e5');
  });

  it('accepts only one concurrent request for the same custom slug', async () => {
    const conversations = await Promise.all([createConversation(), createConversation()]);
    const results = await Promise.allSettled(
      conversations.map(async (conversation) => await ensureDemo(conversation, 'concorrente')),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
      DemoSlugConflictError,
    );
    expect(await testDb.select().from(schema.demoSchema)).toHaveLength(1);
  });

  it('returns one demo for concurrent matching requests on a conversation', async () => {
    const conversation = await createConversation();
    const results = await Promise.all([
      ensureDemo(conversation, 'uguale'),
      ensureDemo(conversation, 'uguale'),
    ]);
    expect(results[0].id).toBe(results[1].id);
  });

  it('reports a conflict for concurrent different requests on a conversation', async () => {
    const conversation = await createConversation();
    const results = await Promise.allSettled([
      ensureDemo(conversation, 'primo'),
      ensureDemo(conversation, 'secondo'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      code: 'demo_exists',
    });
  });
});

describe('Demo creation API', () => {
  it.each([undefined, '{}', '{"slug":""}'])('accepts the automatic request %s', async (body) => {
    const conversation = await createConversation();
    const response = await createRequest({ id: conversation.id, body });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: 'http://localhost:3000/it/demo/studio-rossi' });
  });

  it('normalizes the custom slug at the server boundary', async () => {
    const conversation = await createConversation();
    const response = await createRequest({
      id: conversation.id,
      body: '{"slug":"  Mio-Studio  "}',
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: 'http://localhost:3000/it/demo/mio-studio' });
  });

  it.each(['{', 'null', '[]', '{"slug":42}', '{"slug":"../x"}', '{"slug":"api-studio"}'])(
    'rejects invalid input %s before building',
    async (body) => {
      const conversation = await createConversation();
      const response = await createRequest({ id: conversation.id, body });
      expect(response.status).toBe(422);
      expect(writeDemoTexts).not.toHaveBeenCalled();
    },
  );

  it('returns 409 for an occupied slug without changing its owner', async () => {
    const owner = await createConversation();
    const existing = await ensureDemo(owner, 'occupato');
    const other = await createConversation();
    const response = await createRequest({
      id: other.id,
      body: '{"slug":"occupato"}',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'slug_taken' });
    const demo = await ensureDemo(owner);
    expect(demo.id).toBe(existing.id);
  });

  it('returns 409 for a demo already created with another slug', async () => {
    const conversation = await createConversation();
    await ensureDemo(conversation, 'originale');
    const response = await createRequest({ id: conversation.id, body: '{"slug":"nuovo"}' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'demo_exists' });
  });

  it('requires authentication', async () => {
    vi.mocked(getApiContext).mockResolvedValue(null);
    const response = await createRequest({ id: crypto.randomUUID() });
    expect(response.status).toBe(401);
  });

  it('rejects conversations outside the active organization', async () => {
    const conversation = await createConversation('other-org');
    const response = await createRequest({ id: conversation.id });
    expect(response.status).toBe(404);
    expect(writeDemoTexts).not.toHaveBeenCalled();
  });
});
