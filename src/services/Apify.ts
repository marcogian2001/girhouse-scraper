import * as z from 'zod';
import { Env } from '@/libs/Env';
import type { leadSchema } from '@/models/Schema';
import { requireEnv } from '@/utils/Helpers';

const APIFY_API_URL = 'https://api.apify.com/v2';

const MAPS_ACTOR_ID = 'compass~crawler-google-places';

/**
 * List price of one scraped place on the Starter plan, in millionths of a US
 * dollar. Detail pages, contacts, reviews and images are all turned off.
 */
export const PLACE_COST_MICROS = 4000;

/**
 * Hosts that businesses without a site of their own list as their website.
 * Such a link is still a research source, but the business has no website.
 */
const SOCIAL_HOSTS = [
  'facebook.com',
  'instagram.com',
  'linktr.ee',
  'tiktok.com',
  'wa.me',
  'whatsapp.com',
  'linkedin.com',
  'paginegialle.it',
  'business.site',
  'sites.google.com',
];

const runResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    status: z.string(),
    defaultDatasetId: z.string(),
  }),
});

const placeSchema = z.looseObject({
  placeId: z.string(),
  title: z.string(),
  website: z.string().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  categoryName: z.string().nullish(),
  totalScore: z.number().nullish(),
  reviewsCount: z.number().nullish(),
});

export type MapsPlace = z.infer<typeof placeSchema>;

export type MapsRunOutcome =
  | { state: 'succeeded'; places: MapsPlace[] }
  | { state: 'pending' }
  | { state: 'failed'; error: string };

/** The lead columns a place fills in, before it is tied to a search. */
export type LeadRow = Pick<
  typeof leadSchema.$inferInsert,
  | 'placeId'
  | 'company'
  | 'website'
  | 'domain'
  | 'hasWebsite'
  | 'phone'
  | 'address'
  | 'city'
  | 'category'
  | 'rating'
  | 'reviewsCount'
  | 'raw'
>;

/**
 * Calls the Apify API and fails loudly on a non-2xx response.
 * @param path The API path, relative to the v2 base URL.
 * @param init Fetch options; a JSON body is expected to be pre-serialised.
 * @returns The parsed JSON response.
 * @throws {Error} When the token is missing or Apify rejects the request.
 */
const request = async (path: string, init?: RequestInit): Promise<unknown> => {
  const token = requireEnv('APIFY_API_TOKEN', Env.APIFY_API_TOKEN);

  const response = await fetch(`${APIFY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Apify ${path} failed with ${response.status}: ${await response.text()}`);
  }

  return await response.json();
};

/**
 * Reads the host of a website, without the `www.` prefix.
 * @param website The website as listed on Google Maps, with or without a scheme.
 * @returns The lowercase host, or null when the value is not a URL.
 */
export const extractDomain = (website: string) => {
  const withScheme = /^https?:\/\//iu.test(website) ? website : `https://${website}`;

  if (!URL.canParse(withScheme)) {
    return null;
  }

  return new URL(withScheme).hostname.toLowerCase().replace(/^www\./u, '');
};

/**
 * Checks whether a domain belongs to a social network or a free page builder.
 * @param domain The host to check.
 * @returns Whether the business only has a page on someone else's platform.
 */
const isSocialDomain = (domain: string) =>
  SOCIAL_HOSTS.some((host) => domain === host || domain.endsWith(`.${host}`));

/**
 * Turns a scraped place into lead columns.
 * A Facebook page or similar listed as the website does not count as one.
 * @param place The place returned by the Google Maps scraper.
 * @returns The lead columns derived from the place.
 */
export const toLeadRow = (place: MapsPlace): LeadRow => {
  const website = place.website?.trim() ? place.website.trim() : null;
  const host = website ? extractDomain(website) : null;
  const domain = host && !isSocialDomain(host) ? host : null;

  return {
    placeId: place.placeId,
    company: place.title,
    website,
    domain,
    hasWebsite: domain !== null,
    phone: place.phone ?? null,
    address: place.address ?? null,
    city: place.city ?? null,
    category: place.categoryName ?? null,
    rating: place.totalScore ?? null,
    reviewsCount: place.reviewsCount ?? null,
    raw: place,
  };
};

/**
 * Starts a Google Maps scrape limited to Italy.
 * @param options The call options.
 * @param options.searchTerms What to search for, one scrape per term.
 * @param options.location Where to search, as free text.
 * @param options.maxResults How many places to collect across all terms.
 * @returns The identifier of the created run.
 * @throws {Error} When the token is missing or Apify rejects the request.
 */
export const startMapsRun = async (options: {
  searchTerms: string[];
  location: string;
  maxResults: number;
}) => {
  const response = await request(`/acts/${MAPS_ACTOR_ID}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      searchStringsArray: options.searchTerms,
      locationQuery: options.location,
      maxCrawledPlacesPerSearch: Math.ceil(options.maxResults / options.searchTerms.length),
      language: 'it',
      countryCode: 'it',
      skipClosedPlaces: true,
      // Everything billed on top of the base place price stays off
      scrapePlaceDetailPage: false,
      scrapeContacts: false,
      maxReviews: 0,
      maxImages: 0,
      maximumLeadsEnrichmentRecords: 0,
    }),
  });

  return runResponseSchema.parse(response).data.id;
};

/**
 * Reads a Google Maps scrape and, once it has finished, its places.
 * @param runId The run to read.
 * @returns Whether the run succeeded, is still running, or failed.
 * @throws {Error} When the token is missing or Apify rejects the request.
 */
export const fetchMapsRun = async (runId: string): Promise<MapsRunOutcome> => {
  const run = runResponseSchema.parse(await request(`/actor-runs/${runId}`)).data;

  if (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status)) {
    return { state: 'pending' };
  }

  if (run.status !== 'SUCCEEDED') {
    return { state: 'failed', error: `Apify run ended as ${run.status}` };
  }

  const items = await request(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
  // A place without an id or a name cannot become a lead, so it is skipped
  const places = z
    .array(z.unknown())
    .parse(items)
    .flatMap((item) => {
      const parsed = placeSchema.safeParse(item);

      return parsed.success ? [parsed.data] : [];
    });

  return { state: 'succeeded', places };
};
