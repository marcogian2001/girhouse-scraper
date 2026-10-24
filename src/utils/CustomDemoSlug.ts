/** The maximum length accepted for a manually chosen demo slug. */
const CUSTOM_DEMO_SLUG_MAX_LENGTH = 60;

/**
 * Trims a manually chosen slug and makes its casing consistent.
 * @param value The typed slug.
 * @returns The trimmed, lowercase slug.
 */
export const normalizeCustomDemoSlug = (value: string) => value.trim().toLowerCase();

/**
 * Accepts a URL segment that the demo domain can route to the public demo page.
 * @param value The normalized slug.
 * @returns Whether the segment has a valid format and avoids reserved routing prefixes.
 */
export const isCustomDemoSlug = (value: string) =>
  value.length <= CUSTOM_DEMO_SLUG_MAX_LENGTH &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) &&
  !/^(?:api|ingest|monitoring)/u.test(value);
