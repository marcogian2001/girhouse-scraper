/** Who narrates a demo video: Gigi the giraffe, or Gianmarco, the founder. */
export type Narrator = 'gigi' | 'gianmarco';

/** ElevenLabs sends raw 16-bit mono samples at this rate: the highest it allows below the Pro tier. */
export const HOST_VOICE_SAMPLE_RATE = 24_000;

/**
 * How fast the page plays Gianmarco's voice: ElevenLabs already speaks at a natural pace,
 * so it needs less than Gigi's 1.3.
 */
export const HOST_VOICE_TEMPO = 1.1;
