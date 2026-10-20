/** A plain email address inside free text. */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/iu;

/** Italian titles that come before a name and are not part of it. */
const TITLE_PATTERN =
  /\b(?:dott(?:\.?ssa)?|dr|sig(?:\.?ra)?|ing|avv|arch|prof(?:\.?ssa)?|geom|rag)\.?(?=\s|$)/giu;

/**
 * Reads the person a "wrong person" reply points to, as the classifier wrote it.
 * @param referral The referral text, such as "Mario Rossi, mario@studio.it".
 * @returns The lower-cased email and the name around it, or null when there is no email.
 */
export const parseReferral = (referral: string | null) => {
  const email = referral?.match(EMAIL_PATTERN)?.[0]?.toLowerCase();

  if (!referral || !email) {
    return null;
  }

  const name = referral
    .replace(EMAIL_PATTERN, '')
    .replaceAll(TITLE_PATTERN, ' ')
    .replaceAll(/[<>()[\],;:]|\s[-–—](?=\s|$)/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  const [firstName, ...rest] = name ? name.split(' ') : [];

  return {
    email,
    firstName: firstName ?? null,
    lastName: rest.length > 0 ? rest.join(' ') : null,
  };
};
