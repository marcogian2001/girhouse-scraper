import * as z from 'zod';
import { Env } from '@/libs/Env';
import { requireEnv } from '@/utils/Helpers';

const PLACES_API_URL = 'https://places.googleapis.com/v1';

/** Google Text Search never returns more than this many places for one query. */
const TEXT_SEARCH_MAX_RESULTS = 60;

const TEXT_SEARCH_PAGE_SIZE = 20;

const latLngSchema = z.object({ latitude: z.number(), longitude: z.number() });

const rectangleSchema = z.object({ low: latLngSchema, high: latLngSchema });

export type Rectangle = z.infer<typeof rectangleSchema>;

const viewportResponseSchema = z.object({ viewport: rectangleSchema });

const textSearchResponseSchema = z.object({
  // Google omits the array entirely when nothing matches
  places: z.array(z.object({ id: z.string() })).default([]),
  nextPageToken: z.string().optional(),
});

const autocompleteResponseSchema = z.object({
  // Google omits the array entirely when nothing matches
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: z.object({ text: z.string() }),
          })
          .optional(),
      }),
    )
    .default([]),
});

export type PlaceSuggestion = { placeId: string; label: string };

const placeDetailsSchema = z.object({
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  reviews: z
    .array(
      z.object({
        rating: z.number().optional(),
        text: z.object({ text: z.string() }).optional(),
        relativePublishTimeDescription: z.string().optional(),
        authorAttribution: z.object({ displayName: z.string().optional() }).optional(),
      }),
    )
    .default([]),
  photos: z
    .array(
      z.object({
        name: z.string(),
        authorAttributions: z.array(z.object({ displayName: z.string().optional() })).default([]),
      }),
    )
    .default([]),
});

type PlaceReview = z.infer<typeof placeDetailsSchema>['reviews'][number];

/** Google's terms forbid storing reviews and photos, so they are read live and cached for a day. */
const DETAILS_CACHE_SECONDS = 86_400;

const REVIEW_MAX_LENGTH = 320;

/**
 * Picks the reviews a demo shows: real, positive and with something to read.
 * @param reviews The reviews Google returned.
 * @param limit How many to keep.
 * @returns The best reviews, trimmed to a readable length.
 */
export const pickReviews = (reviews: PlaceReview[], limit = 3) =>
  reviews
    .filter((review) => (review.rating ?? 0) >= 4 && (review.text?.text.trim().length ?? 0) >= 40)
    .toSorted(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.text?.text.length ?? 0) - (a.text?.text.length ?? 0),
    )
    .slice(0, limit)
    .map((review) => {
      const text = review.text?.text.trim() ?? '';

      return {
        author: review.authorAttribution?.displayName ?? null,
        rating: review.rating ?? 0,
        when: review.relativePublishTimeDescription ?? null,
        text:
          text.length > REVIEW_MAX_LENGTH
            ? `${text.slice(0, text.lastIndexOf(' ', REVIEW_MAX_LENGTH))}…`
            : text,
      };
    });

/**
 * Reads the place suggestions out of an autocomplete response.
 * @param body The parsed JSON response.
 * @returns The suggested places, in Google's order.
 */
export const parseAutocompleteResponse = (body: unknown): PlaceSuggestion[] =>
  autocompleteResponseSchema.parse(body).suggestions.flatMap((suggestion) =>
    suggestion.placePrediction
      ? [
          {
            placeId: suggestion.placePrediction.placeId,
            label: suggestion.placePrediction.text.text,
          },
        ]
      : [],
  );

/**
 * Calls the Places API and fails loudly on a non-2xx response.
 * @param options The call options.
 * @param options.path The API path, relative to the v1 base URL.
 * @param options.fieldMask The fields to return, which also decide the billed SKU.
 * @param options.body The JSON body, sent as a POST when present.
 * @param options.cacheSeconds How long Next may serve the response from its cache.
 * @returns The parsed JSON response.
 * @throws {Error} When the key is missing or Google rejects the request.
 */
const request = async (options: {
  path: string;
  fieldMask?: string;
  body?: Record<string, unknown>;
  cacheSeconds?: number;
}): Promise<unknown> => {
  const key = requireEnv('GOOGLE_MAPS_API_KEY', Env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(`${PLACES_API_URL}${options.path}`, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'Content-Type': 'application/json',
      ...(options.fieldMask && { 'X-Goog-FieldMask': options.fieldMask }),
    },
    body: options.body && JSON.stringify(options.body),
    ...(options.cacheSeconds && { next: { revalidate: options.cacheSeconds } }),
  });

  if (!response.ok) {
    throw new Error(
      `Google Places ${options.path} failed with ${response.status}: ${await response.text()}`,
    );
  }

  return await response.json();
};

