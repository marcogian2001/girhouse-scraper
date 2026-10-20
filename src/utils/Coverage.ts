import { ITALIAN_PROVINCES } from './ItalianProvinces';

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
 * @param options.dailyPlaces Places scraped each day to find the emails asked for.
 * @returns The months left, rounded up to one decimal.
 */
export const estimateMonths = (options: { unusedPlaces: number; dailyPlaces: number }) =>
  Math.ceil((options.unusedPlaces / options.dailyPlaces / DAYS_PER_MONTH) * 10) / 10;

/**
 * Estimates how many places an area holds once its census is done, assuming the cells
 * left to scan hold as many places on average as those already scanned.
 * @param options The call options.
 * @param options.knownPlaces Places found so far.
 * @param options.totalCells Cells of the area, scanned or not.
 * @param options.pendingCells Cells not scanned yet.
 * @returns The estimated places, never fewer than those already found.
 */
export const estimatePlaces = (options: {
  knownPlaces: number;
  totalCells: number;
  pendingCells: number;
}) => {
  const scannedCells = options.totalCells - options.pendingCells;

  if (scannedCells <= 0) {
    return options.knownPlaces;
  }

  return Math.round((options.knownPlaces * options.totalCells) / scannedCells);
};

/**
 * Works out the share of the places already used, capped at one.
 * @param options The call options.
 * @param options.usedPlaces Places already scraped.
 * @param options.estimatedPlaces Places the area is estimated to hold.
 * @returns The share, between 0 and 1.
 */
export const toCompletion = (options: { usedPlaces: number; estimatedPlaces: number }) =>
  options.estimatedPlaces === 0 ? 0 : Math.min(options.usedPlaces / options.estimatedPlaces, 1);

/**
 * Names a searched area and finds its region.
 * A province of the plan is known; any other area is read from the label Google gave it,
 * like `Roma, RM, Italia`, through its province code or region name.
 * @param options The call options.
 * @param options.placeId The Google place id of the area.
 * @param options.label The location of the latest search of the area, if any.
 * @returns The name, kind and region, null when unknown.
 */
export const resolveArea = (options: { placeId: string; label: string | null }) => {
  const province = ITALIAN_PROVINCES.find((item) => item.placeId === options.placeId);

  if (province) {
    return { name: province.name, kind: 'province' as const, region: province.region };
  }

  const parts = (options.label ?? '').split(',').map((part) => part.trim());
  const [name = ''] = parts;
  const byCode = ITALIAN_PROVINCES.find((item) => parts.slice(1).includes(item.code));
  const byRegion = ITALIAN_PROVINCES.find((item) =>
    parts.some((part) => part.toLowerCase() === item.region.toLowerCase()),
  );

  return {
    name: name === '' ? null : name,
    kind: 'place' as const,
    region: byCode?.region ?? byRegion?.region ?? null,
  };
};

/**
 * Adds up how far a set of areas got.
 * @param areas The areas to add up.
 * @returns The share of their estimated places already used.
 */
export const sumCompletion = (areas: { usedPlaces: number; estimatedPlaces: number }[]) =>
  toCompletion({
    usedPlaces: areas.reduce((sum, area) => sum + area.usedPlaces, 0),
    estimatedPlaces: areas.reduce((sum, area) => sum + area.estimatedPlaces, 0),
  });
