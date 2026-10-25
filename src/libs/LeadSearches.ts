import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type * as z from 'zod';
import { db } from '@/libs/DB';
import { jobSchema, leadSchema, leadSearchSchema } from '@/models/Schema';
import { ITALIAN_REGION_NAMES, ITALIAN_REGION_PLACE_IDS } from '@/utils/ItalianRegions';
import { deriveFamilyStatus, splitEvenly } from '@/utils/Leads';
import type { RegionalLeadSearchValidation } from '@/validations/LeadSearchValidation';

type LeadStatus = (typeof leadSearchSchema.$inferSelect)['status'];

/** Where each region comes from north to south, to list the regions of a search in order. */
const REGION_ORDER = new Map<string, number>(
  ITALIAN_REGION_NAMES.map((name, index) => [name, index]),
);

/**
 * Selects the ids of a search and of its per-region searches, when it was split by region.
 * @param leadSearchId The search shown to the user.
 * @returns A subquery of lead search ids.
 */
const searchFamilyIds = (leadSearchId: string) =>
  db
    .select({ id: leadSearchSchema.id })
    .from(leadSearchSchema)
    .where(
      or(eq(leadSearchSchema.id, leadSearchId), eq(leadSearchSchema.parentSearchId, leadSearchId)),
    );

/**
 * Keeps the rows that belong to a search or to one of its per-region searches.
 * @param column The lead search id column of the rows.
 * @param leadSearchId The search shown to the user.
 * @returns The where clause.
 */
export const inSearchFamily = (column: PgColumn, leadSearchId: string) =>
  inArray(column, searchFamilyIds(leadSearchId));

/**
 * Loads the per-region searches of a search split by region, with their ready leads.
 * @param leadSearchId The search shown to the user.
 * @returns One row per region, north to south; empty for a search in one place.
 */
export const loadRegionalSearches = async (leadSearchId: string) => {
  const rows = await db
    .select({
      id: leadSearchSchema.id,
      location: leadSearchSchema.location,
      maxResults: leadSearchSchema.maxResults,
      status: leadSearchSchema.status,
      reserveClaimed: leadSearchSchema.reserveClaimed,
      errorMessage: leadSearchSchema.errorMessage,
      ready:
        sql<number>`count(${leadSchema.id}) filter (where ${leadSchema.status} = 'ready')`.mapWith(
          Number,
        ),
    })
    .from(leadSearchSchema)
    .leftJoin(leadSchema, eq(leadSchema.leadSearchId, leadSearchSchema.id))
    .where(eq(leadSearchSchema.parentSearchId, leadSearchId))
    .groupBy(leadSearchSchema.id)
    .orderBy(asc(leadSearchSchema.createdAt));
  return rows.toSorted(
    (a, b) => (REGION_ORDER.get(a.location) ?? 0) - (REGION_ORDER.get(b.location) ?? 0),
  );
};

/**
 * Tells the status of a search, read from its per-region searches when it was split by region.
 * @param status The status stored on the search shown to the user.
 * @param regionalStatuses The status of each of its per-region searches.
 * @returns The status to show.
 */
export const familyStatus = (status: LeadStatus, regionalStatuses: LeadStatus[]) =>
  regionalStatuses.length > 0 ? deriveFamilyStatus(regionalStatuses) : status;

/**
 * Creates a search split evenly across regions: the search shown to the user,
 * plus one search per region with its share, each queued like an ordinary search.
 * @param options The call options.
 * @param options.search The validated search.
 * @param options.userId Who the search is billed to.
 * @param options.organizationId The organization searching.
 * @returns The search shown to the user.
 */
export const createRegionalSearch = async (options: {
  search: z.infer<typeof RegionalLeadSearchValidation>;
  userId: string;
  organizationId: string;
}) => {
  const { regions: picked, ...search } = options.search;
  const regions = ITALIAN_REGION_NAMES.filter((name) => picked.includes(name));
  const owner = { userId: options.userId, organizationId: options.organizationId };
  const shares = splitEvenly(search.maxResults, regions.length);

  return await db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(leadSearchSchema)
      .values({
        ...search,
        ...owner,
        location: regions.length === ITALIAN_REGION_NAMES.length ? 'Italia' : regions.join(', '),
        // Nothing runs on the search itself: its regions do the work
        status: 'searching',
      })
      .returning();

    if (!parent) {
      throw new Error('Lead search insert returned no row');
    }

    const children = await tx
      .insert(leadSearchSchema)
      .values(
        regions.map((region, index) => ({
          ...search,
          ...owner,
          name: `${search.name} · ${region}`,
          location: region,
          locationPlaceId: ITALIAN_REGION_PLACE_IDS[region],
          maxResults: shares[index] ?? 0,
          parentSearchId: parent.id,
        })),
      )
      .returning({ id: leadSearchSchema.id });

    await tx
      .insert(jobSchema)
      .values(children.map((child) => ({ leadSearchId: child.id, type: 'lead_search' as const })));

    return parent;
  });
};

/**
 * Lists the ids of a search and of its per-region searches.
 * @param leadSearchId The search shown to the user.
 * @returns The ids.
 */
export const listSearchFamily = async (leadSearchId: string) => {
  const family = await searchFamilyIds(leadSearchId);

  return family.map((row) => row.id);
};

/**
 * Keeps the per-region searches out of the searches shown to the user.
 * @param organizationId The organization.
 * @returns The where clause over lead searches.
 */
export const isShownSearch = (organizationId: string) =>
  and(eq(leadSearchSchema.organizationId, organizationId), isNull(leadSearchSchema.parentSearchId));
