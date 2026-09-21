import type Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { apiUsageSchema, campaignSchema } from '@/models/Schema';
import { COPYWRITING_MODEL, estimateCostMicros } from '@/services/Claude';
import type { ParallelProcessor } from '@/services/Parallel';
import { PROCESSOR_RUN_COST_MICROS } from '@/services/Parallel';
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
};

/** Which calls a report covers. Every report is scoped to one user. */
type UsageFilter = { userId: string; range?: DateRange; campaignId?: string };

/**
 * Builds the WHERE clause for a report.
 * @param filter The report scope.
 * @returns The combined conditions.
 */
const matching = (filter: UsageFilter) =>
  and(
    eq(apiUsageSchema.userId, filter.userId),
    filter.range ? gte(localDay, filter.range.from) : undefined,
    filter.range ? lte(localDay, filter.range.to) : undefined,
    filter.campaignId ? eq(apiUsageSchema.campaignId, filter.campaignId) : undefined,
  );

/**
 * Records one copywriting call. Safe to repeat: a message is only counted once.
 * @param options The call options.
 * @param options.userId The owner of the campaign the call was made for.
 * @param options.campaignId The campaign the call was made for.
 * @param options.messageId The Anthropic message id.
 * @param options.usage The token counts Claude reported.
 */
export const recordAnthropicUsage = async (options: {
  userId: string;
  campaignId: string;
  messageId: string;
  usage: Anthropic.Usage;
}) => {
  await db
    .insert(apiUsageSchema)
    .values({
      userId: options.userId,
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
 * @param options.userId The owner of the campaign the run was made for.
 * @param options.campaignId The campaign the run was made for.
 * @param options.runId The Parallel run id.
 * @param options.processor The processor tier the run used.
 */
export const recordParallelUsage = async (options: {
  userId: string;
  campaignId: string;
  runId: string;
  processor: ParallelProcessor;
}) => {
  await db
    .insert(apiUsageSchema)
    .values({
      userId: options.userId,
      campaignId: options.campaignId,
      provider: 'parallel',
      externalId: options.runId,
      model: options.processor,
      costMicros: PROCESSOR_RUN_COST_MICROS[options.processor],
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
 * Breaks the spend in scope down by campaign, most expensive first.
 * Spend from deleted campaigns is grouped under a null id and name.
 * @param filter The report scope.
 * @returns One row per campaign that had any spend.
 */
export const getCampaignUsage = async (filter: UsageFilter) =>
  await db
    .select({ campaignId: apiUsageSchema.campaignId, name: campaignSchema.name, ...usageTotals })
    .from(apiUsageSchema)
    .leftJoin(campaignSchema, eq(apiUsageSchema.campaignId, campaignSchema.id))
    .where(matching(filter))
    .groupBy(apiUsageSchema.campaignId, campaignSchema.name)
    .orderBy(desc(sql`sum(${apiUsageSchema.costMicros})`));
