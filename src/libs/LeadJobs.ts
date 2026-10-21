import { and, asc, countDistinct, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { EmailAttempt } from '@/models/Schema';
import {
  discoveredPlaceSchema,
  jobSchema,
  leadSchema,
  leadSearchSchema,
  searchAreaSchema,
  searchCellSchema,
} from '@/models/Schema';
import type { MapsPlace } from '@/services/Apify';
import { fetchMapsRun, isReadableWebsite, startMapsRun, toLeadRow } from '@/services/Apify';
import type { Rectangle } from '@/services/GooglePlaces';
import { fetchAreaViewport, scanRectangle } from '@/services/GooglePlaces';
import { verifyEmail } from '@/services/MillionVerifier';
import { createDecisionMakerRun, fetchTaskRunResult } from '@/services/Parallel';
import { findEmail } from '@/services/Prospeo';
import { hasReoon, verifyEmailPower } from '@/services/Reoon';
import { findWebsiteEmails } from '@/services/WebsiteContacts';
import {
  countLeadsToTake,
  estimateEmailYield,
  isPecEmail,
  nextEmailRoute,
  OPEN_LEAD_STATUSES,
  pickEmailRoutes,
  readPublicEmail,
  readResearchField,
  RESERVE_LEAD_STATUSES,
  scrapeBudget,
  splitRectangle,
  splitScrapedPlaces,
  toSearchKey,
  uniqueByPlaceId,
} from '@/utils/Leads';
import type { DecisionMaker } from '@/validations/LeadSearchValidation';
import { DecisionMakerValidation } from '@/validations/LeadSearchValidation';
import { db } from './DB';
import { completeJob, pollDelaySeconds, rescheduleJob } from './JobQueue';
import {
  recordApifyUsage,
  recordParallelUsage,
  recordProspeoUsage,
  recordVerificationUsage,
} from './Usage';

/** How long Parallel may hold a poll open. Short, so the worker stays snappy. */
const PARALLEL_POLL_TIMEOUT_SECONDS = 5;

/**
 * A search that still lacks emails after this many Apify runs stops with what it has.
 * Each run takes up to 1000 places, and topping up after qualification takes runs too.
 */
const MAX_SCRAPE_ROUNDS = 8;

/** Lead states research is over for, whether or not it found a deliverable email. */
const SETTLED_LEAD_STATUSES = ['ready', 'no_email', 'failed'] as const;

/** How long a lead waits for Prospeo after hitting its rate limit. */
const PROSPEO_RATE_LIMIT_DELAY_SECONDS = 60;

/** Addresses one route verifies at most, best first; only a website turns up more than one. */
const MAX_WEBSITE_CANDIDATES = 2;

/** Cells scanned with Google in one round at most, so a job stays well under its lock. */
const MAX_CELLS_PER_ROUND = 30;

/** Scan and book passes of one round, when concurrent searches keep taking what was found. */
const MAX_BOOKING_ATTEMPTS = 3;

/** A full cell is split at most this many times, about 1/512 of the area side: 60 m across Rome. */
const MAX_CELL_DEPTH = 9;

type Job = typeof jobSchema.$inferSelect;

type LeadSearch = typeof leadSearchSchema.$inferSelect;

type SearchCell = typeof searchCellSchema.$inferSelect;

type Lead = typeof leadSchema.$inferSelect;

/**
 * Loads the lead search a job belongs to.
 * @param leadSearchId The lead search to load, when the job carries one.
 * @returns The lead search row.
 * @throws {Error} When the job has no lead search or it no longer exists.
 */
const requireLeadSearch = async (leadSearchId: string | null) => {
  if (!leadSearchId) {
    throw new Error('Job is missing its lead search');
  }

  const search = await db.query.leadSearchSchema.findFirst({
    where: eq(leadSearchSchema.id, leadSearchId),
  });

  if (!search) {
    throw new Error(`Lead search ${leadSearchId} no longer exists`);
  }

  return search;
};

/**
 * Loads the lead a job targets.
 * @param leadId The lead to load, when the job carries one.
 * @returns The lead row.
 * @throws {Error} When the job has no lead or the lead is gone.
 */
const requireLead = async (leadId: string | null) => {
  if (!leadId) {
    throw new Error('Job is missing its lead');
  }

  const lead = await db.query.leadSchema.findFirst({ where: eq(leadSchema.id, leadId) });

  if (!lead) {
    throw new Error(`Lead ${leadId} no longer exists`);
  }

  return lead;
};

/**
 * Picks the contact fields out of the decision maker research.
 * Without a confirmed decision maker the lead is still mailed, addressed to the business.
 * @param research The research Parallel returned, when it parsed.
 * @returns The lead columns describing the decision maker.
 */
const toContactFields = (research: DecisionMaker | null) => {
  const person = research?.decision_maker_found ? research : null;

  return {
    firstName: readResearchField(person?.first_name),
    lastName: readResearchField(person?.last_name),
    role: readResearchField(person?.role),
    linkedinUrl: readResearchField(person?.linkedin_url),
  };
};

/**
 * Counts the rows of a query that meet a condition, next to other counts.
 * @param condition The condition a row must meet.
 * @returns The count as a selected column.
 */
const countWhere = (condition: SQL) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

/**
 * Counts how research went for the leads of a search, and for every lead of its organization.
 * @param options The call options.
 * @param options.organizationId The organization searching.
 * @param options.leadSearchId The lead search, or null to count the organization alone.
 * @returns Ready, pending and settled leads of the search, and ready and settled leads of the organization.
 */
const countEmailOutcomes = async (options: {
  organizationId: string;
  leadSearchId: string | null;
}) => {
  const inSearch = options.leadSearchId
    ? eq(leadSchema.leadSearchId, options.leadSearchId)
    : sql`false`;
  const isReady = eq(leadSchema.status, 'ready');
  const isPending = inArray(leadSchema.status, [...OPEN_LEAD_STATUSES]);
  const isSettled = inArray(leadSchema.status, [...SETTLED_LEAD_STATUSES]);
  const [counts] = await db
    .select({
      ready: countWhere(sql`${inSearch} and ${isReady}`),
      pending: countWhere(sql`${inSearch} and ${isPending}`),
      settled: countWhere(sql`${inSearch} and ${isSettled}`),
      organizationReady: countWhere(isReady),
      organizationSettled: countWhere(isSettled),
    })
    .from(leadSchema)
    .where(eq(leadSchema.organizationId, options.organizationId));

  return {
    search: {
      ready: counts?.ready ?? 0,
      pending: counts?.pending ?? 0,
      settled: counts?.settled ?? 0,
    },
    organization: {
      ready: counts?.organizationReady ?? 0,
      settled: counts?.organizationSettled ?? 0,
    },
  };
};

/**
 * Estimates the share of an organization's researched leads that end with a deliverable email.
 * @param organizationId The organization.
 * @returns The expected share, used to size searches before they start.
 */
export const loadOrganizationEmailYield = async (organizationId: string) => {
  const outcomes = await countEmailOutcomes({ organizationId, leadSearchId: null });

  return estimateEmailYield(outcomes);
};

/**
 * Hands the leads a search never started researching back to the reserve, once it has its emails.
 * Leads already being researched go on, since their research is paid for.
 * @param leadSearchId The lead search that reached its target.
 * @returns How many leads went back to the reserve.
 */
const releaseSurplusLeads = async (leadSearchId: string) =>
  await db.transaction(async (tx) => {
    // Only queued jobs: a running one may be starting its research right now
    const dropped = await tx
      .delete(jobSchema)
      .where(
        and(
          eq(jobSchema.leadSearchId, leadSearchId),
          eq(jobSchema.type, 'lead_research'),
          eq(jobSchema.status, 'queued'),
          inArray(
            jobSchema.leadId,
            tx
              .select({ id: leadSchema.id })
              .from(leadSchema)
              .where(
                and(
                  eq(leadSchema.leadSearchId, leadSearchId),
                  eq(leadSchema.status, 'found'),
                  isNull(leadSchema.parallelRunId),
                ),
              ),
          ),
        ),
      )
      .returning({ leadId: jobSchema.leadId });
    const leadIds = dropped.flatMap((job) => (job.leadId ? [job.leadId] : []));

    if (leadIds.length === 0) {
      return 0;
    }

    const released = await tx
      .update(leadSchema)
      .set({ status: 'reserve' })
      .where(and(inArray(leadSchema.id, leadIds), eq(leadSchema.status, 'found')))
      .returning({ id: leadSchema.id });

    return released.length;
  });

/**
 * Settles a qualifying lead search once none of its leads is still being worked on:
 * short of emails, it goes back to searching while its area has new businesses; otherwise it is done.
 * A search that reached its target gives the leads it no longer needs back to the reserve.
 * @param leadSearchId The lead search to refresh.
 */
const syncLeadSearchStatus = async (leadSearchId: string) => {
  const search = await requireLeadSearch(leadSearchId);

  if (search.status !== 'qualifying') {
    return;
  }

  const outcomes = await countEmailOutcomes({
    organizationId: search.organizationId,
    leadSearchId,
  });
  const isComplete = outcomes.search.ready >= search.maxResults;
  const released = isComplete ? await releaseSurplusLeads(leadSearchId) : 0;

  if (outcomes.search.pending - released > 0) {
    return;
  }

  const isQualifying = and(
    eq(leadSearchSchema.id, leadSearchId),
    eq(leadSearchSchema.status, 'qualifying'),
  );

  if (isComplete || search.areaExhausted || search.scrapeRounds >= MAX_SCRAPE_ROUNDS) {
    await db.update(leadSearchSchema).set({ status: 'done' }).where(isQualifying);

    return;
  }

  // Only the job that flips the status tops up, when several leads settle at once
  await db.transaction(async (tx) => {
    const reopened = await tx
      .update(leadSearchSchema)
      .set({ status: 'searching' })
      .where(isQualifying)
      .returning({ id: leadSearchSchema.id });

    if (reopened.length > 0) {
      await tx.insert(jobSchema).values({ leadSearchId, type: 'lead_search' });
    }
  });
};

/**
 * Counts the businesses a search still needs to take to reach its target of deliverable emails,
 * leaving out those held in reserve.
 * @param search The lead search.
 * @returns How many more businesses the search wants.
 */
const countMissingLeads = async (search: LeadSearch) => {
  const outcomes = await countEmailOutcomes({
    organizationId: search.organizationId,
    leadSearchId: search.id,
  });

  return countLeadsToTake({
    target: search.maxResults,
    ready: outcomes.search.ready,
    pending: outcomes.search.pending,
    emailYield: estimateEmailYield(outcomes),
  });
};

/**
 * Stores the columns of a cell covering a rectangle.
 * @param rectangle The rectangle the cell covers.
 * @returns The cell columns.
 */
const toCellColumns = (rectangle: Rectangle) => ({
  lowLatitude: rectangle.low.latitude,
  lowLongitude: rectangle.low.longitude,
  highLatitude: rectangle.high.latitude,
  highLongitude: rectangle.high.longitude,
});

/**
 * Reads the rectangle a cell covers.
 * @param cell The cell.
 * @returns The rectangle.
 */
const toRectangle = (cell: SearchCell): Rectangle => ({
  low: { latitude: cell.lowLatitude, longitude: cell.lowLongitude },
  high: { latitude: cell.highLatitude, longitude: cell.highLongitude },
});

/**
 * Loads the areas of some terms in one place, creating those never searched before.
 * A new area starts as a single cell covering the whole Google Maps viewport.
 * @param options The call options.
 * @param options.organizationId The organization searching.
 * @param options.locationPlaceId The Google place id of the area.
 * @param options.searchTerms The terms to search for, as typed.
 * @returns The areas, one per distinct term.
 */
export const loadSearchAreas = async (options: {
  organizationId: string;
  locationPlaceId: string;
  searchTerms: string[];
}) => {
  const { organizationId, locationPlaceId } = options;
  const terms = [...new Set(options.searchTerms.map(toSearchKey))];
  const where = and(
    eq(searchAreaSchema.organizationId, organizationId),
    eq(searchAreaSchema.locationPlaceId, locationPlaceId),
    inArray(searchAreaSchema.searchTerm, terms),
  );
  const existing = await db.select().from(searchAreaSchema).where(where);
  const newTerms = terms.filter((term) => !existing.some((area) => area.searchTerm === term));

  if (newTerms.length === 0) {
    return existing;
  }

  const viewport = await fetchAreaViewport(locationPlaceId);

  // One transaction, so an area never exists without its first cell
  await db.transaction(async (tx) => {
    const created = await tx
      .insert(searchAreaSchema)
      .values(
        newTerms.map((searchTerm) => ({
          organizationId,
          locationPlaceId,
          searchTerm,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: searchAreaSchema.id });

    if (created.length > 0) {
      await tx
        .insert(searchCellSchema)
        .values(created.map((area) => ({ searchAreaId: area.id, ...toCellColumns(viewport) })));
    }
  });

  return await db.select().from(searchAreaSchema).where(where);
};

/**
 * Keeps the discovered places the organization never scraped.
 * @param organizationId The organization searching.
 * @returns The where clause over discovered places.
 */
export const isUnusedPlace = (organizationId: string) =>
  sql`${isNull(discoveredPlaceSchema.scrapedAt)} and ${notExists(
    db
      .select({ id: leadSchema.id })
      .from(leadSchema)
      .where(
        and(
          eq(leadSchema.organizationId, organizationId),
          eq(leadSchema.placeId, discoveredPlaceSchema.placeId),
        ),
      ),
  )}`;

/**
 * Filters the places found in some areas down to those never scraped by the organization.
 * @param options The call options.
 * @param options.organizationId The organization searching.
 * @param options.areaIds The areas to look in.
 * @returns The where clause over discovered places.
 */
const unusedPlaces = (options: { organizationId: string; areaIds: string[] }) =>
  and(
    inArray(discoveredPlaceSchema.searchAreaId, options.areaIds),
    isUnusedPlace(options.organizationId),
  );

/**
 * Counts the places found in some areas that were never scraped.
 * @param options The call options.
 * @param options.organizationId The organization searching.
 * @param options.areaIds The areas to look in.
 * @returns How many places are ready to be scraped.
 */
const countUnusedPlaces = async (options: { organizationId: string; areaIds: string[] }) => {
  const [unused] = await db
    .select({ total: countDistinct(discoveredPlaceSchema.placeId) })
    .from(discoveredPlaceSchema)
    .where(unusedPlaces(options));

  return unused?.total ?? 0;
};

/**
 * Books unscraped places of some areas for one Apify run, so concurrent searches never pay twice.
 * The rows are locked while booked, and the same business found under another term is booked too.
 * @param options The call options.
 * @param options.organizationId The organization searching.
 * @param options.areaIds The areas to take places from.
 * @param options.limit How many places to book at most.
 * @param options.bookedAt The booking time, which identifies the places of one run.
 * @returns The booked place ids.
 */
const bookPlaces = async (options: {
  organizationId: string;
  areaIds: string[];
  limit: number;
  bookedAt: Date;
}) => {
  const { bookedAt } = options;
  const booked = await db
    .update(discoveredPlaceSchema)
    .set({ scrapedAt: bookedAt })
    .where(
      and(
        isNull(discoveredPlaceSchema.scrapedAt),
        inArray(
          discoveredPlaceSchema.id,
          db
            .select({ id: discoveredPlaceSchema.id })
            .from(discoveredPlaceSchema)
            .where(
              unusedPlaces({ organizationId: options.organizationId, areaIds: options.areaIds }),
            )
            .orderBy(asc(discoveredPlaceSchema.createdAt))
            .limit(options.limit)
            .for('update', { skipLocked: true }),
        ),
      ),
    )
    .returning({ placeId: discoveredPlaceSchema.placeId });
  const placeIds = [...new Set(booked.map((place) => place.placeId))];

  if (placeIds.length > 0) {
    await db
      .update(discoveredPlaceSchema)
      .set({ scrapedAt: bookedAt })
      .where(
        and(
          isNull(discoveredPlaceSchema.scrapedAt),
          inArray(discoveredPlaceSchema.placeId, placeIds),
          inArray(
            discoveredPlaceSchema.searchAreaId,
            db
              .select({ id: searchAreaSchema.id })
              .from(searchAreaSchema)
              .where(eq(searchAreaSchema.organizationId, options.organizationId)),
          ),
        ),
      );
  }

  return placeIds;
};

/**
 * Hands booked places back, when the Apify run they were booked for could not start.
 * @param booking The booking to undo.
 * @param booking.placeIds The booked place ids.
 * @param booking.bookedAt The booking time.
 */
const releasePlaces = async (booking: { placeIds: string[]; bookedAt: Date }) => {
  await db
    .update(discoveredPlaceSchema)
    .set({ scrapedAt: null })
    .where(
      and(
        eq(discoveredPlaceSchema.scrapedAt, booking.bookedAt),
        inArray(discoveredPlaceSchema.placeId, booking.placeIds),
      ),
    );
};

/**
 * Lists a cell with Google Text Search and stores the places it holds.
 * Google stops at 60 places, so a full cell is also split into quarters to scan later.
 * @param options The call options.
 * @param options.cell The cell to scan.
 * @param options.searchTerm What to search for.
 */
const scanCell = async (options: { cell: SearchCell; searchTerm: string }) => {
  const { cell } = options;
  const scan = await scanRectangle({ query: options.searchTerm, rectangle: toRectangle(cell) });

  await db.transaction(async (tx) => {
    if (scan.placeIds.length > 0) {
      await tx
        .insert(discoveredPlaceSchema)
        .values(scan.placeIds.map((placeId) => ({ searchAreaId: cell.searchAreaId, placeId })))
        .onConflictDoNothing();
    }

    if (scan.isFull && cell.depth < MAX_CELL_DEPTH) {
      await tx
        .insert(searchCellSchema)
        .values(
          splitRectangle(toRectangle(cell)).map((rectangle) => ({
            searchAreaId: cell.searchAreaId,
            depth: cell.depth + 1,
            ...toCellColumns(rectangle),
          })),
        )
        .onConflictDoNothing();
    }

    await tx
      .update(searchCellSchema)
      .set({ scannedAt: new Date() })
      .where(eq(searchCellSchema.id, cell.id));
  });
};

/**
 * Scans the cells of some areas with Google, which is free, until enough unscraped places are known.
 * Areas take turns, so every term of a search gets its share.
 * @param options The call options.
 * @param options.organizationId The organization searching.
 * @param options.areas The areas of the search.
 * @param options.wanted How many unscraped places are wanted.
 * @returns Whether some cells are still to scan.
 */
export const discoverPlaces = async (options: {
  organizationId: string;
  areas: (typeof searchAreaSchema.$inferSelect)[];
  wanted: number;
}) => {
  const areaIds = options.areas.map((area) => area.id);
  let scanned = 0;

  // Sequential on purpose: each scan decides whether another one is needed
  while (scanned < MAX_CELLS_PER_ROUND) {
    // oxlint-disable-next-line no-await-in-loop
    const available = await countUnusedPlaces({
      organizationId: options.organizationId,
      areaIds,
    });

    if (available >= options.wanted) {
      return { hasPendingCells: true };
    }

    // The next cell of each area, the largest first
    // oxlint-disable-next-line no-await-in-loop
    const cells = await db
      .selectDistinctOn([searchCellSchema.searchAreaId])
      .from(searchCellSchema)
      .where(
        and(inArray(searchCellSchema.searchAreaId, areaIds), isNull(searchCellSchema.scannedAt)),
      )
      .orderBy(
        searchCellSchema.searchAreaId,
        asc(searchCellSchema.depth),
        asc(searchCellSchema.createdAt),
      );

    if (cells.length === 0) {
      return { hasPendingCells: false };
    }

    // oxlint-disable-next-line no-await-in-loop
    await Promise.all(
      cells.map(async (cell) => {
        const area = options.areas.find((item) => item.id === cell.searchAreaId);

        if (area) {
          await scanCell({ cell, searchTerm: area.searchTerm });
        }
      }),
    );

    scanned += cells.length;
  }

  return { hasPendingCells: true };
};

/**
 * Books the places of one Apify run, scanning the areas further while the booking falls short.
 * A concurrent search may book what a scan just found, so the scan goes on from there.
 * @param options The call options.
 * @param options.organizationId The organization searching.
 * @param options.areas The areas of the search.
 * @param options.wanted How many places to book.
 * @param options.bookedAt The booking time, which identifies the places of this run.
 * @returns The booked place ids.
 */
const bookScrapeBatch = async (options: {
  organizationId: string;
  areas: (typeof searchAreaSchema.$inferSelect)[];
  wanted: number;
  bookedAt: Date;
}) => {
  const areaIds = options.areas.map((area) => area.id);
  const placeIds: string[] = [];

  // Sequential on purpose: each attempt only books what the previous ones left short
  for (let attempt = 0; attempt < MAX_BOOKING_ATTEMPTS; attempt += 1) {
    const missing = options.wanted - placeIds.length;

    if (missing <= 0) {
      break;
    }

    // oxlint-disable-next-line no-await-in-loop
    const scan = await discoverPlaces({
      organizationId: options.organizationId,
      areas: options.areas,
      wanted: missing,
    });
    // oxlint-disable-next-line no-await-in-loop
    const booked = await bookPlaces({
      organizationId: options.organizationId,
      areaIds,
      limit: missing,
      bookedAt: options.bookedAt,
    });

    placeIds.push(...booked);

    if (booked.length === 0 && !scan.hasPendingCells) {
      break;
    }
  }

  return placeIds;
};

/**
 * Hands a search the reserve leads of its areas that match its website filter.
 * These were scraped and paid for by an earlier search, but never researched.
 * @param options The call options.
 * @param options.search The lead search.
 * @param options.areaIds The areas of the search.
 * @param options.limit How many leads to take at most.
 */
const claimReserve = async (options: { search: LeadSearch; areaIds: string[]; limit: number }) => {
  const { search } = options;

  if (options.limit <= 0) {
    return;
  }

  const isReserve = and(
    eq(leadSchema.organizationId, search.organizationId),
    inArray(leadSchema.status, [...RESERVE_LEAD_STATUSES]),
  );
  const candidates = db
    .select({ id: leadSchema.id })
    .from(leadSchema)
    .where(
      and(
        isReserve,
        search.websiteFilter === 'any'
          ? undefined
          : eq(leadSchema.hasWebsite, search.websiteFilter === 'with'),
        inArray(
          leadSchema.placeId,
          db
            .select({ placeId: discoveredPlaceSchema.placeId })
            .from(discoveredPlaceSchema)
            .where(inArray(discoveredPlaceSchema.searchAreaId, options.areaIds)),
        ),
      ),
    )
    .orderBy(asc(leadSchema.createdAt))
    .limit(options.limit);

  await db.transaction(async (tx) => {
    // Checking the status again keeps two searches from claiming the same lead
    const claimed = await tx
      .update(leadSchema)
      .set({ leadSearchId: search.id, status: 'found' })
      .where(and(isReserve, inArray(leadSchema.id, candidates)))
      .returning({ id: leadSchema.id });

    if (claimed.length === 0) {
      return;
    }

    await tx.insert(jobSchema).values(
      claimed.map((lead) => ({
        leadSearchId: search.id,
        leadId: lead.id,
        type: 'lead_research' as const,
      })),
    );

    await tx
      .update(leadSearchSchema)
      .set({ reserveClaimed: sql`${leadSearchSchema.reserveClaimed} + ${claimed.length}` })
      .where(eq(leadSearchSchema.id, search.id));
  });
};

/**
 * Closes the scraping of a search: its leads are now being qualified.
 * @param options The call options.
 * @param options.job The lead search job being processed.
 * @param options.search The lead search.
 */
const finishLeadSearch = async (options: { job: Job; search: LeadSearch }) => {
  await db
    .update(leadSearchSchema)
    .set({ status: 'qualifying' })
    .where(eq(leadSearchSchema.id, options.search.id));

  await syncLeadSearchStatus(options.search.id);
  await completeJob(options.job.id);
};

/**
 * Fills a search from the reserve, then sends the places never scraped to Apify.
 * @param options The call options.
 * @param options.job The lead search job being processed.
 * @param options.search The lead search.
 */
const startScrapeRound = async (options: { job: Job; search: LeadSearch }) => {
  const { search } = options;

  if (!search.locationPlaceId) {
    throw new Error('Lead search has no area to search in');
  }

  const areas = await loadSearchAreas({
    organizationId: search.organizationId,
    locationPlaceId: search.locationPlaceId,
    searchTerms: search.searchTerms,
  });
  const areaIds = areas.map((area) => area.id);

  await claimReserve({ search, areaIds, limit: await countMissingLeads(search) });

  const missingBeforeScan = await countMissingLeads(search);

  if (missingBeforeScan > 0) {
    await discoverPlaces({
      organizationId: search.organizationId,
      areas,
      wanted: scrapeBudget({ missing: missingBeforeScan, filter: search.websiteFilter }),
    });

    // The scan may turn up businesses an older search kept in reserve
    await claimReserve({ search, areaIds, limit: missingBeforeScan });
  }

  const missing = await countMissingLeads(search);
  const bookedAt = new Date();
  const placeIds =
    missing > 0
      ? await bookScrapeBatch({
          organizationId: search.organizationId,
          areas,
          wanted: scrapeBudget({ missing, filter: search.websiteFilter }),
          bookedAt,
        })
      : [];

  if (placeIds.length === 0) {
    if (missing > 0) {
      // Nothing new is left to scrape, so the search stops topping up
      await db
        .update(leadSearchSchema)
        .set({ areaExhausted: true })
        .where(eq(leadSearchSchema.id, search.id));
    }

    await finishLeadSearch(options);

    return;
  }

  const runId = await startMapsRun(placeIds).catch(async (error: unknown) => {
    // Nothing was scraped, so the places go back for the retry to book again
    await releasePlaces({ placeIds, bookedAt });
    throw error;
  });

  await db
    .update(leadSearchSchema)
    .set({ apifyRunId: runId, scrapeRounds: search.scrapeRounds + 1 })
    .where(eq(leadSearchSchema.id, search.id));

  await rescheduleJob({ jobId: options.job.id, delaySeconds: pollDelaySeconds(0) });
};

/**
 * Stores the places of a finished Apify run: what the search still needs is researched,
 * the rest is kept in reserve for later searches.
 * @param options The call options.
 * @param options.search The lead search.
 * @param options.places The places Apify returned.
 */
const storeScrapedPlaces = async (options: { search: LeadSearch; places: MapsPlace[] }) => {
  const { search } = options;
  const rows = uniqueByPlaceId(options.places).map((place) => ({
    ...toLeadRow(place),
    leadSearchId: search.id,
    organizationId: search.organizationId,
  }));
  const { wanted, reserve } = splitScrapedPlaces({
    rows,
    filter: search.websiteFilter,
    missing: await countMissingLeads(search),
  });

  // One transaction, so a retry never leaves leads behind without their jobs
  await db.transaction(async (tx) => {
    // A business another search already found is skipped, so it is never paid for twice
    const inserted =
      wanted.length > 0
        ? await tx
            .insert(leadSchema)
            .values(wanted.map((row) => ({ ...row, status: 'found' as const })))
            .onConflictDoNothing()
            .returning({ id: leadSchema.id })
        : [];

    if (reserve.length > 0) {
      await tx
        .insert(leadSchema)
        .values(reserve.map((row) => ({ ...row, status: 'reserve' as const })))
        .onConflictDoNothing();
    }

    if (inserted.length > 0) {
      await tx.insert(jobSchema).values(
        inserted.map((lead) => ({
          leadSearchId: search.id,
          leadId: lead.id,
          type: 'lead_research' as const,
        })),
      );
    }

    await tx
      .update(leadSearchSchema)
      .set({ apifyRunId: null })
      .where(eq(leadSearchSchema.id, search.id));
  });
};

/**
 * Runs the scraping of a lead search in rounds: each round takes from the reserve,
 * scans the area with Google for free, and pays Apify only for places never scraped.
 * @param job The lead search job being processed.
 */
const runLeadSearchJob = async (job: Job) => {
  const search = await requireLeadSearch(job.leadSearchId);

  if (!search.apifyRunId) {
    await startScrapeRound({ job, search });

    return;
  }

  const outcome = await fetchMapsRun(search.apifyRunId);

  if (outcome.state === 'pending') {
    const elapsedMs = Date.now() - search.updatedAt.getTime();

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(elapsedMs) });

    return;
  }

  if (outcome.state === 'failed') {
    throw new Error(outcome.error);
  }

  // Apify bills every place scraped, including those kept in reserve
  await recordApifyUsage({
    userId: search.userId,
    organizationId: search.organizationId,
    leadSearchId: search.id,
    runId: search.apifyRunId,
    places: outcome.places.length,
  });

  await storeScrapedPlaces({ search, places: outcome.places });

  // Places Apify skipped, or another search took meanwhile, leave a gap for one more round
  if (search.scrapeRounds < MAX_SCRAPE_ROUNDS && (await countMissingLeads(search)) > 0) {
    await rescheduleJob({ jobId: job.id, delaySeconds: 0 });

    return;
  }

  await finishLeadSearch({ job, search });
};

/**
 * Picks the email routes of a lead.
 * @param options The call options.
 * @param options.lead The lead, with its decision maker once known.
 * @param options.publicEmail The address the business publishes, if any.
 * @returns Which routes can be tried.
 */
const readEmailRoutes = (options: {
  lead: Pick<Lead, 'domain' | 'firstName' | 'lastName' | 'website'>;
  publicEmail: string | null;
}) =>
  pickEmailRoutes({
    lead: options.lead,
    publicEmail: options.publicEmail,
    readableWebsite: options.lead.website !== null && isReadableWebsite(options.lead.website),
  });

/**
 * Starts or polls the Parallel research that finds a lead's decision maker.
 * @param job The lead research job being processed.
 */
const runLeadResearchJob = async (job: Job) => {
  const lead = await requireLead(job.leadId);
  const search = await requireLeadSearch(lead.leadSearchId);

  if (!lead.parallelRunId) {
    const run = await createDecisionMakerRun({ lead, processor: search.processor });

    await db
      .update(leadSchema)
      .set({ parallelRunId: run.run_id, researchStartedAt: new Date(), status: 'researching' })
      .where(eq(leadSchema.id, lead.id));

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(0) });

    return;
  }

  const outcome = await fetchTaskRunResult({
    runId: lead.parallelRunId,
    timeoutSeconds: PARALLEL_POLL_TIMEOUT_SECONDS,
  });

  if (outcome.state === 'pending') {
    const elapsedMs = Date.now() - (lead.researchStartedAt?.getTime() ?? Date.now());

    await rescheduleJob({ jobId: job.id, delaySeconds: pollDelaySeconds(elapsedMs) });

    return;
  }

  if (outcome.state === 'failed') {
    throw new Error(outcome.error);
  }

  // Parallel bills every completed run, whether or not its output parses
  await recordParallelUsage({
    userId: search.userId,
    organizationId: search.organizationId,
    leadSearchId: search.id,
    runId: lead.parallelRunId,
    processor: search.processor,
  });

  const parsed = DecisionMakerValidation.safeParse(outcome.content);
  const research = parsed.success ? parsed.data : null;
  const contact = toContactFields(research);

  const routes = readEmailRoutes({
    lead: { ...lead, ...contact },
    publicEmail: readPublicEmail(research?.public_email),
  });

  const hasRoute = Object.values(routes).some(Boolean);

  await db
    .update(leadSchema)
    .set({
      ...contact,
      // The Google Maps phone wins; Parallel only fills the gap
      phone: lead.phone ?? readResearchField(research?.business_phone),
      description: readResearchField(research?.business_description),
      research: research ?? { raw: outcome.content },
      status: hasRoute ? 'finding_email' : 'no_email',
      emailAttempts: [],
    })
    .where(eq(leadSchema.id, lead.id));

  if (hasRoute) {
    await db
      .insert(jobSchema)
      .values({ leadSearchId: search.id, leadId: lead.id, type: 'lead_email' });
  }

  await syncLeadSearchStatus(search.id);
  await completeJob(job.id);
};

