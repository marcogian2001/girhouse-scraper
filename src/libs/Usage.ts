import type Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { apiUsageSchema, campaignSchema, leadSearchSchema } from '@/models/Schema';
import { PLACE_COST_MICROS } from '@/services/Apify';
import { COPYWRITING_MODEL, estimateCostMicros } from '@/services/Claude';
import { VERIFICATION_COST_MICROS } from '@/services/MillionVerifier';
import type { ParallelProcessor } from '@/services/Parallel';
import { PROCESSOR_RUN_COST_MICROS } from '@/services/Parallel';
import { EMAIL_COST_MICROS } from '@/services/Prospeo';
import { AppConfig } from '@/utils/AppConfig';
import type { DateRange } from '@/utils/DateRange';
import { db } from './DB';

type UsageProvider = (typeof apiUsageSchema.$inferSelect)['provider'];

/**
 * The calendar day a call was made on, in the app time zone.
 * `created_at` holds UTC wall time. The zone is inlined rather than bound, so
 * the expression renders identically in SELECT and GROUP BY.
 */
const localDay = sql<string>`to_char((${apiUsageSchema.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${sql.raw(`'${AppConfig.timeZone}'`)}, 'YYYY-MM-DD')`;

/**
 * Sums a column over one provider's rows.
 * @param provider The provider whose rows count.
 * @param column The column to add up.
 * @returns A numeric SQL aggregate, zero when nothing matches.
 */
const sumFor = (provider: UsageProvider, column: AnyPgColumn) =>
  sql<number>`coalesce(sum(${column}) filter (where ${apiUsageSchema.provider} = ${provider}), 0)`.mapWith(
    Number,
  );

const LEAD_PROVIDERS: UsageProvider[] = ['apify', 'prospeo', 'millionverifier'];

/** The aggregates every spend report shows, whatever it is grouped by. */
const usageTotals = {
  anthropicInputTokens: sumFor('anthropic', apiUsageSchema.inputTokens),
  anthropicOutputTokens: sumFor('anthropic', apiUsageSchema.outputTokens),
  anthropicCacheWriteTokens: sumFor('anthropic', apiUsageSchema.cacheWriteTokens),
  anthropicCacheReadTokens: sumFor('anthropic', apiUsageSchema.cacheReadTokens),
  anthropicTokens:
    sql<number>`coalesce(sum(${apiUsageSchema.inputTokens} + ${apiUsageSchema.outputTokens} + ${apiUsageSchema.cacheWriteTokens} + ${apiUsageSchema.cacheReadTokens}) filter (where ${apiUsageSchema.provider} = 'anthropic'), 0)`.mapWith(
      Number,
    ),
  anthropicCostMicros: sumFor('anthropic', apiUsageSchema.costMicros),
  parallelRuns:
    sql<number>`count(*) filter (where ${apiUsageSchema.provider} = 'parallel')`.mapWith(Number),
  parallelCostMicros: sumFor('parallel', apiUsageSchema.costMicros),
  // Scraping, email lookup and verification, which only lead searches spend on
  leadsCostMicros:
    sql<number>`coalesce(sum(${apiUsageSchema.costMicros}) filter (where ${inArray(apiUsageSchema.provider, LEAD_PROVIDERS)}), 0)`.mapWith(
      Number,
    ),
  totalCostMicros: sql<number>`coalesce(sum(${apiUsageSchema.costMicros}), 0)`.mapWith(Number),
};

export type UsageTotals = { [Key in keyof typeof usageTotals]: number };

/** Totals shown when there is no one to report on. */
export const EMPTY_USAGE_TOTALS: UsageTotals = {
  anthropicInputTokens: 0,
  anthropicOutputTokens: 0,
  anthropicCacheWriteTokens: 0,
  anthropicCacheReadTokens: 0,
  anthropicTokens: 0,
  anthropicCostMicros: 0,
  parallelRuns: 0,
  parallelCostMicros: 0,
  leadsCostMicros: 0,
  totalCostMicros: 0,
};

/** Which calls a report covers. Every report is scoped to one organization. */
type UsageFilter = {
  organizationId: string;
  range?: DateRange;
  campaignId?: string;
  leadSearchId?: string;
};

/**
 * Builds the WHERE clause for a report.
 * @param filter The report scope.
 * @returns The combined conditions.
 */
const matching = (filter: UsageFilter) =>
  and(
    eq(apiUsageSchema.organizationId, filter.organizationId),
    filter.range ? gte(localDay, filter.range.from) : undefined,
    filter.range ? lte(localDay, filter.range.to) : undefined,
    filter.campaignId ? eq(apiUsageSchema.campaignId, filter.campaignId) : undefined,
    filter.leadSearchId ? eq(apiUsageSchema.leadSearchId, filter.leadSearchId) : undefined,
  );

/** Who a billed call was made for: a campaign, or a lead search. */
type UsageOwner = {
  userId: string;
  organizationId: string;
  campaignId?: string;
  leadSearchId?: string;
};

/**
 * Records one copywriting call. Safe to repeat: a message is only counted once.
 * @param options The call options.
 * @param options.userId The owner of the campaign the call was made for.
 * @param options.organizationId The organization the campaign belongs to.
 * @param options.campaignId The campaign the call was made for.
 * @param options.messageId The Anthropic message id.
 * @param options.usage The token counts Claude reported.
 */
