import { describe, expect, it } from 'vitest';
import { autoDetectMapping } from './Csv';
import { ITALIAN_PROVINCES } from './ItalianProvinces';
import {
  matchesWebsiteFilter,
  pickEmailRoutes,
  readPublicEmail,
  scrapeBudget,
  splitRectangle,
  splitScrapedPlaces,
  toEnrichmentContent,
  toLeadCsv,
  toSearchKey,
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

  describe('Search key', () => {
    it('lowercases a term and collapses its spaces', () => {
      expect(toSearchKey('  Studio   Commercialista ')).toBe('studio commercialista');
    });
  });

  describe('Scrape budget', () => {
    it('scrapes exactly the missing leads without a website filter', () => {
      expect(scrapeBudget({ missing: 50, filter: 'any' })).toBe(50);
    });

    it('scrapes more than the missing leads with a website filter', () => {
      expect(scrapeBudget({ missing: 50, filter: 'without' })).toBe(75);
    });

    it('caps the places of one run', () => {
      expect(scrapeBudget({ missing: 1000, filter: 'with' })).toBe(1000);
    });
  });

  describe('Rectangle split', () => {
    it('returns four quarters meeting at the centre', () => {
      const quarters = splitRectangle({
        low: { latitude: 40, longitude: 10 },
        high: { latitude: 42, longitude: 14 },
      });

      expect(quarters).toStrictEqual([
        { low: { latitude: 40, longitude: 10 }, high: { latitude: 41, longitude: 12 } },
        { low: { latitude: 40, longitude: 12 }, high: { latitude: 41, longitude: 14 } },
        { low: { latitude: 41, longitude: 10 }, high: { latitude: 42, longitude: 12 } },
        { low: { latitude: 41, longitude: 12 }, high: { latitude: 42, longitude: 14 } },
      ]);
    });
  });

  describe('Scraped places split', () => {
    const rows = [
      { placeId: 'a', hasWebsite: true },
      { placeId: 'b', hasWebsite: false },
      { placeId: 'c', hasWebsite: false },
      { placeId: 'd', hasWebsite: false },
    ];

    it('keeps businesses the filter drops in reserve', () => {
      const split = splitScrapedPlaces({ rows, filter: 'without', missing: 5 });

      expect(split.wanted.map((row) => row.placeId)).toStrictEqual(['b', 'c', 'd']);
      expect(split.reserve.map((row) => row.placeId)).toStrictEqual(['a']);
    });

    it('keeps businesses beyond the missing leads in reserve', () => {
      const split = splitScrapedPlaces({ rows, filter: 'any', missing: 2 });

      expect(split.wanted.map((row) => row.placeId)).toStrictEqual(['a', 'b']);
      expect(split.reserve.map((row) => row.placeId)).toStrictEqual(['c', 'd']);
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
      description: 'Studio commercialista specializzato in partite IVA e piccole imprese.',
      city: 'Bergamo',
      address: 'Via Roma 1',
      hasWebsite: false,
      rating: 4.6,
      reviewsCount: null,
    };

    const search = {
      name: 'Bergamo',
      searchTerms: ['commercialista'],
      locationPlaceId:
        ITALIAN_PROVINCES.find((province) => province.code === 'BG')?.placeId ?? null,
    };

    it('uses headers the column mapper recognises', () => {
      const csv = toLeadCsv({ search, leads: [lead] });

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
      const [row] = toLeadCsv({ search, leads: [lead] }).rows;

      expect(row).toMatchObject({
        'Has own website': 'no',
        Role: 'Titolare',
        'Google reviews': '',
      });
    });

    it('adds the profession, province and region of a province search', () => {
      const [row] = toLeadCsv({ search, leads: [lead] }).rows;

      expect(row).toMatchObject({
        Category: 'Commercialista',
        Profession: 'commercialista',
        Province: 'Bergamo',
        Region: 'Lombardia',
      });
    });

    it('leaves province and region empty for a search outside a province', () => {
      const [row] = toLeadCsv({
        search: { ...search, searchTerms: ['idraulico', 'elettricista'], locationPlaceId: 'town' },
        leads: [lead],
      }).rows;

      expect(row).toMatchObject({
        Profession: 'idraulico, elettricista',
        Province: '',
        Region: '',
      });
    });

    it('passes the business description to the copywriter as extra context', () => {
      const csv = toLeadCsv({ search, leads: [lead] });

      expect(csv.rows[0]).toMatchObject({
        'Business description':
          'Studio commercialista specializzato in partite IVA e piccole imprese.',
      });
      expect(Object.values(autoDetectMapping(csv.headers))).not.toContain('Business description');
    });
  });

  describe('Enrichment from lead research', () => {
    const research = {
      decision_maker_found: true,
      first_name: 'Mario',
      last_name: 'Rossi',
      role: 'Titolare',
      linkedin_url: '',
      public_email: 'mario@gmail.com',
      public_email_source: 'https://facebook.com/studiorossi',
      business_phone: '',
      business_description: 'Studio commercialista specializzato in partite IVA.',
      recent_activity: 'Ha aperto una seconda sede a Seriate',
      personalization_hooks: 'Seconda sede a Seriate; consulenze per startup',
      confidence: 'high',
      reasoning: 'Nome e indirizzo coincidono con il registro imprese',
    };

    const lead = {
      research,
      company: 'Studio Rossi',
      description: 'Studio commercialista specializzato in partite IVA.',
      category: 'Commercialista',
      city: 'Bergamo',
      firstName: 'Mario',
      lastName: 'Rossi',
      role: 'Titolare',
      linkedinUrl: null,
    };

    it('maps the decision maker research onto the campaign research', () => {
      expect(toEnrichmentContent(lead)).toStrictEqual({
        person_found: true,
        identity_match_confidence: 'high',
        identity_match_reasoning: 'Nome e indirizzo coincidono con il registro imprese',
        full_name: 'Mario Rossi',
        current_role: 'Titolare',
        current_company: 'Studio Rossi',
        company_description: 'Studio commercialista specializzato in partite IVA.',
        company_industry: 'Commercialista',
        location: 'Bergamo',
        linkedin_url: '',
        recent_activity: 'Ha aperto una seconda sede a Seriate',
        personalization_hooks: 'Seconda sede a Seriate; consulenze per startup',
      });
    });

    it('leaves hooks empty for research made before they were asked for', () => {
      const { recent_activity: _activity, personalization_hooks: _hooks, ...older } = research;

      expect(toEnrichmentContent({ ...lead, research: older })).toMatchObject({
        recent_activity: '',
        personalization_hooks: '',
      });
    });

    it('returns null for research that does not parse', () => {
      expect(toEnrichmentContent({ ...lead, research: { raw: 'unexpected' } })).toBeNull();
    });
  });
});