/** Who the billed calls of an email lookup are made for. */
type EmailLookupOwner = {
  userId: string;
  organizationId: string;
  leadSearchId: string;
  leadId: string;
};

/** The email columns stored once a deliverable address is found. */
type FoundEmail = Pick<Lead, 'email' | 'emailSource' | 'emailVerification'>;

/** What trying one email route turned up, or `rate_limited` when Prospeo asked to slow down. */
type EmailRouteOutcome = 'rate_limited' | { attempts: EmailAttempt[]; found: FoundEmail | null };

/**
 * Checks whether an address can receive mail, asking Reoon when MillionVerifier cannot tell.
 * @param options The call options.
 * @param options.email The address to check.
 * @param options.owner Who the verifications are billed to.
 * @returns The verdict.
 */
const verifyAddress = async (options: { email: string; owner: EmailLookupOwner }) => {
  const verdict = await verifyEmail(options.email);

  await recordVerificationUsage({
    ...options.owner,
    email: options.email,
    provider: 'millionverifier',
  });

  if (verdict !== 'unknown' || !hasReoon()) {
    return verdict;
  }

  const second = await verifyEmailPower(options.email);

  await recordVerificationUsage({ ...options.owner, email: options.email, provider: 'reoon' });

  return second;
};

/**
 * Asks Prospeo for the decision maker's work email.
 * @param options The call options.
 * @param options.lead The lead, with a domain and a named decision maker.
 * @param options.owner Who the lookup is billed to.
 * @returns What was tried and the email found, or `rate_limited` when Prospeo asked to slow down.
 */
