import { describe, expect, it } from 'vitest';
import type { MapsPlace } from './Apify';
import { extractDomain, toLeadRow } from './Apify';

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
