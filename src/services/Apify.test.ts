import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapsPlace } from './Apify';
import { extractDomain, fetchMapsRun, toLeadRow } from './Apify';

vi.mock(import('@/libs/Env'), async (original) => {
  const originalEnv = await original();
  return { Env: { ...originalEnv.Env, APIFY_API_TOKEN: 'test-only' } };
});

const place = (overrides: Partial<MapsPlace> = {}): MapsPlace => ({
  placeId: 'ChIJ123',
  title: 'Studio Rossi',
  ...overrides,
});

describe('Apify', () => {
  describe('Domain extraction', () => {
    it('strips the scheme, path and www prefix', () => {
      expect(extractDomain('https://www.StudioRossi.it/contatti')).toBe('studiorossi.it');
    });

    it('accepts a website listed without a scheme', () => {
      expect(extractDomain('studiorossi.it')).toBe('studiorossi.it');
    });

    it('returns null for a value that is not a URL', () => {
      expect(extractDomain('http://')).toBeNull();
    });
  });

  describe('Lead row', () => {
    it('keeps a business without a website', () => {
      const row = toLeadRow(place());

      expect(row.hasWebsite).toBeFalsy();
      expect(row.website).toBeNull();
      expect(row.domain).toBeNull();
    });

    it('marks a business with its own site as having a website', () => {
      const row = toLeadRow(place({ website: 'https://www.studiorossi.it/' }));

      expect(row.hasWebsite).toBeTruthy();
      expect(row.domain).toBe('studiorossi.it');
    });

    it('treats a Facebook page as no website but keeps the link', () => {
      const row = toLeadRow(place({ website: 'https://m.facebook.com/studiorossi' }));

      expect(row.hasWebsite).toBeFalsy();
      expect(row.domain).toBeNull();
      expect(row.website).toBe('https://m.facebook.com/studiorossi');
    });

    it('copies the Google Maps details', () => {
      const row = toLeadRow(
        place({
          categoryName: 'Commercialista',
          city: 'Bergamo',
          totalScore: 4.6,
          reviewsCount: 31,
        }),
      );

      expect(row).toMatchObject({
        company: 'Studio Rossi',
        category: 'Commercialista',
        city: 'Bergamo',
        rating: 4.6,
        reviewsCount: 31,
      });
    });
  });
});

describe('Apify run cost', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { usageTotalUsd: 0, expected: 0 },
    { usageTotalUsd: 0.2654, expected: 265_400 },
    { usageTotalUsd: null, expected: null },
    { usageTotalUsd: undefined, expected: null },
  ])(
    'reads cost without fetching dataset for $usageTotalUsd',
    async ({ usageTotalUsd, expected }) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        Response.json({
          data: {
            id: 'run',
            status: 'SUCCEEDED',
            defaultDatasetId: 'dataset',
            usageTotalUsd,
          },
        }),
      );
      vi.stubGlobal('fetch', fetch);
      await expect(fetchMapsRun('run')).resolves.toStrictEqual({
        state: 'succeeded',
        datasetId: 'dataset',
        costMicros: expected,
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('rejects a negative cost', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        Response.json({
          data: {
            id: 'run',
            status: 'SUCCEEDED',
            defaultDatasetId: 'dataset',
            usageTotalUsd: -1,
          },
        }),
      ),
    );
    await expect(fetchMapsRun('run')).rejects.toThrow('Too small');
  });
});