const tryProspeo = async (options: {
  lead: Lead;
  owner: EmailLookupOwner;
}): Promise<EmailRouteOutcome> => {
  const { lead } = options;
  const match = await findEmail({
    firstName: lead.firstName ?? '',
    lastName: lead.lastName ?? '',
    domain: lead.domain ?? '',
  });

  if (match === 'rate_limited') {
    return match;
  }

  if (match?.charged) {
    await recordProspeoUsage(options.owner);
  }

  if (!match) {
    return { attempts: [{ source: 'prospeo', email: null, verdict: 'not_found' }], found: null };
  }

  // A PEC rejects ordinary mail, so the next route gets its turn
  if (isPecEmail(match.email)) {
    return {
      attempts: [{ source: 'prospeo', email: match.email, verdict: 'invalid' }],
      found: null,
    };
  }

  return {
    attempts: [{ source: 'prospeo', email: match.email, verdict: 'valid' }],
    found: { email: match.email, emailSource: 'prospeo', emailVerification: 'valid' },
  };
};

/**
 * Verifies candidate addresses one at a time until one can receive mail.
 * @param options The call options.
 * @param options.source The route the candidates come from.
 * @param options.candidates The addresses to check, best first.
 * @param options.owner Who the verifications are billed to.
 * @returns What was tried and the first deliverable address.
 */
