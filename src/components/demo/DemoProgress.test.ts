import { describe, expect, it } from 'vitest';
import { parseDemoProgress } from './DemoProgress';

describe(parseDemoProgress, () => {
  it('returns the saved scene when the demo has the same scenes', () => {
    expect(parseDemoProgress({ saved: '7/18', count: 18 })).toBe(7);
  });

  describe('starting over', () => {
    it('ignores a demo rebuilt with another number of scenes', () => {
      expect(parseDemoProgress({ saved: '7/18', count: 20 })).toBeNull();
    });

    it('ignores the first scene', () => {
      expect(parseDemoProgress({ saved: '0/18', count: 18 })).toBeNull();
    });

    it('ignores nothing saved', () => {
      expect(parseDemoProgress({ saved: null, count: 18 })).toBeNull();
    });

    it('ignores an unreadable value', () => {
      expect(parseDemoProgress({ saved: 'abc', count: 18 })).toBeNull();
      expect(parseDemoProgress({ saved: '18/18', count: 18 })).toBeNull();
    });
  });
});
