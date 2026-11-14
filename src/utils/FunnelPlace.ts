/** Stands in for the Google place of a funnel lead whose business was not found on Google Maps. */
export const FUNNEL_PLACE_PREFIX = 'funnel-';

/**
 * Reads a lead's Google place id, leaving out the stand-in of a funnel lead without one.
 * @param placeId The lead's place id.
 * @returns The Google place id, or null when there is none.
 */
export const googlePlaceId = (placeId: string | null | undefined) =>
  placeId && !placeId.startsWith(FUNNEL_PLACE_PREFIX) ? placeId : null;