const verifyCandidates = async (options: {
  source: Exclude<EmailAttempt['source'], 'prospeo'>;
  candidates: string[];
  owner: EmailLookupOwner;
}) => {
  const attempts: EmailAttempt[] = [];

  // Sequential on purpose: each verification is billed, so it stops at the first good address
  for (const email of options.candidates) {
    // oxlint-disable-next-line no-await-in-loop
    const verdict = await verifyAddress({ email, owner: options.owner });

    attempts.push({ source: options.source, email, verdict });

    // A guessed address on a domain that accepts everything may well not exist
    const isAccepted =
      verdict === 'valid' || (verdict === 'catch_all' && options.source !== 'guessed');

    if (isAccepted) {
      return {
        attempts,
        found: { email, emailSource: options.source, emailVerification: verdict },
      };
    }
  }

  return {
    attempts:
      attempts.length > 0
        ? attempts
        : [{ source: options.source, email: null, verdict: 'not_found' as const }],
    found: null,
  };
};

/**
 * Tries one route to a lead's email.
 * @param options The call options.
 * @param options.route The route to try.
 * @param options.lead The lead.
 * @param options.publicEmail The address the business publishes, if any.
 * @param options.attempts What was tried before, so no address is verified twice.
 * @param options.owner Who the calls are billed to.
 * @returns What was tried and the email found, or `rate_limited` when Prospeo asked to slow down.
 */
