import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
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
// These tables mirror Better Auth's core and organization plugin schemas
// exactly; the field names come from `getAuthTables()` and the plugin in the
// installed package. Changing a column name here breaks the adapter, so keep
// them in sync with the library on upgrade.
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
  // Set by the organization plugin; every dashboard query is scoped to it
  activeOrganizationId: text('active_organization_id'),
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

/** A workspace that owns campaigns, knowledge assets and spend. */
export const organizationSchema = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const memberSchema = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizationSchema.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('member_organization_id_idx').on(table.organizationId),
    index('member_user_id_idx').on(table.userId),
  ],
);

export const invitationSchema = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizationSchema.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('invitation_organization_id_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
  ],
);

/**
 * Builds the owning organization column shared by every org-scoped table.
 * @returns A required reference that follows the organization on delete.
 */
const organizationId = () =>
  text('organization_id')
    .notNull()
    .references(() => organizationSchema.id, { onDelete: 'cascade' });

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

export const jobTypeEnum = pgEnum('job_type', [
  'enrich',
  'write',
  'write_batch',
  'push',
  'lead_search',
  'lead_research',
  'lead_email',
  'reply_process',
  'reply_write',
  'reply_send',
  // The next follow-up of a silent lead, due at `conversation.next_action_at`
  'conversation_tick',
  // Hands a bot-managed lead's GHL contact and opportunity to the "Bot AI" user
  'ghl_bot_assign',
]);

export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'done', 'failed']);

export const confidenceLevelEnum = pgEnum('confidence_level', ['low', 'medium', 'high']);

export const knowledgeKindEnum = pgEnum('knowledge_kind', ['prompt', 'document']);

export const parallelProcessorEnum = pgEnum('parallel_processor', ['lite', 'base', 'core', 'pro']);

export const usageProviderEnum = pgEnum('usage_provider', [
  'anthropic',
  'openai',
  'parallel',
  'apify',
  'prospeo',
  'millionverifier',
  'reoon',
]);

export const leadSearchStatusEnum = pgEnum('lead_search_status', [
  'searching',
  'qualifying',
  'done',
  'failed',
]);

export const websiteFilterEnum = pgEnum('website_filter', ['any', 'without', 'with']);

export const leadStatusEnum = pgEnum('lead_status', [
  'found',
  'researching',
  'finding_email',
  'ready',
  'reserve',
  'filtered_out',
  'no_email',
  'failed',
]);

export const leadEmailSourceEnum = pgEnum('lead_email_source', [
  'prospeo',
  'public',
  // Read off the business's website or the page it lists as one
  'website',
  // info@ at the business's domain, kept only when the mailbox is confirmed to exist
  'guessed',
]);

/** One way of finding a lead's email that was tried, and what came of it. */
export type EmailAttempt = {
  source: (typeof leadEmailSourceEnum.enumValues)[number];
  // Null when the route turned up no address to check
  email: string | null;
  verdict: 'valid' | 'catch_all' | 'invalid' | 'unknown' | 'not_found';
};

export const emailVerificationEnum = pgEnum('email_verification', ['valid', 'catch_all']);

/** Reusable prompts and documents the copywriting model reads when writing a campaign. */
export const knowledgeAssetSchema = pgTable(
  'knowledge_asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: knowledgeKindEnum('kind').notNull(),
    // Inline text for prompts and plain-text uploads, null for PDFs
    content: text('content'),
    // Anthropic Files API identifier, set for PDFs only
    anthropicFileId: text('anthropic_file_id'),
    // OpenAI Files API identifier, set for PDFs uploaded while OpenAI was configured
    openaiFileId: text('openai_file_id'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    ...timestamps,
  },
  (table) => [index('knowledge_asset_organization_id_idx').on(table.organizationId)],
);

