/** The country codes the WhatsApp field offers, Italy first as the default. */
export const PHONE_PREFIXES = [
  { country: 'IT', dial: '+39' },
  { country: 'CH', dial: '+41' },
  { country: 'SM', dial: '+378' },
  { country: 'VA', dial: '+379' },
  { country: 'DE', dial: '+49' },
  { country: 'FR', dial: '+33' },
  { country: 'ES', dial: '+34' },
  { country: 'AT', dial: '+43' },
  { country: 'BE', dial: '+32' },
  { country: 'NL', dial: '+31' },
  { country: 'GB', dial: '+44' },
  { country: 'IE', dial: '+353' },
  { country: 'PT', dial: '+351' },
  { country: 'LU', dial: '+352' },
  { country: 'MC', dial: '+377' },
  { country: 'MT', dial: '+356' },
  { country: 'SI', dial: '+386' },
  { country: 'HR', dial: '+385' },
  { country: 'GR', dial: '+30' },
  { country: 'PL', dial: '+48' },
  { country: 'CZ', dial: '+420' },
  { country: 'SK', dial: '+421' },
  { country: 'HU', dial: '+36' },
  { country: 'RO', dial: '+40' },
  { country: 'BG', dial: '+359' },
  { country: 'AL', dial: '+355' },
  { country: 'RS', dial: '+381' },
  { country: 'DK', dial: '+45' },
  { country: 'SE', dial: '+46' },
  { country: 'NO', dial: '+47' },
  { country: 'FI', dial: '+358' },
  { country: 'UA', dial: '+380' },
  { country: 'TR', dial: '+90' },
  { country: 'MA', dial: '+212' },
  { country: 'TN', dial: '+216' },
  { country: 'EG', dial: '+20' },
  { country: 'AE', dial: '+971' },
  { country: 'US', dial: '+1' },
  { country: 'CA', dial: '+1' },
  { country: 'BR', dial: '+55' },
  { country: 'AR', dial: '+54' },
  { country: 'AU', dial: '+61' },
] as const;

export type PhonePrefix = (typeof PHONE_PREFIXES)[number];

/**
 * Joins the chosen country code and the number the lead typed.
 * A number typed with its own country code keeps it.
 * @param options The parts.
 * @param options.dial The chosen country code, such as +39.
 * @param options.number The number as typed.
 * @returns The international number, ready for `toE164`.
 */
export const withPrefix = (options: { dial: string; number: string }) => {
  const number = options.number.trim();

  if (number.startsWith('+') || number.startsWith('00')) {
    return number;
  }

  // An Italian landline keeps its leading 0; elsewhere the trunk 0 is dropped
  const national = options.dial === '+39' ? number : number.replace(/^0+/u, '');

  return `${options.dial}${national}`;
};

/**
 * Finds the country codes matching what was typed in the search: the country's name, its
 * code or its prefix.
 * @param options The search.
 * @param options.query What was typed.
 * @param options.nameOf The country's name in the visitor's language.
 * @returns The matching prefixes, in list order.
 */
export const searchPrefixes = (options: {
  query: string;
  nameOf: (country: PhonePrefix['country']) => string;
}) => {
  const query = options.query.trim().toLocaleLowerCase();
  const digits = query.replaceAll(/\D/gu, '');

  if (!query) {
    return [...PHONE_PREFIXES];
  }

  return PHONE_PREFIXES.filter(
    (prefix) =>
      options.nameOf(prefix.country).toLocaleLowerCase().includes(query) ||
      prefix.country.toLocaleLowerCase() === query ||
      (digits !== '' && prefix.dial.slice(1).startsWith(digits)),
  );
};
