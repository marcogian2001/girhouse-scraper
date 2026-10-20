import { and, count, desc, eq, exists, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  coveragePlanSchema,
  coverageTermSchema,
  discoveredPlaceSchema,
  jobSchema,
  leadSchema,
  leadSearchSchema,
  searchAreaSchema,
  searchCellSchema,
} from '@/models/Schema';
import type { CoveragePair } from '@/utils/Coverage';
import {
  estimatePlaces,
  planDailySearches,
  QUOTA_WINDOW_MS,
  rankPairs,
  resolveArea,
  toCompletion,
  toPairStatus,
} from '@/utils/Coverage';
import { ITALIAN_PROVINCES } from '@/utils/ItalianProvinces';
import { RESERVE_LEAD_STATUSES } from '@/utils/Leads';
import { db } from './DB';
import { discoverPlaces, isUnusedPlace, loadSearchAreas } from './LeadJobs';

type CoveragePlan = typeof coveragePlanSchema.$inferSelect;

/** A pair with what the census found in its area, shown on the coverage page. */
export type CoveragePairStatus = CoveragePair & {
  region: string;
  hasArea: boolean;
  pendingCells: number;
  knownPlaces: number;
  unusedPlaces: number;
};

/** One area searched for a term, as the coverage page shows it. */
export type CoverageArea = ReturnType<typeof resolveArea> & {
  placeId: string;
  // Places scraped or already leads
  usedPlaces: number;
  unusedPlaces: number;
  estimatedPlaces: number;
  // Share of the estimated places already used, between 0 and 1
  completion: number;
};

/**
 * Builds the lookup key of a pair.
 * @param locationPlaceId The Google place id of the province.
 * @param term The normalised term.
 * @returns The key.
 */
const toPairKey = (locationPlaceId: string, term: string) => `${locationPlaceId}\n${term}`;

/**
 * Counts, for each search area of a plan, the cells left to scan and the places found.
 * @param options The call options.
 * @param options.plan The coverage plan.
 * @param options.terms The terms of the plan to count.
 * @param options.placeIds The places to keep, every searched place when missing.
 * @returns One row per existing area.
 */
const loadAreaCounts = async (options: {
  plan: CoveragePlan;
  terms: string[];
  placeIds?: string[];
}) => {
  const { organizationId, websiteFilter } = options.plan;
  const isOwnArea = eq(searchAreaSchema.organizationId, organizationId);

  const cells = db
    .select({
      areaId: searchCellSchema.searchAreaId,
      total: count().as('total'),
      pending: sql<number>`count(*) filter (where ${isNull(searchCellSchema.scannedAt)})`.as(
        'pending',
      ),
    })
    .from(searchCellSchema)
    .innerJoin(searchAreaSchema, eq(searchAreaSchema.id, searchCellSchema.searchAreaId))
    .where(isOwnArea)
    .groupBy(searchCellSchema.searchAreaId)
    .as('cells');

  // Only reserve leads the plan's website filter would claim keep a pair open
  const isClaimableReserve = exists(
    db
      .select({ id: leadSchema.id })
      .from(leadSchema)
      .where(
        and(
          eq(leadSchema.organizationId, organizationId),
          eq(leadSchema.placeId, discoveredPlaceSchema.placeId),
          inArray(leadSchema.status, [...RESERVE_LEAD_STATUSES]),
          websiteFilter === 'any' ? undefined : eq(leadSchema.hasWebsite, websiteFilter === 'with'),
        ),
      ),
  );

  const places = db
    .select({
      areaId: discoveredPlaceSchema.searchAreaId,
      known: count().as('known'),
      unused: sql<number>`count(*) filter (where ${isUnusedPlace(organizationId)})`.as('unused'),
      reserve: sql<number>`count(*) filter (where ${isClaimableReserve})`.as('reserve'),
    })
    .from(discoveredPlaceSchema)
    .innerJoin(searchAreaSchema, eq(searchAreaSchema.id, discoveredPlaceSchema.searchAreaId))
    .where(isOwnArea)
    .groupBy(discoveredPlaceSchema.searchAreaId)
    .as('places');

  return await db
    .select({
      locationPlaceId: searchAreaSchema.locationPlaceId,
      searchTerm: searchAreaSchema.searchTerm,
      totalCells: sql<number>`coalesce(${cells.total}, 0)`.mapWith(Number),
      pendingCells: sql<number>`coalesce(${cells.pending}, 0)`.mapWith(Number),
      knownPlaces: sql<number>`coalesce(${places.known}, 0)`.mapWith(Number),
      unusedPlaces: sql<number>`coalesce(${places.unused}, 0)`.mapWith(Number),
      reserveLeads: sql<number>`coalesce(${places.reserve}, 0)`.mapWith(Number),
    })
    .from(searchAreaSchema)
    .leftJoin(cells, eq(cells.areaId, searchAreaSchema.id))
    .leftJoin(places, eq(places.areaId, searchAreaSchema.id))
    .where(
      and(
        isOwnArea,
        options.placeIds ? inArray(searchAreaSchema.locationPlaceId, options.placeIds) : undefined,
        inArray(searchAreaSchema.searchTerm, options.terms),
      ),
    );
};

