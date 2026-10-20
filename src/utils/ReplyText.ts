/** Lines that open the quoted copy of an earlier email in a reply. */
const QUOTE_HEADER =
  /^(?:>|il giorno .+ ha scritto|on .+ wrote|-{2,}\s*(?:original message|messaggio originale)|da:\s|from:\s|inviato da\s|sent from\s)/iu;

/**
 * Keeps only what the lead wrote, dropping the quoted thread and signature
 * banners mail clients append below it.
 * @param text The plain-text reply.
 * @returns The lead's own words, trimmed.
 */
export const stripQuotedReply = (text: string) => {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const end = lines.findIndex((line) => QUOTE_HEADER.test(line.trim()));

  return (end === -1 ? lines : lines.slice(0, end)).join('\n').trim();
};

/**
 * Lower-cases a text and strips accents, so Italian phrases match however they were typed.
 * @param text The text to normalise.
 * @returns The normalised text with single spaces.
 */
export const normalizeForMatching = (text: string) =>
  text
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ')
    .trim();
