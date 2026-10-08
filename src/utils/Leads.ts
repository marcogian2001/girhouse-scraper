import * as z from 'zod';
import type { leadSchema, leadSearchSchema } from '@/models/Schema';
import type { Rectangle } from '@/services/GooglePlaces';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';
import { DecisionMakerValidation } from '@/validations/LeadSearchValidation';
import { ITALIAN_PROVINCES } from './ItalianProvinces';

type WebsiteFilter = (typeof leadSearchSchema.$inferSelect)['websiteFilter'];

type Lead = typeof leadSchema.$inferSelect;

type LeadSearch = typeof leadSearchSchema.$inferSelect;

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
 * Keeps only exact Maps categories when a search has a category filter.
 * @param options The category and allowed categories of the search.
 * @returns Whether the category is admitted before paid research.
 */
export const matchesCategoryFilter = (options: {
  category?: string | null;
  allowedCategories: string[];
}) =>
  options.allowedCategories.length === 0 ||
  options.allowedCategories.some(
    (category) => toSearchKey(category) === toSearchKey(options.category ?? ''),
  );

/** Labels of certified email (PEC) domains that do not start or end with "pec". */
const PEC_DOMAIN_LABELS = new Set(['legalmail', 'postecert', 'postacert', 'sicurezzapostale']);

/**
 * Tells whether an address is a PEC, Italy's certified email, which rejects
 * ordinary mail and so cannot receive a cold email.
 * @param email The lowercase address.
 * @returns Whether the address belongs to a PEC domain, such as pec.it or legalmail.it.
 */
export const isPecEmail = (email: string) =>
  (email.split('@')[1] ?? '')
    .split('.')
    .some(
      (label) => label.startsWith('pec') || label.endsWith('pec') || PEC_DOMAIN_LABELS.has(label),
    );

/**
 * Cleans up the email address found on a public page, skipping PEC addresses.
 * @param value The address as Parallel reported it, possibly several separated by commas or semicolons.
 * @returns The first well-formed address that is not a PEC, lowercased, or null when there is none.
 */
export const readPublicEmail = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .split(/[\s,;/]+/u)
    .find((email) => z.email().safeParse(email).success && !isPecEmail(email)) ?? null;

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
export const splitScrapedPlaces = <
  Row extends { hasWebsite: boolean; category?: string | null },
>(options: {
  rows: Row[];
  allowedCategories?: string[];
  filter: WebsiteFilter;
  missing: number;
}) => {
  const matching = options.rows.filter(
    (row) =>
      matchesWebsiteFilter({ hasWebsite: row.hasWebsite, filter: options.filter }) &&
      matchesCategoryFilter({
        category: row.category,
        allowedCategories: options.allowedCategories ?? [],
      }),
  );
  const wanted = matching.slice(0, options.missing);

  return {
    wanted,
    reserve: options.rows.filter((row) => !wanted.includes(row)),
  };
};

/** Lead CSV columns sent on to Instantly, with the custom variable each one becomes. */
export const SEGMENT_VARIABLES = {
  Category: 'category',
  Province: 'province',
  Region: 'region',
  Profession: 'profession',
} as const;

/**
 * Lays out ready leads as the rows of an uploaded CSV, so a campaign can be
 * created from them with the same wizard. Headers the column mapper knows land
 * on contact fields; the rest reach Claude as extra context. A repeated email
 * keeps only its first lead.
 * @param options The call options.
 * @param options.search The lead search the leads come from.
 * @param options.leads The leads to include.
 * @returns The parsed CSV the campaign wizard starts from.
 */
export const toLeadCsv = (options: {
  search: Pick<LeadSearch, 'name' | 'searchTerms' | 'locationPlaceId'>;
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
  const { search } = options;
  // Only searches made in a province know their province and region
  const province = ITALIAN_PROVINCES.find((item) => item.placeId === search.locationPlaceId);
  const seen = new Set<string>();
  // A business listed several times on Google Maps shares one address, and is written to once
  const leads = options.leads.filter((lead) => {
    if (!lead.email) {
      return true;
    }

    if (seen.has(lead.email)) {
      return false;
    }

    seen.add(lead.email);

    return true;
  });
  const rows = leads.map((lead) => ({
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
    Profession: search.searchTerms.join(', '),
    Province: province?.name ?? '',
    Region: province?.region ?? '',
  }));

  return {
    fileName: search.name,
    headers: Object.keys(rows[0] ?? {}),
    rows,
  };
};

/**
 * Turns the decision maker research of a lead into the research a campaign
 * writes from, so a lead found on the platform is not researched twice.
 * The person fields come from the lead columns, which are empty unless the
 * decision maker was confirmed. Leads researched before hooks were asked for
 * come back with them empty.
 * @param lead The lead and the research stored with it.
 * @returns The research content, or null when the stored research does not parse.
 */
export const toEnrichmentContent = (
  lead: Pick<
    Lead,
    | 'research'
    | 'company'
    | 'description'
    | 'category'
    | 'city'
    | 'firstName'
    | 'lastName'
    | 'role'
    | 'linkedinUrl'
  >,
): EnrichmentContent | null => {
  const parse = DecisionMakerValidation.safeParse(lead.research);

  if (!parse.success) {
    return null;
  }

  const research = parse.data;

  return {
    person_found: research.decision_maker_found,
    identity_match_confidence: research.confidence,
    identity_match_reasoning: research.reasoning,
    full_name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
    current_role: lead.role ?? '',
    current_company: lead.company,
    company_description: lead.description ?? '',
    company_industry: lead.category ?? '',
    location: lead.city ?? '',
    linkedin_url: lead.linkedinUrl ?? '',
    recent_activity: research.recent_activity,
    personalization_hooks: research.personalization_hooks,
  };
};
