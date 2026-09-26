import { describe, expect, it } from 'vitest';
import { autoDetectMapping } from './Csv';
import {
  matchesWebsiteFilter,
  pickEmailRoutes,
  readPublicEmail,
  toLeadCsv,
  uniqueByPlaceId,
} from './Leads';

describe('Leads', () => {
  describe('Website filter', () => {
    it('keeps every business when the filter is off', () => {
      expect(matchesWebsiteFilter({ hasWebsite: false, filter: 'any' })).toBeTruthy();
      expect(matchesWebsiteFilter({ hasWebsite: true, filter: 'any' })).toBeTruthy();
    });

    it('keeps only businesses without a website', () => {
      expect(matchesWebsiteFilter({ hasWebsite: false, filter: 'without' })).toBeTruthy();
      expect(matchesWebsiteFilter({ hasWebsite: true, filter: 'without' })).toBeFalsy();
    });

    it('keeps only businesses with a website', () => {
      expect(matchesWebsiteFilter({ hasWebsite: true, filter: 'with' })).toBeTruthy();
      expect(matchesWebsiteFilter({ hasWebsite: false, filter: 'with' })).toBeFalsy();
    });
  });

  describe('Public email', () => {
    it('lowercases and trims a published address', () => {
      expect(readPublicEmail('  Info@StudioRossi.it ')).toBe('info@studiorossi.it');
    });

    it('rejects an empty or malformed value', () => {
      expect(readPublicEmail('')).toBeNull();
      expect(readPublicEmail('not an email')).toBeNull();
      expect(readPublicEmail()).toBeNull();
    });
  });

  describe('Email routes', () => {
    const named = { domain: 'studiorossi.it', firstName: 'Mario', lastName: 'Rossi' };

    it('tries Prospeo for a named person at a domain', () => {
      expect(pickEmailRoutes({ lead: named, publicEmail: null })).toStrictEqual({
        prospeo: true,
        publicEmail: false,
      });
    });

    it('skips Prospeo for a business without a website', () => {
      const routes = pickEmailRoutes({
        lead: { ...named, domain: null },
        publicEmail: 'mario.rossi@gmail.com',
      });

      expect(routes).toStrictEqual({ prospeo: false, publicEmail: true });
    });

    it('skips Prospeo without a decision maker name', () => {
      const routes = pickEmailRoutes({
        lead: { ...named, lastName: null },
        publicEmail: null,
      });

      expect(routes).toStrictEqual({ prospeo: false, publicEmail: false });
    });
  });

  describe('Place deduplication', () => {
    it('keeps the first occurrence of each place in order', () => {
      const places = [
        { placeId: 'a', term: 1 },
        { placeId: 'b', term: 1 },
        { placeId: 'a', term: 2 },
      ];

      expect(uniqueByPlaceId(places)).toStrictEqual([
        { placeId: 'a', term: 1 },
        { placeId: 'b', term: 1 },
      ]);
    });
  });

  describe('Lead CSV', () => {
    const lead = {
      email: 'mario@gmail.com',
      firstName: 'Mario',
      lastName: 'Rossi',
      phone: '035 123456',
      company: 'Studio Rossi',
      website: 'https://facebook.com/studiorossi',
      linkedinUrl: null,
      role: 'Titolare',
      category: 'Commercialista',
      city: 'Bergamo',
      address: 'Via Roma 1',
      hasWebsite: false,
      rating: 4.6,
      reviewsCount: null,
    };

    it('uses headers the column mapper recognises', () => {
      const csv = toLeadCsv({ name: 'Bergamo', leads: [lead] });

      expect(autoDetectMapping(csv.headers)).toStrictEqual({
        email: 'Email',
        firstName: 'First name',
        lastName: 'Last name',
        phone: 'Phone',
        company: 'Company',
        website: 'Website',
        linkedinUrl: 'LinkedIn',
      });
    });

    it('flags a business without its own website for the copywriter', () => {
      const [row] = toLeadCsv({ name: 'Bergamo', leads: [lead] }).rows;

      expect(row).toMatchObject({
        'Has own website': 'no',
        Role: 'Titolare',
        'Google reviews': '',
      });
    });
  });
});
