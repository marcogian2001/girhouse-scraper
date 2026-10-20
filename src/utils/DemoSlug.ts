import { toSlug } from './Helpers';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** About 59 bits: a demo link cannot be found by guessing. */
const SUFFIX_LENGTH = 10;

/**
 * Builds the public URL segment of a demo page.
 * @param company The business name, so the link reads naturally in the email.
 * @returns The business name as a slug, then a random suffix.
 */
export const createDemoSlug = (company: string) => {
  const suffix = [...crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH))]
    .map((byte) => ALPHABET[byte % ALPHABET.length])
    .join('');
  const base = toSlug(company).slice(0, 40).replace(/-+$/u, '');

  return base ? `${base}-${suffix}` : suffix;
};
