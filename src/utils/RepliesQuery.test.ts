import { describe, expect, it } from 'vitest';
import { hasRepliesFilters, parseRepliesQuery, repliesHref } from './RepliesQuery';

describe('RepliesQuery', () => {
  describe('Parsing', () => {
    it('reads every filter from the search params', () => {
      expect(
        parseRepliesQuery({ q: ' rossi ', state: 'auto_reply', answered: 'no', bot: 'yes' }, [
          'manual_review',
          'auto_reply',
        ]),
      ).toStrictEqual({ search: 'rossi', state: 'auto_reply', answered: 'no', bot: 'yes' });
    });

    it('drops unknown values', () => {
      expect(
        parseRepliesQuery({ state: 'nope', answered: 'maybe', bot: ['yes'] }, ['manual_review']),
      ).toStrictEqual({ search: '', state: undefined, answered: undefined, bot: undefined });
    });
  });

  describe('Link', () => {
    it('keeps the filters and the page', () => {
      expect(
        repliesHref({ search: 'mario rossi', state: 'manual_review', answered: 'yes' }, 2),
      ).toBe('/dashboard/replies/?q=mario+rossi&state=manual_review&answered=yes&page=2');
    });

    it('links to the bare list without filters on the first page', () => {
      expect(repliesHref({ search: '  ' }, 1)).toBe('/dashboard/replies/');
    });
  });

  describe('Active filters', () => {
    it('ignores a blank search', () => {
      expect(hasRepliesFilters({ search: ' ' })).toBeFalsy();
    });

    it('detects a set filter', () => {
      expect(hasRepliesFilters({ search: '', bot: 'no' })).toBeTruthy();
    });
  });
});