/**
 * Counts the searches a plan scheduled for each pair, and those still scraping.
 * @param planId The coverage plan.
 * @returns One row per pair searched at least once.
 */
const loadPasses = async (planId: string) => {
  // Scheduled searches carry a single term
  const term = sql<string>`${leadSearchSchema.searchTerms}->>0`;

  return await db
    .select({
      locationPlaceId: leadSearchSchema.locationPlaceId,
      term,
      passes: count(),
      running:
        sql<number>`count(*) filter (where ${leadSearchSchema.status} = 'searching')`.mapWith(
          Number,
        ),
    })
    .from(leadSearchSchema)
    .where(eq(leadSearchSchema.coveragePlanId, planId))
    .groupBy(leadSearchSchema.locationPlaceId, term);
};

/**
 * Works out where every province × term pair of a plan stands.
 * @param plan The coverage plan.
 * @returns One entry per province and active term.
 */
const loadPairStatuses = async (plan: CoveragePlan): Promise<CoveragePairStatus[]> => {
  const terms = await db
    .select({ term: coverageTermSchema.term, tier: coverageTermSchema.tier })
    .from(coverageTermSchema)
    .where(and(eq(coverageTermSchema.planId, plan.id), eq(coverageTermSchema.isActive, true)));

  if (terms.length === 0) {
    return [];
  }

  const [areas, passes] = await Promise.all([
    loadAreaCounts({
      plan,
      terms: terms.map((item) => item.term),
      placeIds: ITALIAN_PROVINCES.map((province) => province.placeId),
    }),
    loadPasses(plan.id),
  ]);
  const areaByKey = new Map(
    areas.map((area) => [toPairKey(area.locationPlaceId, area.searchTerm), area]),
  );
  const passesByKey = new Map(
    passes.map((pass) => [toPairKey(pass.locationPlaceId ?? '', pass.term), pass]),
  );

  return ITALIAN_PROVINCES.flatMap((province) =>
    terms.map((item) => {
      const key = toPairKey(province.placeId, item.term);
      const area = areaByKey.get(key) ?? null;
      const pass = passesByKey.get(key);
      const passCount = pass?.passes ?? 0;

      return {
        provinceCode: province.code,
        region: province.region,
        population: province.population,
        term: item.term,
        tier: item.tier,
        passes: passCount,
        isRunning: (pass?.running ?? 0) > 0,
        status: toPairStatus(area, passCount),
        hasArea: area !== null,
        pendingCells: area?.pendingCells ?? 0,
        knownPlaces: area?.knownPlaces ?? 0,
        unusedPlaces: area?.unusedPlaces ?? 0,
      };
    }),
  );
};

/**
 * Loads the latest location label typed for each place the organization searched.
 * @param organizationId The organization searching.
 * @returns The label of each place id.
 */
const loadAreaLabels = async (organizationId: string) => {
  const rows = await db
    .selectDistinctOn([leadSearchSchema.locationPlaceId], {
      placeId: leadSearchSchema.locationPlaceId,
      label: leadSearchSchema.location,
    })
    .from(leadSearchSchema)
    .where(
      and(
        eq(leadSearchSchema.organizationId, organizationId),
        isNotNull(leadSearchSchema.locationPlaceId),
      ),
    )
    .orderBy(leadSearchSchema.locationPlaceId, desc(leadSearchSchema.createdAt));

  return new Map(rows.map((row) => [row.placeId, row.label]));
};

/**
 * Lists, for every term of a plan, the areas searched for it and how far each one got.
 * Areas of manual searches count too, since they share the plan's census.
 * @param plan The coverage plan.
 * @returns One entry per term, in alphabetical order.
 */
export const loadCoverageAreas = async (plan: CoveragePlan) => {
  const terms = await db
    .select({ term: coverageTermSchema.term, isActive: coverageTermSchema.isActive })
    .from(coverageTermSchema)
    .where(eq(coverageTermSchema.planId, plan.id))
    .orderBy(coverageTermSchema.term);

  if (terms.length === 0) {
    return [];
  }

  const [areas, labels] = await Promise.all([
    loadAreaCounts({ plan, terms: terms.map((item) => item.term) }),
    loadAreaLabels(plan.organizationId),
  ]);

  return terms.map((item) => ({
    term: item.term,
    isActive: item.isActive,
    areas: areas
      .filter((area) => area.searchTerm === item.term)
      .map((area): CoverageArea => {
        const usedPlaces = area.knownPlaces - area.unusedPlaces;
        const estimatedPlaces = estimatePlaces(area);

        return {
          placeId: area.locationPlaceId,
          ...resolveArea({
            placeId: area.locationPlaceId,
            label: labels.get(area.locationPlaceId) ?? null,
          }),
          usedPlaces,
          unusedPlaces: area.unusedPlaces,
          estimatedPlaces,
          completion: toCompletion({ usedPlaces, estimatedPlaces }),
        };
      }),
  }));
};