export const campaignSchema = pgTable(
  'campaign',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: campaignStatusEnum('status').notNull().default('draft'),
    processor: parallelProcessorEnum('processor').notNull().default('core'),
    // Plain text rather than an enum, so offering a new model needs no migration
    copywritingModel: text('copywriting_model').notNull().default('claude-opus-5'),
    // Plain text for the same reason: low, medium or high
    copywritingEffort: text('copywriting_effort').notNull().default('high'),
    // Writes through the discounted, asynchronous batch API instead of one call per contact
    copywritingBatch: boolean('copywriting_batch').notNull().default(false),
    emailCount: integer('email_count').notNull(),
    // Days to wait after each step before the next one, one entry per step
    delaysDays: jsonb('delays_days').$type<number[]>().notNull(),
    knowledgeAssetIds: jsonb('knowledge_asset_ids').$type<string[]>().notNull().default([]),
    extraPrompt: text('extra_prompt'),
    instantlyCampaignId: text('instantly_campaign_id'),
    // Whether the reply bot answers this campaign's leads; when off they go to the sales reps
    botManaged: boolean('bot_managed').notNull().default(false),
    errorMessage: text('error_message'),
    // Set while the campaign is hidden from the active list; null when active
    archivedAt: timestamp('archived_at', { mode: 'date' }),
    ...timestamps,
  },
  (table) => [index('campaign_organization_id_idx').on(table.organizationId)],
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

/** The daily sweep of every Italian province for every term of the catalog. */
export const coveragePlanSchema = pgTable('coverage_plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  // One plan per organization, so its searches never compete with another plan's
  organizationId: organizationId().unique('coverage_plan_organization_id_unique'),
  // Who the scheduled searches are billed to
  userId: text('user_id')
    .notNull()
    .references(() => userSchema.id, { onDelete: 'cascade' }),
  dailyLeads: integer('daily_leads').notNull().default(750),
  leadsPerSearch: integer('leads_per_search').notNull().default(250),
  websiteFilter: websiteFilterEnum('website_filter').notNull().default('any'),
  processor: parallelProcessorEnum('processor').notNull().default('base'),
  isActive: boolean('is_active').notNull().default(false),
  ...timestamps,
});

/** A term of a coverage plan, searched in every province. Lower tiers go first. */
export const coverageTermSchema = pgTable(
  'coverage_term',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => coveragePlanSchema.id, { onDelete: 'cascade' }),
    // Normalised, so it matches the search areas the scheduled searches create
    term: text('term').notNull(),
    tier: integer('tier').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique('coverage_term_plan_id_term_unique').on(table.planId, table.term),
    check('coverage_term_tier_check', sql`${table.tier} between 1 and 3`),
  ],
);

/** A Google Maps search whose results are qualified into leads. */
export const leadSearchSchema = pgTable(
  'lead_search',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    searchTerms: jsonb('search_terms').$type<string[]>().notNull(),
    location: text('location').notNull(),
    // Google place id of the area, missing on searches made before areas were scanned
    locationPlaceId: text('location_place_id'),
    maxResults: integer('max_results').notNull(),
    websiteFilter: websiteFilterEnum('website_filter').notNull().default('any'),
    processor: parallelProcessorEnum('processor').notNull().default('base'),
    status: leadSearchStatusEnum('status').notNull().default('searching'),
    apifyRunId: text('apify_run_id'),
    // How many Apify runs the search has started, capped so a sparse area stops early
    scrapeRounds: integer('scrape_rounds').notNull().default(0),
    // Set once a round finds no new business, so the search stops topping up
    areaExhausted: boolean('area_exhausted').notNull().default(false),
    // Leads taken over from earlier searches, which were already paid for
    reserveClaimed: integer('reserve_claimed').notNull().default(0),
    // Set on the searches a coverage plan schedules, to count its daily quota and passes
    coveragePlanId: uuid('coverage_plan_id').references(() => coveragePlanSchema.id, {
      onDelete: 'set null',
    }),
    errorMessage: text('error_message'),
    ...timestamps,
  },
  (table) => [
    index('lead_search_organization_id_idx').on(table.organizationId),
    index('lead_search_coverage_plan_id_idx').on(table.coveragePlanId),
  ],
);

