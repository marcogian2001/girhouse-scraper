const MENTION_PATTERN = /@\[([^\]\n]+)\]/gu;

/**
 * Lists the knowledge documents a text mentions as `@[name]`.
 * @param text The prompt or brief to scan.
 * @returns The unique mentioned names, in order of first appearance.
 */
export const extractMentionNames = (text: string) =>
  [
    ...new Set(Array.from(text.matchAll(MENTION_PATTERN), (match) => match[1]?.trim() ?? '')),
  ].filter(Boolean);

/** A run of plain text, or a complete `@[name]` token, with where it starts. */
type MentionSegment =
  | { type: 'text'; start: number; value: string }
  | { type: 'mention'; start: number; name: string; raw: string };

/**
 * Splits a text into plain runs and `@[name]` tokens, so mentions can be drawn as chips.
 * @param text The prompt or brief to split.
 * @returns The segments, which join back into the original text.
 */
export const splitMentions = (text: string) => {
  const segments: MentionSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MENTION_PATTERN)) {
    if (match.index > cursor) {
      segments.push({ type: 'text', start: cursor, value: text.slice(cursor, match.index) });
    }

    segments.push({ type: 'mention', start: match.index, name: match[1] ?? '', raw: match[0] });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', start: cursor, value: text.slice(cursor) });
  }

  return segments;
};

/**
 * Removes a whole `@[name]` token when Backspace or Delete touches it, so a
 * chip never breaks into loose characters.
 * @param options The call options.
 * @param options.text The full textarea value.
 * @param options.caret The caret position, with nothing selected.
 * @param options.key The key being pressed.
 * @returns The new value and caret plus the removed name, or null when no token is touched.
 */
export const removeMentionAt = (options: {
  text: string;
  caret: number;
  key: 'Backspace' | 'Delete';
}) => {
  for (const match of options.text.matchAll(MENTION_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    const touches =
      options.key === 'Backspace'
        ? options.caret > start && options.caret <= end
        : options.caret >= start && options.caret < end;

    if (touches) {
      return {
        text: options.text.slice(0, start) + options.text.slice(end),
        caret: start,
        name: match[1] ?? '',
      };
    }
  }

  return null;
};

/**
 * Finds the `@` mention being typed right before the caret, if any.
 * @param options The call options.
 * @param options.text The full textarea value.
 * @param options.caret The caret position.
 * @returns Where the `@` sits and what was typed after it, or null.
 */
export const findActiveMention = (options: { text: string; caret: number }) => {
  const before = options.text.slice(0, options.caret);
  // An `@` opening a word, followed by anything but a closing bracket or a new line
  const match = /(?:^|\s)@\[?([^\]\n@]*)$/u.exec(before);

  if (!match) {
    return null;
  }

  return { start: before.lastIndexOf('@'), query: match[1] ?? '' };
};

/**
 * Replaces the mention being typed with a complete `@[name]` token.
 * @param options The call options.
 * @param options.text The full textarea value.
 * @param options.start Where the `@` sits.
 * @param options.caret The caret position.
 * @param options.name The picked document name.
 * @returns The new value and where the caret belongs.
 */
export const insertMention = (options: {
  text: string;
  start: number;
  caret: number;
  name: string;
}) => {
  const token = `@[${options.name}] `;

  return {
    text: options.text.slice(0, options.start) + token + options.text.slice(options.caret),
    caret: options.start + token.length,
  };
};
