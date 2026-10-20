/** The country codes the WhatsApp field offers, Italy first as the default. */
export const PHONE_PREFIXES = [
  { country: 'IT', flag: '🇮🇹', dial: '+39' },
  { country: 'CH', flag: '🇨🇭', dial: '+41' },
  { country: 'SM', flag: '🇸🇲', dial: '+378' },
  { country: 'VA', flag: '🇻🇦', dial: '+379' },
  { country: 'DE', flag: '🇩🇪', dial: '+49' },
  { country: 'FR', flag: '🇫🇷', dial: '+33' },
  { country: 'ES', flag: '🇪🇸', dial: '+34' },
  { country: 'AT', flag: '🇦🇹', dial: '+43' },
  { country: 'BE', flag: '🇧🇪', dial: '+32' },
  { country: 'NL', flag: '🇳🇱', dial: '+31' },
  { country: 'GB', flag: '🇬🇧', dial: '+44' },
  { country: 'US', flag: '🇺🇸', dial: '+1' },
] as const;

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
