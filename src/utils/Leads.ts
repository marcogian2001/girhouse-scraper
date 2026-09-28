import * as z from 'zod';
import type { leadSchema, leadSearchSchema } from '@/models/Schema';
import type { Rectangle } from '@/services/GooglePlaces';

type WebsiteFilter = (typeof leadSearchSchema.$inferSelect)['websiteFilter'];

type Lead = typeof leadSchema.$inferSelect;

/**
 * Reads a text field Parallel fills in, where an empty string means unknown.
 * @param value The field as returned.
 * @returns The trimmed value, or null when there is none.
 */
export const readResearchField = (value?: string) => (value?.trim() ? value.trim() : null);

/** Lead states the worker still has something to do for. */
export const OPEN_LEAD_STATUSES = ['found', 'researching', 'finding_email'] as const;

/**
 * Lead states of businesses already scraped but never researched, which a later search can take.
 * `filtered_out` is what searches made before the reserve called them.
 */
export const RESERVE_LEAD_STATUSES = ['reserve', 'filtered_out'] as const;

/** The most places one Apify run is asked to scrape. */
const MAX_PLACES_PER_ROUND = 1000;

/**
 * A website filter drops part of what is scraped, so a filtered search scrapes this much more.
 * What the filter drops is kept in reserve, never thrown away.
 */
const FILTERED_SCRAPE_FACTOR = 1.5;

/**
 * Normalises a search term, so the same term typed differently shares its progress.
 * @param term The term as typed.
 * @returns The lowercase term with single spaces.
 */
export const toSearchKey = (term: string) => term.trim().replaceAll(/\s+/gu, ' ').toLowerCase();

/**
 * Decides how many places to scrape for the leads a search still needs.
 * @param options The call options.
 * @param options.missing How many leads the search still needs.
 * @param options.filter Which businesses the search wants.
 * @returns How many places to send to Apify.
 */
export const scrapeBudget = (options: { missing: number; filter: WebsiteFilter }) =>
  Math.min(
    options.filter === 'any'
      ? options.missing
      : Math.ceil(options.missing * FILTERED_SCRAPE_FACTOR),
    MAX_PLACES_PER_ROUND,
  );

/**
 * Splits a rectangle into its four quarters.
 * @param rectangle The rectangle to split.
 * @returns The quarters, which together cover the rectangle.
 */
export const splitRectangle = (rectangle: Rectangle): Rectangle[] => {
  const middle = {
    latitude: (rectangle.low.latitude + rectangle.high.latitude) / 2,
    longitude: (rectangle.low.longitude + rectangle.high.longitude) / 2,
  };

  return [
    { low: rectangle.low, high: middle },
    {
      low: { latitude: rectangle.low.latitude, longitude: middle.longitude },
      high: { latitude: middle.latitude, longitude: rectangle.high.longitude },
    },
    {
      low: { latitude: middle.latitude, longitude: rectangle.low.longitude },
      high: { latitude: rectangle.high.latitude, longitude: middle.longitude },
    },
    { low: middle, high: rectangle.high },
  ];
};

/**
 * Checks a business against the website filter of its search.
 * @param options The call options.
 * @param options.hasWebsite Whether the business has a website of its own.
 * @param options.filter Which businesses the search wants.
 * @returns Whether the business should be researched.
 */
export const matchesWebsiteFilter = (options: { hasWebsite: boolean; filter: WebsiteFilter }) => {
  if (options.filter === 'without') {
    return !options.hasWebsite;
  }

  if (options.filter === 'with') {
    return options.hasWebsite;
  }

  return true;
};

/**
 * Cleans up an email address found on a public page.
 * @param value The address as Parallel reported it.
 * @returns The lowercase address, or null when it is empty or malformed.
 */
export const readPublicEmail = (value?: string) => {
  const email = value?.trim().toLowerCase();

  return email && z.email().safeParse(email).success ? email : null;
};

/**
 * Picks how the email of a lead will be looked up.
 * A named decision maker at a company with its own domain goes to Prospeo
 * first; an address the business publishes is the fallback, and the only
 * route for businesses without a website.
 * @param options The call options.
 * @param options.lead The name and domain known for the lead.
 * @param options.publicEmail The address the business publishes, if any.
 * @returns Whether to try Prospeo and whether a public address can be verified.
 */
export const pickEmailRoutes = (options: {
  lead: Pick<Lead, 'domain' | 'firstName' | 'lastName'>;
  publicEmail: string | null;
}) => ({
  prospeo: Boolean(options.lead.domain && options.lead.firstName && options.lead.lastName),
  publicEmail: options.publicEmail !== null,
});

/**
 * Keeps the first occurrence of each place, since a place can match several search terms.
 * @param places The places in the order they were scraped.
 * @returns The places without repeats.
 */
export const uniqueByPlaceId = <Place extends { placeId: string }>(places: Place[]) => {
  const seen = new Set<string>();

  return places.filter((place) => {
    if (seen.has(place.placeId)) {
      return false;
    }

    seen.add(place.placeId);

    return true;
  });
};

/**
 * Splits scraped businesses into the leads a search takes and those kept in reserve.
 * @param options The call options.
 * @param options.rows The scraped businesses.
 * @param options.filter Which businesses the search wants.
 * @param options.missing How many leads the search still needs.
 * @returns The businesses to research now, and the rest.
 */
export const splitScrapedPlaces = <Row extends { hasWebsite: boolean }>(options: {
  rows: Row[];
  filter: WebsiteFilter;
  missing: number;
}) => {
  const matching = options.rows.filter((row) =>
    matchesWebsiteFilter({ hasWebsite: row.hasWebsite, filter: options.filter }),
  );
  const wanted = matching.slice(0, options.missing);

  return {
    wanted,
    reserve: options.rows.filter((row) => !wanted.includes(row)),
  };
};

/**
 * Lays out ready leads as the rows of an uploaded CSV, so a campaign can be
 * created from them with the same wizard. Headers the column mapper knows land
 * on contact fields; the rest reach Claude as extra context.
 * @param options The call options.
 * @param options.name The name of the lead search, shown as the file name.
 * @param options.leads The leads to include.
 * @returns The parsed CSV the campaign wizard starts from.
 */
export const toLeadCsv = (options: {
  name: string;
  leads: Pick<
    Lead,
    | 'email'
    | 'firstName'
    | 'lastName'
    | 'phone'
    | 'company'
    | 'website'
    | 'linkedinUrl'
    | 'role'
    | 'category'
    | 'description'
    | 'city'
    | 'address'
    | 'hasWebsite'
    | 'rating'
    | 'reviewsCount'
  >[];
}) => {
  const rows = options.leads.map((lead) => ({
    Email: lead.email ?? '',
    'First name': lead.firstName ?? '',
    'Last name': lead.lastName ?? '',
    Phone: lead.phone ?? '',
    Company: lead.company,
    Website: lead.website ?? '',
    LinkedIn: lead.linkedinUrl ?? '',
    Role: lead.role ?? '',
    Category: lead.category ?? '',
    'Business description': lead.description ?? '',
    City: lead.city ?? '',
    Address: lead.address ?? '',
    'Has own website': lead.hasWebsite ? 'yes' : 'no',
    'Google rating': lead.rating === null ? '' : String(lead.rating),
    'Google reviews': lead.reviewsCount === null ? '' : String(lead.reviewsCount),
  }));

  return {
    fileName: options.name,
    headers: Object.keys(rows[0] ?? {}),
    rows,
  };
};