/**
 * Suggests Italian areas (towns, provinces, regions, postcodes) matching what the user typed.
 * Limited to Italy, like the Google Maps scrape the area is passed to.
 * @param input The partial area name.
 * @returns The suggested areas.
 * @throws {Error} When the key is missing or Google rejects the request.
 */
export const suggestAreas = async (input: string) =>
  parseAutocompleteResponse(
    await request({
      path: '/places:autocomplete',
      body: {
        input,
        includedPrimaryTypes: ['(regions)'],
        includedRegionCodes: ['it'],
        languageCode: 'it',
      },
    }),
  );

/**
 * Reads the place ids and the next page token out of a Text Search response.
 * @param body The parsed JSON response.
 * @returns The place ids, in Google's order, and the token of the next page if any.
 */
export const parseTextSearchResponse = (body: unknown) => {
  const parsed = textSearchResponseSchema.parse(body);

  return {
    placeIds: parsed.places.map((place) => place.id),
    nextPageToken: parsed.nextPageToken ?? null,
  };
};

/**
 * Reads the rectangle an area covers on the map.
 * Only the viewport is asked for, which Google bills as Place Details Essentials.
 * @param placeId The Google place id of the area.
 * @returns The viewport of the area.
 * @throws {Error} When the key is missing or Google rejects the request.
 */
export const fetchAreaViewport = async (placeId: string) =>
  viewportResponseSchema.parse(
    await request({ path: `/places/${encodeURIComponent(placeId)}`, fieldMask: 'viewport' }),
  ).viewport;

/**
 * Lists the places matching a query inside a rectangle, following every page.
 * Only place ids are asked for, which Google does not bill.
 * @param options The call options.
 * @param options.query What to search for.
 * @param options.rectangle Where to search; places outside it are left out.
 * @returns The place ids found, and whether Google hit its cap so more may be hidden.
 * @throws {Error} When the key is missing or Google rejects the request.
 */
export const scanRectangle = async (options: { query: string; rectangle: Rectangle }) => {
  const placeIds: string[] = [];
  let pageToken: string | null = null;

  // Sequential on purpose: each page carries the token of the next one
  do {
    const page = parseTextSearchResponse(
      // oxlint-disable-next-line no-await-in-loop
      await request({
        path: '/places:searchText',
        fieldMask: 'places.id,nextPageToken',
        body: {
          textQuery: options.query,
          locationRestriction: { rectangle: options.rectangle },
          pageSize: TEXT_SEARCH_PAGE_SIZE,
          languageCode: 'it',
          regionCode: 'it',
          // Businesses without a shop front are leads too
          includePureServiceAreaBusinesses: true,
          ...(pageToken && { pageToken }),
        },
      }),
    );

    placeIds.push(...page.placeIds);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { placeIds, isFull: placeIds.length >= TEXT_SEARCH_MAX_RESULTS };
};

/**
 * Reads a business's reviews and photos, in Italian, from a one-day cache.
 * Reviews and photos are billed as Place Details Enterprise and Atmosphere.
 * @param placeId The Google place id of the business.
 * @returns Its rating, reviews and photo references.
 * @throws {Error} When the key is missing or Google rejects the request.
 */
export const getPlaceDetails = async (placeId: string) =>
  placeDetailsSchema.parse(
    await request({
      path: `/places/${encodeURIComponent(placeId)}?languageCode=it`,
      fieldMask: 'rating,userRatingCount,reviews,photos',
      cacheSeconds: DETAILS_CACHE_SECONDS,
    }),
  );

const photoUriSchema = z.object({ photoUri: z.string() });

/**
 * Finds where Google's CDN serves one photo of a business, from a one-day cache. The URL
 * carries no API key, so the browser can load it directly.
 * @param options The call options.
 * @param options.name The photo reference returned by `getPlaceDetails`.
 * @param options.maxWidthPx The widest the image may be.
 * @returns The image URL, or null when Google has no such photo.
 * @throws {Error} When the key is missing.
 */
export const getPlacePhotoUri = async (options: { name: string; maxWidthPx: number }) => {
  const key = requireEnv('GOOGLE_MAPS_API_KEY', Env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(
    `${PLACES_API_URL}/${options.name}/media?maxWidthPx=${options.maxWidthPx}&skipHttpRedirect=true`,
    {
      headers: { 'X-Goog-Api-Key': key },
      next: { revalidate: DETAILS_CACHE_SECONDS },
    },
  );

  return response.ok ? photoUriSchema.parse(await response.json()).photoUri : null;
};