/** A search term looked up in one area, so each search continues where the last one stopped. */
export const searchAreaSchema = pgTable(
  'search_area',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    locationPlaceId: text('location_place_id').notNull(),
    // Normalised, so the same term typed differently shares its progress
    searchTerm: text('search_term').notNull(),
    ...timestamps,
  },
  (table) => [
    unique('search_area_organization_id_location_place_id_search_term_unique').on(
      table.organizationId,
      table.locationPlaceId,
      table.searchTerm,
    ),
  ],
);

/** A rectangle of a search area, scanned once with Google Text Search. */
export const searchCellSchema = pgTable(
  'search_cell',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    searchAreaId: uuid('search_area_id')
      .notNull()
      .references(() => searchAreaSchema.id, { onDelete: 'cascade' }),
    // How many times the area viewport was split to get this cell
    depth: integer('depth').notNull().default(0),
    lowLatitude: doublePrecision('low_latitude').notNull(),
    lowLongitude: doublePrecision('low_longitude').notNull(),
    highLatitude: doublePrecision('high_latitude').notNull(),
    highLongitude: doublePrecision('high_longitude').notNull(),
    scannedAt: timestamp('scanned_at', { mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    index('search_cell_search_area_id_scanned_at_idx').on(table.searchAreaId, table.scannedAt),
    // Two searches splitting the same cell at once add its quarters only once
    unique('search_cell_search_area_id_depth_low_unique').on(
      table.searchAreaId,
      table.depth,
      table.lowLatitude,
      table.lowLongitude,
    ),
  ],
);

/** A Google Maps place found in a search area, before Apify is paid to scrape it. */
export const discoveredPlaceSchema = pgTable(
  'discovered_place',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    searchAreaId: uuid('search_area_id')
      .notNull()
      .references(() => searchAreaSchema.id, { onDelete: 'cascade' }),
    placeId: text('place_id').notNull(),
    // Set once the place is sent to Apify, so a place Apify skips is never paid for again
    scrapedAt: timestamp('scraped_at', { mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    unique('discovered_place_search_area_id_place_id_unique').on(table.searchAreaId, table.placeId),
  ],
);

/** A business found by a lead search, with its decision maker and email once qualified. */
export const leadSchema = pgTable(
  'lead',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadSearchId: uuid('lead_search_id')
      .notNull()
      .references(() => leadSearchSchema.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    // Google Maps place id, so a business is only paid for once per organization
    placeId: text('place_id').notNull(),
    company: text('company').notNull(),
    website: text('website'),
    domain: text('domain'),
    hasWebsite: boolean('has_website').notNull(),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    category: text('category'),
    // What the business or professional does, written in Italian by Parallel
    description: text('description'),
    rating: real('rating'),
    reviewsCount: integer('reviews_count'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    role: text('role'),
    linkedinUrl: text('linkedin_url'),
    email: text('email'),
    emailSource: leadEmailSourceEnum('email_source'),
    emailVerification: emailVerificationEnum('email_verification'),
    status: leadStatusEnum('status').notNull().default('found'),
    parallelRunId: text('parallel_run_id'),
    researchStartedAt: timestamp('research_started_at', { mode: 'date' }),
    // Decision maker research returned by Parallel, shaped by its output schema
    research: jsonb('research').$type<Record<string, unknown>>(),
    // Every email route tried so far, so a lead without one shows why and a retry skips what failed
    emailAttempts: jsonb('email_attempts').$type<EmailAttempt[]>(),
    // The place as Apify returned it, kept for fields not promoted to columns
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    ...timestamps,
  },
  (table) => [
    unique('lead_organization_id_place_id_unique').on(table.organizationId, table.placeId),
    index('lead_lead_search_id_status_idx').on(table.leadSearchId, table.status),
  ],
);

/** Work queue drained by the background worker. */
export const jobSchema = pgTable(
  'job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Campaign jobs carry a campaign, lead search jobs a lead search
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contactSchema.id, { onDelete: 'cascade' }),
    leadSearchId: uuid('lead_search_id').references(() => leadSearchSchema.id, {
      onDelete: 'cascade',
    }),
    leadId: uuid('lead_id').references(() => leadSchema.id, { onDelete: 'cascade' }),
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
    index('job_lead_search_id_idx').on(table.leadSearchId),
  ],
);

/** One billed call to an external AI API, priced at list rates when it was made. */
export const apiUsageSchema = pgTable(
  'api_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    // Set null rather than cascade, so deleting a campaign keeps its past spend
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, { onDelete: 'set null' }),
    leadSearchId: uuid('lead_search_id').references(() => leadSearchSchema.id, {
      onDelete: 'set null',
    }),
    provider: usageProviderEnum('provider').notNull(),
    // Provider call id (message, run, request or lead id), so a retried job never counts twice
    externalId: text('external_id').notNull(),
    // Copywriting model id, Parallel processor, or the kind of call for the other providers
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
    index('api_usage_organization_id_created_at_idx').on(table.organizationId, table.createdAt),
    index('api_usage_campaign_id_idx').on(table.campaignId),
    index('api_usage_lead_search_id_idx').on(table.leadSearchId),
  ],
);

