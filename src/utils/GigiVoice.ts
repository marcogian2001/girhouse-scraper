import { stripHighlights } from '@/components/demo/Highlights';

/** Gemini "Achird": a friendly male voice that speaks natural Italian. */
export const GIGI_VOICE_NAME = 'Achird';

export const GIGI_VOICE_STYLE =
  'Voce maschile calda e amichevole, italiano naturale, ritmo tranquillo e sorridente.';

/** Gemini has no speed setting: the videos speed the voice up with ffmpeg, the page plays it faster. */
export const GIGI_VOICE_TEMPO = 1.15;

/** Read as written, the voice says "Ghirhouse": spelled the Italian way, the G is soft as in "giraffa". */
const SPOKEN_NAME = 'Giraus';

/**
 * Turns one of Gigi's lines into what the voice reads.
 * @param line The line, with its highlight tags.
 * @returns The plain text, with the brand spelled the way it is said.
 */
export const toSpokenText = (line: string) =>
  stripHighlights(line).replaceAll('Girhouse', SPOKEN_NAME).trim();
