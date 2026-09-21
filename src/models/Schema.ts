import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// This file defines the structure of your database tables using the Drizzle ORM.

// To modify the database schema:
// 1. Update this file with your desired changes.
// 2. Generate a new migration by running: `npm run db:generate`

// The generated migration file will reflect your schema changes.
// It automatically run the command `db-server:file`, which apply the migration before Next.js starts in development mode,
// Alternatively, if your database is running, you can run `npm run db:migrate` and there is no need to restart the server.

/** Timestamp columns shared by every table. */
const timestamps = {
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
};

// ---------------------------------------------------------------------------
// Better Auth
//
// These four tables mirror Better Auth's core schema exactly; the field names
// come from `getAuthTables()` in the installed package. Changing a column name
// here breaks the adapter, so keep them in sync with the library on upgrade.
// ---------------------------------------------------------------------------

export const userSchema = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestamps,
});

export const sessionSchema = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => userSchema.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const accountSchema = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => userSchema.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
  scope: text('scope'),
  // Hashed by Better Auth for the email and password provider
  password: text('password'),
  ...timestamps,
});

export const verificationSchema = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Cold email engine
// ---------------------------------------------------------------------------

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'enriching',
  'writing',
  'review',
  'pushing',
  'pushed',
  'failed',
]);

export const contactStatusEnum = pgEnum('contact_status', [
  'pending',
  'enriching',
  'enriched',
  'writing',
  'ready',
  'approved',
  'failed',
]);

export const jobTypeEnum = pgEnum('job_type', ['enrich', 'write', 'push']);

export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'done', 'failed']);

export const confidenceLevelEnum = pgEnum('confidence_level', ['low', 'medium', 'high']);

export const knowledgeKindEnum = pgEnum('knowledge_kind', ['prompt', 'document']);

export const parallelProcessorEnum = pgEnum('parallel_processor', ['lite', 'base', 'core', 'pro']);

export const usageProviderEnum = pgEnum('usage_provider', ['anthropic', 'parallel']);

/** Reusable prompts and documents Claude reads when writing a campaign. */
export const knowledgeAssetSchema = pgTable(
  'knowledge_asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: knowledgeKindEnum('kind').notNull(),
    // Inline text for prompts and plain-text uploads, null for PDFs
    content: text('content'),
    // Anthropic Files API identifier, set for PDFs only
    anthropicFileId: text('anthropic_file_id'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    ...timestamps,
  },
  (table) => [index('knowledge_asset_user_id_idx').on(table.userId)],
);

export const campaignSchema = pgTable(
  'campaign',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: campaignStatusEnum('status').notNull().default('draft'),
    processor: parallelProcessorEnum('processor').notNull().default('core'),
    emailCount: integer('email_count').notNull(),
    // Days to wait after each step before the next one, one entry per step
    delaysDays: jsonb('delays_days').$type<number[]>().notNull(),
    knowledgeAssetIds: jsonb('knowledge_asset_ids').$type<string[]>().notNull().default([]),
    extraPrompt: text('extra_prompt'),
    instantlyCampaignId: text('instantly_campaign_id'),
    errorMessage: text('error_message'),
    ...timestamps,
  },
  (table) => [index('campaign_user_id_idx').on(table.userId)],
);

export const contactSchema = pgTable(
  'contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaignSchema.id, { onDelete: 'cascade' }),
    rowIndex: integer('row_index').notNull(),
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    phone: text('phone'),
    company: text('company'),
    website: text('website'),
    linkedinUrl: text('linkedin_url'),
    // CSV columns that were not mapped to a known field
    extra: jsonb('extra').$type<Record<string, string>>().notNull().default({}),
    status: contactStatusEnum('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    ...timestamps,
  },
  (table) => [index('contact_campaign_id_status_idx').on(table.campaignId, table.status)],
);

/** Outcome of a Parallel AI task run for a single contact. */
export const enrichmentSchema = pgTable(
  'enrichment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contactSchema.id, { onDelete: 'cascade' }),
    parallelRunId: text('parallel_run_id'),
    processor: parallelProcessorEnum('processor').notNull(),
    // Structured research output, shaped by the task output schema
    content: jsonb('content').$type<Record<string, unknown>>(),
    // Per-field citations, reasoning and confidence returned by Parallel
    basis: jsonb('basis').$type<unknown[]>(),
    personFound: boolean('person_found'),
    identityConfidence: confidenceLevelEnum('identity_confidence'),
    identityReasoning: text('identity_reasoning'),
    error: text('error'),
    startedAt: timestamp('started_at', { mode: 'date' }),
    completedAt: timestamp('completed_at', { mode: 'date' }),
    ...timestamps,
  },
  (table) => [unique('enrichment_contact_id_unique').on(table.contactId)],
);

export const emailDraftSchema = pgTable(
  'email_draft',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contactSchema.id, { onDelete: 'cascade' }),
    // 1 for the first email, then one per follow-up
    stepIndex: integer('step_index').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    edited: boolean('edited').notNull().default(false),
    model: text('model'),
    ...timestamps,
  },
  (table) => [
    unique('email_draft_contact_id_step_index_unique').on(table.contactId, table.stepIndex),
  ],
);

/** Work queue drained by the background worker. */
export const jobSchema = pgTable(
  'job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaignSchema.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contactSchema.id, { onDelete: 'cascade' }),
    type: jobTypeEnum('type').notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    // Job-type specific arguments, e.g. the mailboxes a push should send from
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    runAfter: timestamp('run_after', { mode: 'date' }).defaultNow().notNull(),
    lockedAt: timestamp('locked_at', { mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    index('job_status_run_after_idx').on(table.status, table.runAfter),
    index('job_campaign_id_idx').on(table.campaignId),
  ],
);

/** One billed call to an external AI API, priced at list rates when it was made. */
export const apiUsageSchema = pgTable(
  'api_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    // Set null rather than cascade, so deleting a campaign keeps its past spend
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, { onDelete: 'set null' }),
    provider: usageProviderEnum('provider').notNull(),
    // Anthropic message id or Parallel run id, so a retried job never counts twice
    externalId: text('external_id').notNull(),
    // Claude model id or Parallel processor
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    // Millionths of a US dollar, so sums stay exact
    costMicros: integer('cost_micros').notNull(),
    ...timestamps,
  },
  (table) => [
    unique('api_usage_provider_external_id_unique').on(table.provider, table.externalId),
    index('api_usage_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('api_usage_campaign_id_idx').on(table.campaignId),
  ],
);
