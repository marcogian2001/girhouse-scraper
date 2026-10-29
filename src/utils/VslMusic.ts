/** Version B's chapters, each with its own music, so the change of topic is heard. */
export const VSL_CHAPTERS = ['opening', 'problem', 'solution', 'dream', 'offer'] as const;

export type VslChapter = (typeof VSL_CHAPTERS)[number];

/** How long a track's end fades into its start, which is where its loop starts again. */
export const MUSIC_CROSSFADE_SECONDS = 4;

/**
 * Finds a chapter's track.
 * @param chapter The chapter.
 * @returns The track's path.
 */
export const musicPath = (chapter: VslChapter) => `/demo/music/${chapter}.mp3`;

/** The sounds version B plays on cue, made by `scripts/generate-sfx.ts`. */
export const VSL_SOUNDS = ['ring', 'ping', 'bell', 'whoosh', 'hit', 'pop'] as const;

export type VslSound = (typeof VSL_SOUNDS)[number];

/** How loud each sound plays under the voice, the whoosh being the quietest file. */
export const SOUND_GAIN: Record<VslSound, number> = {
  ring: 0.55,
  ping: 0.5,
  bell: 0.45,
  whoosh: 0.9,
  hit: 0.6,
  pop: 0.5,
};
