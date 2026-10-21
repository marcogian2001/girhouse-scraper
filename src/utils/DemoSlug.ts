import { toSlug } from './Helpers';

/** What a business name with no letters or digits becomes. */
const FALLBACK_SLUG = 'demo';

const MAX_LENGTH = 60;

/**
 * Builds the public URL segment of a demo page.
 * @param company The business name, so the link reads naturally in the email.
 * @returns The business name as a slug, cut between words when too long.
 */
export const createDemoSlug = (company: string) => {
  const slug = toSlug(company);

  if (slug.length <= MAX_LENGTH) {
    return slug || FALLBACK_SLUG;
  }

  // One character more, so a word ending exactly at the limit is kept whole
  const lastBreak = slug.slice(0, MAX_LENGTH + 1).lastIndexOf('-');

  return slug.slice(0, lastBreak > 0 ? lastBreak : MAX_LENGTH);
};

/**
 * Picks the first slug no other demo has, numbering businesses with the same name.
 * @param base The slug of the business name.
 * @param taken The slugs other demos already have.
 * @returns The base itself, or the base followed by the first free number from 2.
 */
export const pickFreeDemoSlug = (base: string, taken: ReadonlySet<string>) => {
  if (!taken.has(base)) {
    return base;
  }

  let number = 2;

  while (taken.has(`${base}-${number}`)) {
    number += 1;
  }

  return `${base}-${number}`;
};