/**
 * Creates the searches that fill what is left of a plan's daily quota, best pairs first.
 * @param options The call options.
 * @param options.plan The coverage plan.
 * @param options.pairs Where every pair of the plan stands.
 * @returns How many searches were created.
 */
const scheduleDailySearches = async (options: {
  plan: CoveragePlan;
  pairs: CoveragePairStatus[];
}) => {
  const { plan } = options;

  return await db.transaction(async (tx) => {
    // Locking the plan keeps two overlapping ticks from both filling the quota
    await tx
      .select({ id: coveragePlanSchema.id })
      .from(coveragePlanSchema)
      .where(eq(coveragePlanSchema.id, plan.id))
      .for('update');

    const [scheduled] = await tx
      .select({
        total: sql<number>`coalesce(sum(${leadSearchSchema.maxResults}), 0)`.mapWith(Number),
      })
      .from(leadSearchSchema)
      .where(
        and(
          eq(leadSearchSchema.coveragePlanId, plan.id),
          gt(leadSearchSchema.createdAt, new Date(Date.now() - QUOTA_WINDOW_MS)),
        ),
      );
    const sizes = planDailySearches({
      remaining: plan.dailyLeads - (scheduled?.total ?? 0),
      leadsPerSearch: plan.leadsPerSearch,
    });
    const searches = rankPairs(options.pairs).flatMap((pair, index) => {
      const province = ITALIAN_PROVINCES.find((item) => item.code === pair.provinceCode);
      const maxResults = sizes[index];

      return province && maxResults
        ? [
            {
              organizationId: plan.organizationId,
              userId: plan.userId,
              coveragePlanId: plan.id,
              name: `${pair.term} · ${province.name} · #${pair.passes + 1}`,
              searchTerms: [pair.term],
              location: province.name,
              locationPlaceId: province.placeId,
              maxResults,
              websiteFilter: plan.websiteFilter,
              processor: plan.processor,
            },
          ]
        : [];
    });

    if (searches.length === 0) {
      return 0;
    }

    const created = await tx
      .insert(leadSearchSchema)
      .values(searches)
      .returning({ id: leadSearchSchema.id });

    await tx
      .insert(jobSchema)
      .values(created.map((search) => ({ leadSearchId: search.id, type: 'lead_search' as const })));

    return created.length;
  });
};

/**
 * Scans the grids of a plan with Google, which is free, the larger provinces first.
 * This sizes every pair before Apify is paid for any of it.
 * @param options The call options.
 * @param options.plan The coverage plan.
 * @param options.pairs Where every pair of the plan stands.
 * @param options.deadline When to stop starting new scans, in epoch milliseconds.
 */
const runCensusSlice = async (options: {
  plan: CoveragePlan;
  pairs: CoveragePairStatus[];
  deadline: number;
}) => {
  const { organizationId } = options.plan;
  const terms = [...new Set(options.pairs.map((pair) => pair.term))];
  const provinces = ITALIAN_PROVINCES.filter((province) =>
    options.pairs.some(
      (pair) => pair.provinceCode === province.code && (!pair.hasArea || pair.pendingCells > 0),
    ),
  ).toSorted((a, b) => b.population - a.population);

  // Sequential on purpose: the slice stops at the deadline, whichever province it is on
  for (const province of provinces) {
    if (Date.now() >= options.deadline) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop
    const areas = await loadSearchAreas({
      organizationId,
      locationPlaceId: province.placeId,
      searchTerms: terms,
    });
    let hasPendingCells = true;

    while (hasPendingCells && Date.now() < options.deadline) {
      // oxlint-disable-next-line no-await-in-loop
      const scan = await discoverPlaces({
        organizationId,
        areas,
        wanted: Number.POSITIVE_INFINITY,
      });

      ({ hasPendingCells } = scan);
    }
  }
};

/**
 * Advances every active plan: fills its daily quota, then goes on with the census.
 * @param deadline When to stop starting new work, in epoch milliseconds.
 * @returns How many searches were created.
 */
export const runCoverageTick = async (deadline: number) => {
  const plans = await db
    .select()
    .from(coveragePlanSchema)
    .where(eq(coveragePlanSchema.isActive, true));
  let scheduled = 0;

  // Sequential on purpose: plans share the time budget of one cron call
  for (const plan of plans) {
    // oxlint-disable-next-line no-await-in-loop
    const pairs = await loadPairStatuses(plan);

    // oxlint-disable-next-line no-await-in-loop
    scheduled += await scheduleDailySearches({ plan, pairs });

    // oxlint-disable-next-line no-await-in-loop
    await runCensusSlice({ plan, pairs, deadline });
  }

  return { plans: plans.length, scheduled };
};
