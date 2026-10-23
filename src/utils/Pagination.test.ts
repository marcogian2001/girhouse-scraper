import { describe, expect, it } from 'vitest';
import { parsePage } from './Pagination';

describe(parsePage, () => {
  it('reads a whole page number', () => {
    expect(parsePage('3')).toBe(3);
  });

  it('drops the fraction of a page number', () => {
    expect(parsePage('2.7')).toBe(2);
  });

  describe('when the param is unusable', () => {
    it('falls back to the first page for an empty param', () => {
      expect(parsePage('')).toBe(1);
    });

    it('falls back to the first page for text', () => {
      expect(parsePage('abc')).toBe(1);
    });

    it('falls back to the first page below one', () => {
      expect(parsePage('-4')).toBe(1);
    });

    it('falls back to the first page for a repeated param', () => {
      expect(parsePage(['2', '3'])).toBe(1);
    });
  });
});