// ---------------------------------------------------------------------------
// Email polls
// ---------------------------------------------------------------------------

/** One email of a polled sequence, copied so later draft edits leave past votes intact. */
export type EmailPollEmail = { stepIndex: number; subject: string; body: string };

/** A blind test where anyone with the link scores sequences written by different models. */
export const emailPollSchema = pgTable(
  'email_poll',
  {
    // Also the token in the public link, so it must stay unguessable
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Hidden by default, so voters are not swayed by the model or its price
    showModel: boolean('show_model').notNull().default(false),
    showCost: boolean('show_cost').notNull().default(false),
    ...timestamps,
  },
  (table) => [index('email_poll_organization_id_idx').on(table.organizationId)],
);

/** One contact's sequence from one campaign, as voters see it. */
export const emailPollItemSchema = pgTable(
  'email_poll_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => emailPollSchema.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, { onDelete: 'set null' }),
    // The contact's email, lower-cased, so the same recipient is compared across campaigns
    groupKey: text('group_key').notNull(),
    groupLabel: text('group_label').notNull(),
    // Who the recipient is, from the research, so voters can judge the fit
    groupDescription: text('group_description'),
    // Copywriting model id when the poll was created
    model: text('model').notNull(),
    // The campaign's copywriting spend split evenly across the contacts it wrote
    costMicros: integer('cost_micros').notNull(),
    emails: jsonb('emails').$type<EmailPollEmail[]>().notNull(),
    ...timestamps,
  },
  (table) => [index('email_poll_item_poll_id_idx').on(table.pollId)],
);

/** One voter's score for one sequence. Voting again replaces it. */
export const emailPollVoteSchema = pgTable(
  'email_poll_vote',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => emailPollSchema.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => emailPollItemSchema.id, { onDelete: 'cascade' }),
    // Hash of the poll id and the voter's IP address, so no address is stored
    voterHash: text('voter_hash').notNull(),
    score: integer('score').notNull(),
    ...timestamps,
  },
  (table) => [
    unique('email_poll_vote_item_id_voter_hash_unique').on(table.itemId, table.voterHash),
    index('email_poll_vote_poll_id_idx').on(table.pollId),
    check('email_poll_vote_score_check', sql`${table.score} between 1 and 10`),
  ],
);

// ---------------------------------------------------------------------------
// Reply automation
// ---------------------------------------------------------------------------

