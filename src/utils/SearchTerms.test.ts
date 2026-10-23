import { describe, expect, it } from 'vitest';
import {
  ACCENTED_LETTERS,
  foldText,
  matchesAllTerms,
  PLAIN_LETTERS,
  splitSearchTerms,
  toLikePattern,
} from './SearchTerms';

describe('SearchTerms', () => {
  describe(foldText, () => {
    it('strips accents and lower-cases', () => {
      expect(foldText('Caffè Città')).toBe('caffe citta');
    });

    it('folds every accented letter like the SQL translation table', () => {
      expect(foldText(ACCENTED_LETTERS)).toBe(PLAIN_LETTERS);
    });
  });

  describe(splitSearchTerms, () => {
    it('splits on any whitespace and drops empties', () => {
      expect(splitSearchTerms('  Gino \t Trattoria ')).toStrictEqual(['gino', 'trattoria']);
    });

    it('caps the number of words', () => {
      expect(splitSearchTerms('a b c d e f g')).toHaveLength(5);
    });
  });

  describe(toLikePattern, () => {
    it('escapes like wildcards and backslashes', () => {
      expect(toLikePattern('50%_a\\b')).toBe(String.raw`%50\%\_a\\b%`);
    });
  });

  describe(matchesAllTerms, () => {
    it('matches words in any order', () => {
      expect(
        matchesAllTerms({ text: 'Trattoria da Gino', terms: splitSearchTerms('gino trattoria') }),
      ).toBeTruthy();
    });

    it('matches across accents', () => {
      expect(
        matchesAllTerms({ text: 'Caffè Roma', terms: splitSearchTerms('caffe') }),
      ).toBeTruthy();
    });

    it('rejects text missing one of the words', () => {
      expect(
        matchesAllTerms({ text: 'Dentisti Roma', terms: splitSearchTerms('roma milano') }),
      ).toBeFalsy();
    });
  });
});
