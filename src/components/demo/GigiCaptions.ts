import type { HighlightSegment } from './Highlights';
import { visibleLength } from './Highlights';

/** How far a sentence may move to land on one of Gigi's pauses. */
const SNAP_SECONDS = 1.5;

/**
 * Keeps the characters of a line between two offsets, across its runs.
 * @param segments The runs of the line.
 * @param from The first character kept.
 * @param to The character the slice stops before.
 * @returns The runs cut to that range.
 */
const cutHighlights = (segments: HighlightSegment[], from: number, to: number) => {
  let offset = 0;

  return segments.flatMap((segment) => {
    const start = offset;
    offset += segment.text.length;
    const text = segment.text.slice(Math.max(from - start, 0), Math.max(to - start, 0));

    return text ? [{ ...segment, text }] : [];
  });
};

/**
 * Splits a line into its sentences, keeping the highlights, so it can be shown one
 * sentence at a time like subtitles.
 * @param segments The runs of the line.
 * @returns The runs of each sentence, in order.
 */
export const splitSentences = (segments: HighlightSegment[]) => {
  const text = segments.map((segment) => segment.text).join('');
  // A sentence ends at . ! ? or … followed by a space, maybe after a closing quote
  const ends = [...text.matchAll(/[.!?…]+[»"]?\s+/gu)].map(
    (match) => match.index + match[0].length,
  );

  return [0, ...ends]
    .map((start, index) => cutHighlights(segments, start, ends[index] ?? text.length))
    .filter((sentence) => visibleLength(sentence) > 0);
};

/**
 * Times when each sentence starts in Gigi's video. Each one is placed by its share of
 * the characters, then moved onto the closest pause in the voice, where sentences break.
 * @param options The line and the video.
 * @param options.sentences The sentences of the line.
 * @param options.duration The length of the video, in seconds.
 * @param options.pauses When the voice starts again after each pause, in seconds.
 * @returns The start of each sentence, in seconds.
 */
export const sentenceStarts = (options: {
  sentences: HighlightSegment[][];
  duration: number;
  pauses: number[];
}) => {
  const total = options.sentences.reduce((sum, sentence) => sum + visibleLength(sentence), 0);
  let before = 0;
  let previous = 0;

  return options.sentences.map((sentence, index) => {
    const estimate = (before / total) * options.duration;
    before += visibleLength(sentence);

    if (index === 0) {
      return 0;
    }

    const [pause] = options.pauses
      .filter((time) => time > previous && Math.abs(time - estimate) <= SNAP_SECONDS)
      .toSorted((a, b) => Math.abs(a - estimate) - Math.abs(b - estimate));
    previous = Math.max(pause ?? estimate, previous);

    return previous;
  });
};