/** One earlier email of a thread, as stored with a reply. */
export type ThreadSnapshot = {
  direction: 'outbound' | 'inbound';
  sentAt: string | null;
  text: string;
};

/** Where a lead stands between their first reply and the booked call. */
export const conversationStateEnum = pgEnum('conversation_state', [
  'replied',
  'classified',
  'demo_sent',
  'demo_viewed',
  'follow_up',
  'whatsapp',
  'call_booked',
  'nurturing',
  'out_of_office',
  // A salesperson answered by hand, so the automation steps aside
  'paused',
  'manual_review',
  'closed_not_interested',
  // The follow-ups ran out without an answer; a later reply reopens it
  'closed_no_reply',
  'stop',
  'wrong_person',
]);

export const replyCategoryEnum = pgEnum('reply_category', [
  'interested',
  'question',
  'objection',
  'not_now',
  'not_interested',
  'stop',
  'out_of_office',
  'wrong_person',
  'other',
]);

/** Who decided a reply's category. */
export const classificationSourceEnum = pgEnum('classification_source', [
  'ai',
  'stop_guard',
  'manual',
]);

export const automationModeEnum = pgEnum('automation_mode', ['draft', 'auto']);

export const objectionStatusEnum = pgEnum('objection_status', ['active', 'needs_review']);

/** How an organization's reply automation behaves, editable from the dashboard. */
export const automationSettingsSchema = pgTable('automation_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: organizationId().unique('automation_settings_organization_id_unique'),
  // Kill switch: when off nothing is sent, though replies are still read and classified
  enabled: boolean('enabled').notNull().default(true),
  // Drafts wait for a person to approve them; auto sends them after a random delay
  mode: automationModeEnum('mode').notNull().default('draft'),
  // Below this the reply goes to manual review, whatever its category
  confidenceThreshold: real('confidence_threshold').notNull().default(0.75),
  replyDelayMinMinutes: integer('reply_delay_min_minutes').notNull().default(15),
  replyDelayMaxMinutes: integer('reply_delay_max_minutes').notNull().default(20),
  // Italian business hours, in `AppConfig.timeZone`
  businessHourStart: integer('business_hour_start').notNull().default(9),
  businessHourEnd: integer('business_hour_end').notNull().default(18),
  // The offer every generated text is grounded in
  monthlyPrice: integer('monthly_price').notNull().default(97),
  newMonthlyPrice: integer('new_monthly_price').notNull().default(197),
  // Days after the first cold email when the price goes up for that lead
  priceIncreaseDays: integer('price_increase_days').notNull().default(15),
  onboardingSlotsPerMonth: integer('onboarding_slots_per_month').notNull().default(10),
  demoNotOpenedBusinessDays: integer('demo_not_opened_business_days').notNull().default(1),
  maxFollowUps: integer('max_follow_ups').notNull().default(2),
  whatsappAfterBusinessDays: integer('whatsapp_after_business_days').notNull().default(2),
  nurturingIntervalDays: integer('nurturing_interval_days').notNull().default(30),
  nurturingMaxCount: integer('nurturing_max_count').notNull().default(3),
  // Plain text like `campaign.copywritingModel`, so a new model needs no migration
  classificationModel: text('classification_model').notNull().default('claude-sonnet-5-5'),
  writingModel: text('writing_model').notNull().default('claude-opus-5-5'),
  // Where "no time works? write to me" sends the lead, in E.164
  whatsappBusinessNumber: text('whatsapp_business_number'),
  ...timestamps,
});

