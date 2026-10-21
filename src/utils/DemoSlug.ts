import { toSlug } from './Helpers';

/** What a business name with no letters or digits becomes. */
const FALLBACK_SLUG = 'demo';

/**
 * Builds the public URL segment of a demo page.
 * @param company The business name, so the link reads naturally in the email.
 * @returns The business name as a slug.
 */
export const createDemoSlug = (company: string) =>
  toSlug(company).slice(0, 40).replace(/-+$/u, '') || FALLBACK_SLUG;

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
