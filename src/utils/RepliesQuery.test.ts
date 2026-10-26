import { describe, expect, it } from 'vitest';
import { hasRepliesFilters, parseRepliesQuery, repliesHref } from './RepliesQuery';

describe('RepliesQuery', () => {
  describe('Parsing', () => {
    it('reads every filter from the search params', () => {
      expect(
        parseRepliesQuery({ q: ' rossi ', state: 'interested', answered: 'no', bot: 'yes' }),
      ).toStrictEqual({
        search: 'rossi',
        state: 'interested',
        answered: 'no',
        bot: 'yes',
        campaigns: [],
      });
    });

    it('reads one or many campaigns and drops malformed ids', () => {
      const first = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
      const second = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';

      expect(parseRepliesQuery({ campaign: first }).campaigns).toStrictEqual([first]);
      expect(
        parseRepliesQuery({ campaign: [first, 'nope', second, first] }).campaigns,
      ).toStrictEqual([first, second]);
    });

    it('drops unknown values and internal states', () => {
      expect(parseRepliesQuery({ state: 'paused', answered: 'maybe', bot: ['yes'] })).toStrictEqual(
        { search: '', state: undefined, answered: undefined, bot: undefined, campaigns: [] },
      );
    });
  });

  describe('Link', () => {
    it('keeps the filters and the page', () => {
      expect(
        repliesHref({ search: 'mario rossi', state: 'manual_review', answered: 'yes' }, 2),
      ).toBe('/dashboard/replies/?q=mario+rossi&state=manual_review&answered=yes&page=2');
    });

    it('repeats the campaign param for each campaign', () => {
      expect(repliesHref({ search: '', campaigns: ['a', 'b'] })).toBe(
        '/dashboard/replies/?campaign=a&campaign=b',
      );
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

    it('ignores an empty campaign list', () => {
      expect(hasRepliesFilters({ search: '', campaigns: [] })).toBeFalsy();
    });
  });
});
