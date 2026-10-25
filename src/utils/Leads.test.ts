import { describe, expect, it } from 'vitest';
import { autoDetectMapping } from './Csv';
import { ITALIAN_PROVINCES } from './ItalianProvinces';
import { ITALIAN_REGION_PLACE_IDS } from './ItalianRegions';
import {
  countLeadsToTake,
  deriveFamilyStatus,
  estimateEmailYield,
  isPecEmail,
  matchesWebsiteFilter,
  nextEmailRoute,
  pickEmailRoutes,
  readPublicEmail,
  scrapeBudget,
  splitEvenly,
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

    it('rejects a PEC address', () => {
      expect(readPublicEmail('mocciasimone@pec.it')).toBeNull();
      expect(readPublicEmail('fabrizi.moreno@legalmail.it')).toBeNull();
      expect(readPublicEmail('studio@pec.aruba.it')).toBeNull();
      expect(readPublicEmail('rossi@arubapec.it')).toBeNull();
    });

    it('rejects a booking platform address', () => {
      expect(readPublicEmail('contatto@miodottore.it')).toBeNull();
    });

    it('picks the first ordinary address out of several', () => {
      expect(readPublicEmail('rossi@pec.it; Info@StudioRossi.it, altro@gmail.com')).toBe(
        'info@studiorossi.it',
      );
    });
  });

  describe('PEC address', () => {
    it('recognises certified email domains', () => {
      expect(isPecEmail('a@pec.it')).toBeTruthy();
      expect(isPecEmail('a@cert.legalmail.it')).toBeTruthy();
      expect(isPecEmail('a@registerpec.it')).toBeTruthy();
      expect(isPecEmail('a@postacert.inps.gov.it')).toBeTruthy();
    });

    it('accepts ordinary domains', () => {
      expect(isPecEmail('a@gmail.com')).toBeFalsy();
      expect(isPecEmail('a@specialisti.it')).toBeFalsy();
    });
  });

  describe('Email routes', () => {
    const named = { domain: 'studiorossi.it', firstName: 'Mario', lastName: 'Rossi' };

    it('tries every route for a named person at a readable domain', () => {
      expect(
        pickEmailRoutes({ lead: named, publicEmail: 'info@studiorossi.it', readableWebsite: true }),
      ).toStrictEqual({ prospeo: true, public: true, website: true, guessed: true });
    });

    it('skips Prospeo and guessing for a business without a website', () => {
      const routes = pickEmailRoutes({
        lead: { ...named, domain: null },
        publicEmail: 'mario.rossi@gmail.com',
        readableWebsite: false,
      });

      expect(routes).toStrictEqual({
        prospeo: false,
        public: true,
        website: false,
        guessed: false,
      });
    });

    it('reads a page builder listed by a business without a domain', () => {
      const routes = pickEmailRoutes({
        lead: { ...named, domain: null },
        publicEmail: null,
        readableWebsite: true,
      });

      expect(routes.website).toBeTruthy();
      expect(routes.guessed).toBeFalsy();
    });

    it('skips every domain route for a profile on a booking platform', () => {
      const routes = pickEmailRoutes({
        lead: { ...named, domain: 'miodottore.it' },
        publicEmail: null,
        readableWebsite: true,
      });

      expect(routes).toStrictEqual({
        prospeo: false,
        public: false,
        website: false,
        guessed: false,
      });
    });

    it('skips Prospeo without a decision maker name', () => {
      const routes = pickEmailRoutes({
        lead: { ...named, lastName: null },
        publicEmail: null,
        readableWebsite: true,
      });

      expect(routes.prospeo).toBeFalsy();
      expect(routes.guessed).toBeTruthy();
    });
  });

  describe('Next email route', () => {
    const routes = { prospeo: false, public: true, website: true, guessed: true };

    it('starts with the first available route', () => {
      expect(nextEmailRoute({ routes, attempts: [] })).toBe('public');
    });

    it('skips routes already tried', () => {
      const attempts = [
        { source: 'public' as const, email: 'a@gmail.com', verdict: 'unknown' as const },
        { source: 'website' as const, email: null, verdict: 'not_found' as const },
      ];

      expect(nextEmailRoute({ routes, attempts })).toBe('guessed');
    });

    it('returns null once every route was tried', () => {
      const attempts = [
        { source: 'public' as const, email: 'a@gmail.com', verdict: 'invalid' as const },
        { source: 'website' as const, email: null, verdict: 'not_found' as const },
        { source: 'guessed' as const, email: 'info@rossi.it', verdict: 'invalid' as const },
      ];

      expect(nextEmailRoute({ routes, attempts })).toBeNull();
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

  describe('Email yield', () => {
    const none = { ready: 0, settled: 0 };

    it('assumes half the leads get an email without any history', () => {
      expect(estimateEmailYield({ search: none, organization: none })).toBe(0.5);
    });

    it('starts from the organization history', () => {
      const organization = { ready: 300, settled: 1000 };

      expect(estimateEmailYield({ search: none, organization })).toBeCloseTo(0.304, 3);
    });

    it('follows the search outcomes once many leads settled', () => {
      const search = { ready: 720, settled: 900 };

      expect(estimateEmailYield({ search, organization: none })).toBeCloseTo(0.793, 3);
    });

    it('never assumes fewer than one email every five leads', () => {
      const search = { ready: 0, settled: 500 };

      expect(estimateEmailYield({ search, organization: search })).toBe(0.2);
    });
  });

  describe('Leads to take', () => {
    it('takes enough leads to reach the target at the expected yield', () => {
      expect(countLeadsToTake({ target: 500, ready: 0, pending: 0, emailYield: 0.5 })).toBe(1000);
    });

    it('counts the pending leads toward the target', () => {
      expect(countLeadsToTake({ target: 500, ready: 200, pending: 400, emailYield: 0.5 })).toBe(
        200,
      );
    });

    it('takes nothing once the pending leads cover the target', () => {
      expect(countLeadsToTake({ target: 500, ready: 300, pending: 500, emailYield: 0.5 })).toBe(0);
    });

    it('takes nothing once the target is reached', () => {
      expect(countLeadsToTake({ target: 500, ready: 520, pending: 0, emailYield: 0.5 })).toBe(0);
    });
  });

  describe('Even split', () => {
    it('gives every region the same share when the total divides', () => {
      expect(splitEvenly(100, 10)).toStrictEqual(Array.from({ length: 10 }, () => 10));
    });

    it('gives the first regions one more lead when the total does not divide', () => {
      expect(splitEvenly(100, 3)).toStrictEqual([34, 33, 33]);
    });
  });

  describe('Family status', () => {
    it('stays searching while any region is searching', () => {
      expect(deriveFamilyStatus(['done', 'searching', 'qualifying'])).toBe('searching');
    });

    it('stays qualifying while any region is qualifying', () => {
      expect(deriveFamilyStatus(['done', 'qualifying', 'failed'])).toBe('qualifying');
    });

    it('turns done once every region settled, even when some failed', () => {
      expect(deriveFamilyStatus(['done', 'failed'])).toBe('done');
    });

    it('turns failed only when every region failed', () => {
      expect(deriveFamilyStatus(['failed', 'failed'])).toBe('failed');
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

    it('keeps one lead per email when a business is listed several times', () => {
      const csv = toLeadCsv({
        search,
        leads: [lead, { ...lead, company: 'Studio Rossi Bergamo' }, { ...lead, email: null }],
      });

      expect(csv.rows.map((row) => row.Company)).toStrictEqual(['Studio Rossi', 'Studio Rossi']);
      expect(csv.rows.map((row) => row.Email)).toStrictEqual(['mario@gmail.com', '']);
    });

    it('passes the business description to the copywriter as extra context', () => {
      const csv = toLeadCsv({ search, leads: [lead] });

      expect(csv.rows[0]).toMatchObject({
        'Business description':
          'Studio commercialista specializzato in partite IVA e piccole imprese.',
      });
      expect(Object.values(autoDetectMapping(csv.headers))).not.toContain('Business description');
    });

    it('fills the region of each lead found by a search split by region', () => {
      const csv = toLeadCsv({
        search: { ...search, locationPlaceId: null },
        leads: [
          { ...lead, areaPlaceId: ITALIAN_REGION_PLACE_IDS.Lombardia },
          { ...lead, email: 'anna@gmail.com', areaPlaceId: ITALIAN_REGION_PLACE_IDS.Lazio },
        ],
      });

      expect(csv.rows.map((row) => row.Region)).toStrictEqual(['Lombardia', 'Lazio']);
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