const tryEmailRoute = async (options: {
  route: NonNullable<ReturnType<typeof nextEmailRoute>>;
  lead: Lead;
  publicEmail: string | null;
  attempts: EmailAttempt[];
  owner: EmailLookupOwner;
}): Promise<EmailRouteOutcome> => {
  const { route, lead } = options;

  if (route === 'prospeo') {
    return await tryProspeo({ lead, owner: options.owner });
  }

  const tried = new Set(options.attempts.map((attempt) => attempt.email));

  let candidates: string[] = [];

  if (route === 'public' && options.publicEmail) {
    candidates = [options.publicEmail];
  } else if (route === 'website' && lead.website) {
    candidates = await findWebsiteEmails({ website: lead.website, domain: lead.domain });
  } else if (route === 'guessed' && lead.domain) {
    candidates = [`info@${lead.domain}`];
  }

  return await verifyCandidates({
    source: route,
    candidates: candidates.filter((email) => !tried.has(email)).slice(0, MAX_WEBSITE_CANDIDATES),
    owner: options.owner,
  });
};

/**
 * Finds and verifies the email of a lead, one route per run: Prospeo, the
 * address the business publishes, its website, then info@ at its domain.
 * Each run stays short, and what was tried is kept on the lead.
 * @param job The lead email job being processed.
 */
