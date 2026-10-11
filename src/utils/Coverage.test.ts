import { describe, expect, it } from 'vitest';
import type { CoveragePair } from './Coverage';
import { estimateMonths, planDailySearches, rankPairs, toPairStatus } from './Coverage';

const pair = (overrides: Partial<CoveragePair>): CoveragePair => ({
  provinceCode: 'MI',
  term: 'idraulico',
  tier: 1,
  population: 1000,
  passes: 0,
  isRunning: false,
  status: 'not_started',
  ...overrides,
});

describe('Coverage', () => {
  describe('Pair status', () => {
    it('marks a pair never searched as not started', () => {
      expect(toPairStatus(null, 0)).toBe('not_started');
    });

    it('marks a pair searched before as in progress', () => {
      expect(toPairStatus({ pendingCells: 2, unusedPlaces: 0, reserveLeads: 0 }, 1)).toBe(
        'in_progress',
      );
    });

    it('marks a fully scanned and used pair as exhausted', () => {
      expect(toPairStatus({ pendingCells: 0, unusedPlaces: 0, reserveLeads: 0 }, 3)).toBe(
        'exhausted',
      );
    });

    it('keeps a pair open while reserve leads are left', () => {
      expect(toPairStatus({ pendingCells: 0, unusedPlaces: 0, reserveLeads: 4 }, 1)).toBe(
        'in_progress',
      );
    });
  });

  describe('Ranking', () => {
    it('puts pairs with fewer passes first, then lower tiers, then larger provinces', () => {
      const ranked = rankPairs([
        pair({ provinceCode: 'A', passes: 1, tier: 1, population: 9000 }),
        pair({ provinceCode: 'B', passes: 0, tier: 2, population: 9000 }),
        pair({ provinceCode: 'C', passes: 0, tier: 1, population: 100 }),
        pair({ provinceCode: 'D', passes: 0, tier: 1, population: 5000 }),
      ]);

      expect(ranked.map((item) => item.provinceCode)).toStrictEqual(['D', 'C', 'B', 'A']);
    });

    it('skips exhausted pairs and pairs still scraping', () => {
      const ranked = rankPairs([
        pair({ provinceCode: 'A', status: 'exhausted' }),
        pair({ provinceCode: 'B', isRunning: true }),
        pair({ provinceCode: 'C' }),
      ]);

      expect(ranked.map((item) => item.provinceCode)).toStrictEqual(['C']);
    });
  });

  describe('Daily searches', () => {
    it('splits the quota into full searches and a remainder', () => {
      expect(planDailySearches({ remaining: 600, leadsPerSearch: 250 })).toStrictEqual([
        250, 250, 100,
      ]);
    });

    it('plans nothing once the quota is used', () => {
      expect(planDailySearches({ remaining: 0, leadsPerSearch: 250 })).toStrictEqual([]);
      expect(planDailySearches({ remaining: -20, leadsPerSearch: 250 })).toStrictEqual([]);
    });
  });

  describe('Months estimate', () => {
    it('rounds the months left up to one decimal', () => {
      expect(estimateMonths({ unusedPlaces: 22_500, dailyPlaces: 750 })).toBe(1);
      expect(estimateMonths({ unusedPlaces: 23_000, dailyPlaces: 750 })).toBe(1.1);
    });
  });
});
