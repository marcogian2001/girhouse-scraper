import * as z from 'zod';
import type { EmailAttempt, leadSchema, leadSearchSchema } from '@/models/Schema';
import type { Rectangle } from '@/services/GooglePlaces';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';
import { DecisionMakerValidation } from '@/validations/LeadSearchValidation';
import { ITALIAN_PROVINCES } from './ItalianProvinces';
import { findRegionByPlaceId } from './ItalianRegions';

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

/** Share of researched leads expected to end with a deliverable email, before any is known. */
export const DEFAULT_EMAIL_YIELD = 0.5;

/** The lowest share ever assumed, so a search takes at most five businesses per email it wants. */
const MIN_EMAIL_YIELD = 0.2;

/** How many leads the estimate of the level above weighs, so a few early outcomes don't sway it. */
const EMAIL_YIELD_PRIOR_WEIGHT = 20;

/** Lead counts that tell how often research ends with a deliverable email. */
type EmailOutcomes = {
  ready: number;
  settled: number;
};

/**
 * Estimates the share of researched leads that end with a deliverable email.
 * The organization's history is the starting point, and the search's own outcomes take over as they come in.
 * @param options The call options.
 * @param options.search Ready and settled leads of the search.
 * @param options.organization Ready and settled leads of the whole organization.
 * @returns The expected share, between 0.2 and 1.
 */
export const estimateEmailYield = (options: {
  search: EmailOutcomes;
  organization: EmailOutcomes;
}) => {
  const smooth = (outcomes: EmailOutcomes, prior: number) =>
    (outcomes.ready + EMAIL_YIELD_PRIOR_WEIGHT * prior) /
    (outcomes.settled + EMAIL_YIELD_PRIOR_WEIGHT);
  const organizationYield = smooth(options.organization, DEFAULT_EMAIL_YIELD);

  return Math.min(Math.max(smooth(options.search, organizationYield), MIN_EMAIL_YIELD), 1);
};

/**
 * Decides how many more businesses a search takes to reach its target of deliverable emails.
 * The leads still being researched count for the emails they are expected to give.
 * @param options The call options.
 * @param options.target How many leads with a deliverable email the search wants.
 * @param options.ready How many leads already have one.
 * @param options.pending How many leads are still being researched.
 * @param options.emailYield The expected share of leads that end with a deliverable email.
 * @returns How many more businesses to research.
 */
export const countLeadsToTake = (options: {
  target: number;
  ready: number;
  pending: number;
  emailYield: number;
}) =>
  Math.max(
    Math.ceil(Math.max(options.target - options.ready, 0) / options.emailYield) - options.pending,
    0,
  );

/**
 * Splits a number of leads evenly into shares, the first ones taking what does not divide.
 * @param total How many leads to split.
 * @param parts How many shares to split them into.
 * @returns The shares, which add up to the total.
 */
export const splitEvenly = (total: number, parts: number) =>
  Array.from(
    { length: parts },
    (_, index) => Math.floor(total / parts) + (index < total % parts ? 1 : 0),
  );

/**
 * Tells the status of a search split by region from the statuses of its per-region searches.
 * @param statuses The status of each per-region search.
 * @returns Searching or qualifying while any region still is, failed when all failed, otherwise done.
 */
export const deriveFamilyStatus = (statuses: LeadSearch['status'][]): LeadSearch['status'] => {
  if (statuses.includes('searching')) {
    return 'searching';
  }

  if (statuses.includes('qualifying')) {
    return 'qualifying';
  }

  return statuses.length > 0 && statuses.every((status) => status === 'failed') ? 'failed' : 'done';
};

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

/** Booking platforms that host the profile pages of professionals, whose addresses reach the platform. */
const DIRECTORY_DOMAINS = new Set(['miodottore.it', 'dottori.it', 'doctolib.it']);

/**
 * Tells whether a domain belongs to a booking platform rather than the business itself.
 * @param domain The lowercase domain.
 * @returns Whether the domain is a platform, such as miodottore.it.
 */
const isDirectoryDomain = (domain: string) => DIRECTORY_DOMAINS.has(domain);

/**
 * Cleans up the email address found on a public page, skipping PEC and platform addresses.
 * @param value The address as Parallel reported it, possibly several separated by commas or semicolons.
 * @returns The first well-formed address the business owns that is not a PEC, lowercased, or null when there is none.
 */
export const readPublicEmail = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .split(/[\s,;/]+/u)
    .find(
      (email) =>
        z.email().safeParse(email).success &&
        !isPecEmail(email) &&
        !isDirectoryDomain(email.split('@')[1] ?? ''),
    ) ?? null;

/**
 * Picks how the email of a lead will be looked up.
 * A named decision maker at a company with its own domain goes to Prospeo
 * first; then the address the business publishes, the addresses on its
 * website and, last, info@ at its domain. Businesses without a website still
 * have their published address and any page builder they list.
 * @param options The call options.
 * @param options.lead The name and domain known for the lead.
 * @param options.publicEmail The address the business publishes, if any.
 * @param options.readableWebsite Whether the page the business lists as its website can be read.
 * @returns Which routes can be tried, keyed by the email source each one gives.
 */
export const pickEmailRoutes = (options: {
  lead: Pick<Lead, 'domain' | 'firstName' | 'lastName'>;
  publicEmail: string | null;
  readableWebsite: boolean;
}) => {
  // A platform domain would make Prospeo look up someone who works for the platform
  const ownDomain = Boolean(options.lead.domain && !isDirectoryDomain(options.lead.domain));

  return {
    prospeo: ownDomain && Boolean(options.lead.firstName && options.lead.lastName),
    public: options.publicEmail !== null,
    // A profile on a booking platform shows no address of its own
    website: options.readableWebsite && !isDirectoryDomain(options.lead.domain ?? ''),
    guessed: ownDomain,
  };
};

export type EmailRoutes = ReturnType<typeof pickEmailRoutes>;

/** The order the routes are tried in, most personal first. */
const EMAIL_ROUTE_ORDER = ['prospeo', 'public', 'website', 'guessed'] as const;

/**
 * Picks the next route to try for a lead's email, skipping those already tried.
 * @param options The call options.
 * @param options.routes The routes the lead has.
 * @param options.attempts What was tried so far.
 * @returns The next route, or null when every route has been tried.
 */
export const nextEmailRoute = (options: { routes: EmailRoutes; attempts: EmailAttempt[] }) =>
  EMAIL_ROUTE_ORDER.find(
    (route) =>
      options.routes[route] && !options.attempts.some((attempt) => attempt.source === route),
  ) ?? null;

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
  leads: (Pick<
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
  > & {
    // The area of the search that found the lead, when the search was split by region
    areaPlaceId?: string | null;
  })[];
}) => {
  const { search } = options;
  // Only searches made in a province know their province, and only those in a region their region
  const province = ITALIAN_PROVINCES.find((item) => item.placeId === search.locationPlaceId);
  const searchRegion = province?.region ?? findRegionByPlaceId(search.locationPlaceId) ?? '';
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
    Region: lead.areaPlaceId
      ? (findRegionByPlaceId(lead.areaPlaceId) ?? searchRegion)
      : searchRegion,
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