const runLeadEmailJob = async (job: Job) => {
  const lead = await requireLead(job.leadId);
  const search = await requireLeadSearch(lead.leadSearchId);
  const research = DecisionMakerValidation.safeParse(lead.research);
  const publicEmail = readPublicEmail(research.success ? research.data.public_email : undefined);
  const attempts = lead.emailAttempts ?? [];
  const route = nextEmailRoute({ routes: readEmailRoutes({ lead, publicEmail }), attempts });

  const outcome = route
    ? await tryEmailRoute({
        route,
        lead,
        publicEmail,
        attempts,
        owner: {
          userId: search.userId,
          organizationId: search.organizationId,
          leadSearchId: search.id,
          leadId: lead.id,
        },
      })
    : null;

  // Prospeo's rate limit is not the lead's fault, so the job waits without spending an attempt
  if (outcome === 'rate_limited') {
    await rescheduleJob({ jobId: job.id, delaySeconds: PROSPEO_RATE_LIMIT_DELAY_SECONDS });

    return;
  }

  const emailAttempts = [...attempts, ...(outcome?.attempts ?? [])];

  if (outcome && !outcome.found) {
    // The next route is tried straight away, in a run of its own
    await db.update(leadSchema).set({ emailAttempts }).where(eq(leadSchema.id, lead.id));
    await rescheduleJob({ jobId: job.id, delaySeconds: 0 });

    return;
  }

  await db
    .update(leadSchema)
    .set(
      outcome?.found
        ? { ...outcome.found, emailAttempts, status: 'ready' }
        : { emailAttempts, status: 'no_email' },
    )
    .where(eq(leadSchema.id, lead.id));

  await syncLeadSearchStatus(search.id);
  await completeJob(job.id);
};

