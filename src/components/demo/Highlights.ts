/** How a run of Gigi's text is shown. */
type HighlightStyle = 'plain' | 'bold' | 'mark';

export type HighlightSegment = { text: string; style: HighlightStyle };

/** The tags `t.markup` turns `<b>` and `<hl>` into. */
export const HIGHLIGHT_TAGS = {
  b: (chunks: string) => `<b>${chunks}</b>`,
  hl: (chunks: string) => `<mark>${chunks}</mark>`,
};

/**
 * Splits a line with `<b>` and `<mark>` tags into styled runs. Tags are not nested.
 * @param text The line, as `t.markup` returns it with `HIGHLIGHT_TAGS`.
 * @returns The runs in order, empty ones dropped.
 */
export const parseHighlights = (text: string): HighlightSegment[] =>
  text
    .split(/(<b>[\s\S]*?<\/b>|<mark>[\s\S]*?<\/mark>)/u)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('<b>')) {
        return { text: part.slice(3, -4), style: 'bold' as const };
      }

      if (part.startsWith('<mark>')) {
        return { text: part.slice(6, -7), style: 'mark' as const };
      }

      return { text: part, style: 'plain' as const };
    })
    .filter((segment) => segment.text);

/**
 * Counts the characters of a line once its tags are gone.
 * @param segments The runs of the line.
 * @returns How many characters the typewriter has to type.
 */
export const visibleLength = (segments: HighlightSegment[]) =>
  segments.reduce((sum, segment) => sum + segment.text.length, 0);

/**
 * Keeps the first characters of a line, across its runs.
 * @param segments The runs of the line.
 * @param count How many characters are typed so far.
 * @returns The runs cut at that point.
 */
export const sliceHighlights = (segments: HighlightSegment[], count: number) => {
  let left = count;

  return segments.flatMap((segment) => {
    if (left <= 0) {
      return [];
    }

    const text = segment.text.slice(0, left);
    left -= text.length;

    return [{ ...segment, text }];
  });
};

/**
 * Removes the highlight tags, for the voice-over and screen readers.
 * @param text The line with tags.
 * @returns The plain text.
 */
export const stripHighlights = (text: string) => text.replaceAll(/<\/?(?:b|mark|hl)>/gu, '');