/** One email thread with a lead who replied to a cold email. */
export const conversationSchema = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    // Who the AI calls are billed to: the campaign owner, or whoever simulated the reply
    userId: text('user_id')
      .notNull()
      .references(() => userSchema.id, { onDelete: 'cascade' }),
    // Null on simulated conversations and on Instantly leads the platform did not upload
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contactSchema.id, { onDelete: 'set null' }),
    // Matched by email, since contacts carry no reference to the lead they came from
    leadId: uuid('lead_id').references(() => leadSchema.id, { onDelete: 'set null' }),
    instantlyCampaignId: text('instantly_campaign_id'),
    // Lower-cased
    leadEmail: text('lead_email').notNull(),
    company: text('company'),
    // The mailbox the cold email went out from; every reply must leave from it too
    eaccount: text('eaccount'),
    threadId: text('thread_id'),
    state: conversationStateEnum('state').notNull().default('replied'),
    followUpCount: integer('follow_up_count').notNull().default(0),
    nurturingCount: integer('nurturing_count').notNull().default(0),
    // A second negative reply closes the lead for good
    negativeReplyCount: integer('negative_reply_count').notNull().default(0),
    pausedReason: text('paused_reason'),
    outOfOfficeUntil: timestamp('out_of_office_until', { mode: 'date' }),
    // The first cold email, which the price increase date counts from
    firstEmailSentAt: timestamp('first_email_sent_at', { mode: 'date' }),
    nextActionAt: timestamp('next_action_at', { mode: 'date' }),
    lastInboundAt: timestamp('last_inbound_at', { mode: 'date' }),
    lastOutboundAt: timestamp('last_outbound_at', { mode: 'date' }),
    phoneE164: text('phone_e164'),
    // The lead as a GHL contact, once the call is booked
    ghlContactId: text('ghl_contact_id'),
    // Created from the dashboard: Instantly and GHL are never called for it
    isTest: boolean('is_test').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    // Nulls are distinct, so simulated conversations never collide
    unique('conversation_organization_id_instantly_campaign_id_lead_email_unique').on(
      table.organizationId,
      table.instantlyCampaignId,
      table.leadEmail,
    ),
    index('conversation_organization_id_state_idx').on(table.organizationId, table.state),
  ],
);

/** One reply received from a lead. */
export const inboundMessageSchema = pgTable(
  'inbound_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversationSchema.id, { onDelete: 'cascade' }),
    // Derived from the webhook payload, which carries no email id, so a redelivery is ignored
    dedupeKey: text('dedupe_key').notNull().unique(),
    // Resolved from the Instantly thread; unique, so two deliveries of one email are caught too
    instantlyEmailId: text('instantly_email_id').unique(),
    eventType: text('event_type').notNull(),
    subject: text('subject'),
    bodyText: text('body_text').notNull(),
    receivedAt: timestamp('received_at', { mode: 'date' }).notNull(),
    // The interest label Instantly gave the reply: a hint, not the decision
    instantlyInterestLabel: text('instantly_interest_label'),
    isAutoReply: boolean('is_auto_reply').notNull().default(false),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    // The earlier emails as they were when the reply arrived, so writing the answer needs no new call
    thread: jsonb('thread').$type<ThreadSnapshot[]>(),
    processedAt: timestamp('processed_at', { mode: 'date' }),
    ...timestamps,
  },
  (table) => [index('inbound_message_conversation_id_idx').on(table.conversationId)],
);

