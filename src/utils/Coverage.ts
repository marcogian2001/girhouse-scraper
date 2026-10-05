/** The searches a plan scheduled within this window count against its daily quota. */
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

const DAYS_PER_MONTH = 30;

export type PairStatus = 'not_started' | 'in_progress' | 'exhausted';

/** One province searched for one term, as the scheduler sees it. */
export type CoveragePair = {
  provinceCode: string;
  term: string;
  tier: number;
  population: number;
  // Searches the plan already scheduled for the pair
  passes: number;
  // A scheduled search of the pair is still scraping
  isRunning: boolean;
  status: PairStatus;
};

/**
 * Decides whether a pair has nothing left to give.
 * @param area What is known of the pair's search area, or null before its first scan.
 * @param area.pendingCells Cells not scanned yet.
 * @param area.unusedPlaces Places found but never scraped.
 * @param area.reserveLeads Scraped leads in reserve the plan could still claim.
 * @param passes Searches the plan already scheduled for the pair.
 * @returns The status of the pair.
 */
export const toPairStatus = (
  area: { pendingCells: number; unusedPlaces: number; reserveLeads: number } | null,
  passes: number,
): PairStatus => {
  if (area && area.pendingCells === 0 && area.unusedPlaces === 0 && area.reserveLeads === 0) {
    return 'exhausted';
  }

  return passes === 0 ? 'not_started' : 'in_progress';
};

/**
 * Orders the pairs a plan can search next: fewest passes first, so the whole country
 * is covered before any pair is searched again, then by tier, then the larger provinces.
 * @param pairs Every pair of the plan.
 * @returns The pairs neither exhausted nor still scraping, best first.
 */
export const rankPairs = (pairs: CoveragePair[]) =>
  pairs
    .filter((pair) => pair.status !== 'exhausted' && !pair.isRunning)
    .toSorted((a, b) => a.passes - b.passes || a.tier - b.tier || b.population - a.population);

/**
 * Splits what is left of the daily quota into searches.
 * @param options The call options.
 * @param options.remaining Leads the plan may still ask for today.
 * @param options.leadsPerSearch The most leads one search asks for.
 * @returns The size of each search to create.
 */
export const planDailySearches = (options: { remaining: number; leadsPerSearch: number }) => {
  const sizes: number[] = [];

  for (let left = options.remaining; left > 0; left -= options.leadsPerSearch) {
    sizes.push(Math.min(left, options.leadsPerSearch));
  }

  return sizes;
};

/**
 * Estimates how long the places already found will last at the daily pace.
 * @param options The call options.
 * @param options.unusedPlaces Places found but never scraped.
 * @param options.dailyLeads Leads asked for each day.
 * @returns The months left, rounded up to one decimal.
 */
export const estimateMonths = (options: { unusedPlaces: number; dailyLeads: number }) =>
  Math.ceil((options.unusedPlaces / options.dailyLeads / DAYS_PER_MONTH) * 10) / 10;
