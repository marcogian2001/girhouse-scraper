import { describe, expect, it } from 'vitest';
import type { CoveragePair } from './Coverage';
import {
  estimateMonths,
  estimatePlaces,
  planDailySearches,
  rankPairs,
  resolveArea,
  sumCompletion,
  toCompletion,
  toPairStatus,
} from './Coverage';

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

  describe('Places estimate', () => {
    it('keeps the places found once every cell is scanned', () => {
      expect(estimatePlaces({ knownPlaces: 928, totalCells: 57, pendingCells: 0 })).toBe(928);
    });

    it('scales the places found up to the cells left to scan', () => {
      expect(estimatePlaces({ knownPlaces: 300, totalCells: 30, pendingCells: 20 })).toBe(900);
    });

    it('keeps the places found before any cell is scanned', () => {
      expect(estimatePlaces({ knownPlaces: 0, totalCells: 1, pendingCells: 1 })).toBe(0);
    });
  });

  describe('Completion', () => {
    it('divides the used places by the estimated ones', () => {
      expect(toCompletion({ usedPlaces: 225, estimatedPlaces: 900 })).toBe(0.25);
    });

    it('returns zero for an empty area', () => {
      expect(toCompletion({ usedPlaces: 0, estimatedPlaces: 0 })).toBe(0);
    });

    it('caps the share at one', () => {
      expect(toCompletion({ usedPlaces: 12, estimatedPlaces: 10 })).toBe(1);
    });

    it('weighs the areas by their estimated places', () => {
      expect(
        sumCompletion([
          { usedPlaces: 100, estimatedPlaces: 100 },
          { usedPlaces: 0, estimatedPlaces: 300 },
        ]),
      ).toBe(0.25);
    });
  });

  describe('Area', () => {
    it('names a province of the plan', () => {
      expect(resolveArea({ placeId: 'ChIJw0rXGxGKJRMRAIE4sppPCQM', label: 'Roma' })).toStrictEqual({
        name: 'Roma',
        kind: 'province',
        region: 'Lazio',
      });
    });

    it('finds the region of a place through its province code', () => {
      expect(resolveArea({ placeId: 'other', label: 'Roma, RM, Italia' })).toStrictEqual({
        name: 'Roma',
        kind: 'place',
        region: 'Lazio',
      });
    });

    it('finds the region of a place through its region name', () => {
      expect(resolveArea({ placeId: 'other', label: 'Lazio, Italia' }).region).toBe('Lazio');
    });

    it('leaves the name and region of an unlabelled area unknown', () => {
      expect(resolveArea({ placeId: 'other', label: null })).toStrictEqual({
        name: null,
        kind: 'place',
        region: null,
      });
    });
  });
});