export const recordAnthropicUsage = async (options: {
  userId: string;
  organizationId: string;
  campaignId: string;
  messageId: string;
  usage: Anthropic.Usage;
}) => {
  await db
    .insert(apiUsageSchema)
    .values({
      userId: options.userId,
      organizationId: options.organizationId,
      campaignId: options.campaignId,
      provider: 'anthropic',
      externalId: options.messageId,
      model: COPYWRITING_MODEL,
      inputTokens: options.usage.input_tokens,
      outputTokens: options.usage.output_tokens,
      cacheWriteTokens: options.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: options.usage.cache_read_input_tokens ?? 0,
      costMicros: estimateCostMicros(options.usage),
    })
    .onConflictDoNothing();
};

/**
 * Records one completed research run. Safe to repeat: a run is only counted once.
 * @param options The call options.
 * @param options.userId The owner of the campaign or lead search the run was made for.
 * @param options.organizationId The organization the run belongs to.
 * @param options.campaignId The campaign the run was made for, if any.
 * @param options.leadSearchId The lead search the run was made for, if any.
 * @param options.runId The Parallel run id.
 * @param options.processor The processor tier the run used.
 */
export const recordParallelUsage = async (
  options: UsageOwner & { runId: string; processor: ParallelProcessor },
) => {
  await db
    .insert(apiUsageSchema)
    .values({
      userId: options.userId,
      organizationId: options.organizationId,
      campaignId: options.campaignId,
      leadSearchId: options.leadSearchId,
      provider: 'parallel',
      externalId: options.runId,
      model: options.processor,
      costMicros: PROCESSOR_RUN_COST_MICROS[options.processor],
    })
    .onConflictDoNothing();
};

/**
 * Records one Google Maps scrape. Safe to repeat: a run is only counted once.
 * @param options The call options.
 * @param options.userId The owner of the lead search.
 * @param options.organizationId The organization the lead search belongs to.
 * @param options.leadSearchId The lead search the scrape was made for.
 * @param options.runId The Apify run id.
 * @param options.places How many places the scrape returned.
 */
export const recordApifyUsage = async (
  options: UsageOwner & { leadSearchId: string; runId: string; places: number },
) => {
  await db
    .insert(apiUsageSchema)
    .values({
      userId: options.userId,
      organizationId: options.organizationId,
      leadSearchId: options.leadSearchId,
      provider: 'apify',
      externalId: options.runId,
      model: 'google_maps',
      costMicros: options.places * PLACE_COST_MICROS,
    })
    .onConflictDoNothing();
};

/**
 * Records one billed email lookup. Safe to repeat: a lead is only counted once.
 * @param options The call options.
 * @param options.userId The owner of the lead search.
 * @param options.organizationId The organization the lead search belongs to.
 * @param options.leadSearchId The lead search the lookup was made for.
 * @param options.leadId The lead whose email was found.
 */
export const recordProspeoUsage = async (
  options: UsageOwner & { leadSearchId: string; leadId: string },
) => {
  await db
    .insert(apiUsageSchema)
    .values({
      userId: options.userId,
      organizationId: options.organizationId,
      leadSearchId: options.leadSearchId,
      provider: 'prospeo',
      externalId: options.leadId,
      model: 'enrich_person',
      costMicros: EMAIL_COST_MICROS,
    })
    .onConflictDoNothing();
};

/**
 * Records one email verification. Safe to repeat: a lead is only counted once.
 * @param options The call options.
 * @param options.userId The owner of the lead search.
 * @param options.organizationId The organization the lead search belongs to.
 * @param options.leadSearchId The lead search the verification was made for.
 * @param options.leadId The lead whose email was verified.
 */
export const recordMillionVerifierUsage = async (
  options: UsageOwner & { leadSearchId: string; leadId: string },
) => {
  await db
    .insert(apiUsageSchema)
    .values({
      userId: options.userId,
      organizationId: options.organizationId,
      leadSearchId: options.leadSearchId,
      provider: 'millionverifier',
      externalId: options.leadId,
      model: 'verify',
      costMicros: VERIFICATION_COST_MICROS,
    })
    .onConflictDoNothing();
};

/**
 * Adds up the spend in scope.
 * @param filter The report scope.
 * @returns The totals, zero when nothing was spent.
 */
export const getUsageTotals = async (filter: UsageFilter) => {
  const [totals] = await db.select(usageTotals).from(apiUsageSchema).where(matching(filter));

  return totals ?? EMPTY_USAGE_TOTALS;
};

/**
 * Breaks the spend in scope down by calendar day, newest first.
 * @param filter The report scope.
 * @returns One row per day that had any spend.
 */
export const getDailyUsage = async (filter: UsageFilter) =>
  await db
    .select({ day: localDay, ...usageTotals })
    .from(apiUsageSchema)
    .where(matching(filter))
    .groupBy(localDay)
    .orderBy(desc(localDay));

/**
 * Breaks the spend in scope down by campaign and lead search, most expensive first.
 * Spend from deleted campaigns and searches is grouped under null ids and names.
 * @param filter The report scope.
 * @returns One row per campaign or lead search that had any spend.
 */
export const getCampaignUsage = async (filter: UsageFilter) =>
  await db
    .select({
      campaignId: apiUsageSchema.campaignId,
      name: campaignSchema.name,
      leadSearchId: apiUsageSchema.leadSearchId,
      leadSearchName: leadSearchSchema.name,
      ...usageTotals,
    })
    .from(apiUsageSchema)
    .leftJoin(campaignSchema, eq(apiUsageSchema.campaignId, campaignSchema.id))
    .leftJoin(leadSearchSchema, eq(apiUsageSchema.leadSearchId, leadSearchSchema.id))
    .where(matching(filter))
    .groupBy(
      apiUsageSchema.campaignId,
      campaignSchema.name,
      apiUsageSchema.leadSearchId,
      leadSearchSchema.name,
    )
    .orderBy(desc(sql`sum(${apiUsageSchema.costMicros})`));
