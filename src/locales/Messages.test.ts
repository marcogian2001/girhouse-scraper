import { describe, expect, it } from 'vitest';
import en from './en.json';
import it_ from './it.json';

/**
 * Lists every message of a locale file with its dotted key.
 * @param messages The messages, nested by namespace.
 * @param prefix The key of the parent namespace.
 * @returns The key and text of each message.
 */
const flatten = (messages: object, prefix = ''): [string, string][] =>
  Object.entries(messages).flatMap(([key, value]: [string, unknown]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      return [[path, value]];
    }

    return typeof value === 'object' && value !== null ? flatten(value, path) : [];
  });

describe('Messages', () => {
  // ICU reads an apostrophe right before a tag or a placeholder as the start of a quote:
  // the apostrophe vanishes and the tags show up as text
  it.each([
    ['en', en],
    ['it', it_],
  ])('keeps apostrophes away from tags and placeholders in %s', (_locale, messages) => {
    const broken = flatten(messages)
      .filter(([, text]) => /(?<!')'[<{]/u.test(text))
      .map(([key]) => key);

    expect(broken).toStrictEqual([]);
  });
});
