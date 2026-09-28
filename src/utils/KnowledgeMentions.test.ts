import { describe, expect, it } from 'vitest';
import {
  extractMentionNames,
  findActiveMention,
  insertMention,
  removeMentionAt,
  splitMentions,
} from './KnowledgeMentions';

describe('KnowledgeMentions', () => {
  describe('Extracting names', () => {
    it('returns each mentioned name once', () => {
      const text =
        'Use @[Price list 2026.pdf] and @[Case study.md], then @[Price list 2026.pdf] again.';

      expect(extractMentionNames(text)).toStrictEqual(['Price list 2026.pdf', 'Case study.md']);
    });

    it('ignores a bare @ and email addresses', () => {
      expect(extractMentionNames('Write to ada@analytical.com @ noon')).toStrictEqual([]);
    });
  });

  describe('Active mention', () => {
    it('opens on an @ at the start of a word', () => {
      const text = 'Read @Pri';

      expect(findActiveMention({ text, caret: text.length })).toStrictEqual({
        start: 5,
        query: 'Pri',
      });
    });

    it('keeps spaces in the query', () => {
      const text = 'Read @[Price li';

      expect(findActiveMention({ text, caret: text.length })?.query).toBe('Price li');
    });

    it('stays closed inside an email address', () => {
      const text = 'ada@analytical';

      expect(findActiveMention({ text, caret: text.length })).toBeNull();
    });

    it('stays closed after a completed mention', () => {
      const text = 'Read @[Price list.pdf] now';

      expect(findActiveMention({ text, caret: text.length })).toBeNull();
    });
  });

  describe('Splitting', () => {
    it('separates mentions from the text around them', () => {
      expect(splitMentions('Read @[Price list.pdf] now')).toStrictEqual([
        { type: 'text', start: 0, value: 'Read ' },
        { type: 'mention', start: 5, name: 'Price list.pdf', raw: '@[Price list.pdf]' },
        { type: 'text', start: 22, value: ' now' },
      ]);
    });

    it('returns a single run when nothing is mentioned', () => {
      expect(splitMentions('Plain text')).toStrictEqual([
        { type: 'text', start: 0, value: 'Plain text' },
      ]);
    });
  });

  describe('Removing', () => {
    const text = 'Read @[Price list.pdf] now';

    it('deletes the whole mention on Backspace right after it', () => {
      expect(removeMentionAt({ text, caret: 22, key: 'Backspace' })).toStrictEqual({
        text: 'Read  now',
        caret: 5,
        name: 'Price list.pdf',
      });
    });

    it('deletes the whole mention on Delete right before it', () => {
      expect(removeMentionAt({ text, caret: 5, key: 'Delete' })?.text).toBe('Read  now');
    });

    it('leaves plain text to the browser', () => {
      expect(removeMentionAt({ text, caret: 3, key: 'Backspace' })).toBeNull();
      expect(removeMentionAt({ text, caret: 22, key: 'Delete' })).toBeNull();
    });
  });

  describe('Inserting', () => {
    it('replaces the typed query and moves the caret past the token', () => {
      const text = 'Read @Pri please';

      expect(insertMention({ text, start: 5, caret: 9, name: 'Price list.pdf' })).toStrictEqual({
        text: 'Read @[Price list.pdf]  please',
        caret: 23,
      });
    });
  });
});
