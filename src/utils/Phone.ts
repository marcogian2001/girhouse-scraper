/** E.164: a plus sign, then up to 15 digits with no leading zero. */
const E164 = /^\+[1-9]\d{7,14}$/u;

/**
 * Normalises a phone number to E.164, assuming Italy when no country code is given.
 * @param raw The number as written by the lead or found on Google Maps.
 * @returns The E.164 number, or null when it cannot be a valid number.
 */
export const toE164 = (raw: string | null | undefined) => {
  if (!raw) {
    return null;
  }

  const digits = raw.replaceAll(/[^\d+]/gu, '');

  const international = digits.startsWith('00') ? `+${digits.slice(2)}` : digits;

  // Italian mobiles start with 3 and landlines keep their leading 0
  const withCountry = international.startsWith('+') ? international : `+39${international}`;

  return E164.test(withCountry) ? withCountry : null;
};

/**
 * Tells whether a number is an Italian mobile, the only kind WhatsApp can reach.
 * @param e164 A number already normalised by `toE164`.
 * @returns True for +39 numbers starting with 3.
 */
export const isItalianMobile = (e164: string) => /^\+393\d{8,9}$/u.test(e164);