/**
 * Sends a search's leads that ended without an email before the website and
 * info@ routes existed through the email lookup again. Their research is
 * reused, so only the verifications are paid for.
 * @param leadSearchId The lead search.
 * @returns How many leads were queued.
 */
export const retryNoEmailLeads = async (leadSearchId: string) =>
  await db.transaction(async (tx) => {
    const leads = await tx
      .update(leadSchema)
      .set({ status: 'finding_email' })
      .where(
        and(
          eq(leadSchema.leadSearchId, leadSearchId),
          eq(leadSchema.status, 'no_email'),
          isNull(leadSchema.emailAttempts),
        ),
      )
      .returning({ id: leadSchema.id });

    if (leads.length > 0) {
      await tx
        .insert(jobSchema)
        .values(
          leads.map((lead) => ({ leadSearchId, leadId: lead.id, type: 'lead_email' as const })),
        );
    }

    return leads.length;
  });

/**
 * Records the user-visible outcome of a lead search job that ran out of attempts.
 * @param job The abandoned job.
 * @param message The error to surface.
 */
export const markLeadJobAbandoned = async (job: Job, message: string) => {
  if (job.leadId) {
    await db
      .update(leadSchema)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(leadSchema.id, job.leadId));

    if (job.leadSearchId) {
      // The search may now be fully settled, with this lead simply dropped
      await syncLeadSearchStatus(job.leadSearchId);
    }

    return;
  }

  if (job.leadSearchId) {
    await db
      .update(leadSearchSchema)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(leadSearchSchema.id, job.leadSearchId));
  }
};

export const leadJobHandlers = {
  lead_search: runLeadSearchJob,
  lead_research: runLeadResearchJob,
  lead_email: runLeadEmailJob,
};