/** A reusable answer to an objection leads raise. The AI picks from these, never invents one. */
export const objectionSchema = pgTable(
  'objection',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    // Short slug the classifier answers with
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    // Phrases leads used, so the classifier recognises the objection
    examples: jsonb('examples').$type<string[]>().notNull().default([]),
    // The angle replies take, in plain words
    responseAngle: text('response_angle').notNull(),
    // Objections the AI added wait for a person to review the angle
    status: objectionStatusEnum('status').notNull().default('active'),
    // After the answer to this objection nothing more goes out, as for a tone that does not fit
    closesConversation: boolean('closes_conversation').notNull().default(false),
    sourceMessageId: uuid('source_message_id').references(() => inboundMessageSchema.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [unique('objection_organization_id_key_unique').on(table.organizationId, table.key)],
);

/** What a reply means, as decided by the AI, the stop guard or a person. */
export const replyClassificationSchema = pgTable('reply_classification', {
  id: uuid('id').primaryKey().defaultRandom(),
  inboundMessageId: uuid('inbound_message_id')
    .notNull()
    .unique()
    .references(() => inboundMessageSchema.id, { onDelete: 'cascade' }),
  category: replyCategoryEnum('category').notNull(),
  objectionId: uuid('objection_id').references(() => objectionSchema.id, { onDelete: 'set null' }),
  phoneE164: text('phone_e164'),
  // Name or email of the person the lead pointed to
  referral: text('referral'),
  // Which proposed time the lead picked, or the time they asked for
  chosenSlot: text('chosen_slot'),
  // ISO date an out-of-office reply says they are back
  returnDate: text('return_date'),
  confidence: real('confidence').notNull(),
  reasoning: text('reasoning').notNull(),
  source: classificationSourceEnum('source').notNull(),
  model: text('model'),
  ...timestamps,
});

/** Everything that happened to a conversation, and who did it. */
export const conversationEventSchema = pgTable(
  'conversation_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversationSchema.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    // Null when the automation acted on its own
    actorUserId: text('actor_user_id').references(() => userSchema.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('conversation_event_conversation_id_created_at_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

/** Addresses that asked never to be contacted again. Permanent. */
export const emailSuppressionSchema = pgTable(
  'email_suppression',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    // Lower-cased
    email: text('email').notNull(),
    reason: text('reason').notNull(),
    conversationId: uuid('conversation_id').references(() => conversationSchema.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    unique('email_suppression_organization_id_email_unique').on(table.organizationId, table.email),
  ],
);

export const outboundKindEnum = pgEnum('outbound_kind', [
  'reply',
  'follow_up',
  'nurturing',
  'closing',
  // Answers a reply that picked a call time, once the call is on the calendar
  'booking_confirmation',
]);

export const outboundStatusEnum = pgEnum('outbound_status', [
  'draft',
  'scheduled',
  'sent',
  'cancelled',
  'failed',
]);

/** An email the automation wrote to a lead, from draft to sent in the Instantly thread. */
export const outboundEmailSchema = pgTable(
  'outbound_email',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversationSchema.id, { onDelete: 'cascade' }),
    // The reply this answers; unique, so one reply never gets two answers
    inboundMessageId: uuid('inbound_message_id')
      .unique()
      .references(() => inboundMessageSchema.id, { onDelete: 'cascade' }),
    kind: outboundKindEnum('kind').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: outboundStatusEnum('status').notNull().default('draft'),
    // Why the email waits for a person: writing rules it broke, or a missing demo link
    issues: jsonb('issues').$type<string[]>().notNull().default([]),
    // The call times the email offers, ISO, so the lead's pick can be read back
    offeredSlots: jsonb('offered_slots').$type<string[]>().notNull().default([]),
    scheduledFor: timestamp('scheduled_for', { mode: 'date' }),
    sentAt: timestamp('sent_at', { mode: 'date' }),
    // Set once sent, so the thread can tell the automation's emails from a salesperson's
    instantlyEmailId: text('instantly_email_id'),
    approvedByUserId: text('approved_by_user_id').references(() => userSchema.id, {
      onDelete: 'set null',
    }),
    model: text('model'),
    errorMessage: text('error_message'),
    ...timestamps,
  },
  (table) => [index('outbound_email_conversation_id_idx').on(table.conversationId)],
);

/** One message of the example WhatsApp chat a demo plays. */
export type DemoChatMessage = {
  from: 'customer' | 'business';
  text: string;
  // Quick-reply buttons the business offers, such as two appointment times
  options: string[];
};

/** What a demo page shows, built once from the lead. Google reviews and photos are read live, never stored. */
export type DemoSnapshot = {
  // Bumped when the snapshot shape changes, so older demos are rebuilt on their next use
  version: number;
  company: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  category: string | null;
  categories: string[];
  openingHours: { day: string; hours: string }[];
  website: string | null;
  placeId: string | null;
  rating: number | null;
  reviewsCount: number | null;
  logoUrl: string | null;
  // Hex colour the page is tinted with
  primaryColor: string;
  landing: {
    headline: string;
    subheadline: string;
    about: string | null;
    ctaLabel: string;
    services: { name: string; description: string | null }[];
  };
  // An invented customer and conversation, always labelled as an example
  chat: {
    customerName: string;
    service: string | null;
    // What the CRM would note about the customer, from what they said in the chat
    note: string | null;
    messages: DemoChatMessage[];
  };
};

export const demoEventTypeEnum = pgEnum('demo_event_type', [
  'open',
  'step',
  'heartbeat',
  'whatsapp_click',
  'phone_submitted',
  'booked',
]);

/** The personalised page a lead is sent to, one per conversation. */
export const demoSchema = pgTable(
  'demo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .unique()
      .references(() => conversationSchema.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leadSchema.id, { onDelete: 'set null' }),
    // The public URL segment, with a random suffix so it cannot be guessed
    slug: text('slug').notNull().unique(),
    data: jsonb('data').$type<DemoSnapshot>().notNull(),
    firstOpenedAt: timestamp('first_opened_at', { mode: 'date' }),
    // Set once the lead reaches the last step
    completedAt: timestamp('completed_at', { mode: 'date' }),
    // Set once the lead books the call from the demo
    bookedAt: timestamp('booked_at', { mode: 'date' }),
    ...timestamps,
  },
  (table) => [index('demo_organization_id_idx').on(table.organizationId)],
);

/** One thing a visitor did on a demo page. */
export const demoEventSchema = pgTable(
  'demo_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    demoId: uuid('demo_id')
      .notNull()
      .references(() => demoSchema.id, { onDelete: 'cascade' }),
    // Random per browser tab, so two visits are told apart without storing who visited
    sessionId: text('session_id').notNull(),
    type: demoEventTypeEnum('type').notNull(),
    step: integer('step'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('demo_event_demo_id_created_at_idx').on(table.demoId, table.createdAt)],
);

export const whatsappHandoffStatusEnum = pgEnum('whatsapp_handoff_status', [
  'draft',
  'sent',
  'cancelled',
]);

/**
 * The hand-off of a silent lead to WhatsApp on GHL: the first message and the context
 * GHL's Conversation AI reads. One per conversation; the platform never writes on WhatsApp itself.
 */
export const whatsappHandoffSchema = pgTable('whatsapp_handoff', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .unique()
    .references(() => conversationSchema.id, { onDelete: 'cascade' }),
  firstMessage: text('first_message').notNull(),
  emailSummary: text('email_summary').notNull(),
  objections: text('objections').notNull(),
  demoBehavior: text('demo_behavior').notNull(),
  status: whatsappHandoffStatusEnum('status').notNull().default('draft'),
  // Rules the first message breaks, so a person checks it before it goes
  issues: jsonb('issues').$type<string[]>().notNull().default([]),
  approvedByUserId: text('approved_by_user_id').references(() => userSchema.id, {
    onDelete: 'set null',
  }),
  sentAt: timestamp('sent_at', { mode: 'date' }),
  model: text('model'),
  ...timestamps,
});

export const whatsappDirectionEnum = pgEnum('whatsapp_direction', ['outbound', 'inbound']);

/** A WhatsApp message GHL exchanged with the lead, kept read-only for the dashboard. */
export const whatsappMessageSchema = pgTable(
  'whatsapp_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversationSchema.id, { onDelete: 'cascade' }),
    direction: whatsappDirectionEnum('direction').notNull(),
    body: text('body').notNull(),
    receivedAt: timestamp('received_at', { mode: 'date' }).defaultNow().notNull(),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('whatsapp_message_conversation_id_idx').on(table.conversationId, table.receivedAt),
  ],
);
