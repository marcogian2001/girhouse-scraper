import { describe, expect, it } from 'vitest';
import { DecisionMakerValidation, NewLeadSearchValidation } from './LeadSearchValidation';

const SEARCH = { name: 'Commercialisti', searchTerms: ['commercialista'], maxResults: 100 };

describe('Lead search validation', () => {
  describe('New search', () => {
    it('accepts a search in one place', () => {
      const parsed = NewLeadSearchValidation.safeParse({
        ...SEARCH,
        location: 'Milano',
        locationPlaceId: 'ChIJ53USP0nBhkcRjQ50xhPN_zw',
      });

      expect(parsed.success).toBeTruthy();
    });

    it('accepts a search split across regions', () => {
      const parsed = NewLeadSearchValidation.safeParse({
        ...SEARCH,
        regions: ['Lombardia', 'Lazio'],
      });

      expect(parsed.success).toBeTruthy();
    });

    it('rejects fewer leads than regions', () => {
      const parsed = NewLeadSearchValidation.safeParse({
        ...SEARCH,
        maxResults: 1,
        regions: ['Lombardia', 'Lazio'],
      });

      expect(parsed.success).toBeFalsy();
    });

    it('rejects a region picked twice', () => {
      const parsed = NewLeadSearchValidation.safeParse({
        ...SEARCH,
        regions: ['Lazio', 'Lazio'],
      });

      expect(parsed.success).toBeFalsy();
    });
  });

  describe('Decision maker research', () => {
    it('defaults the phone and description of runs started before they were asked for', () => {
      const parsed = DecisionMakerValidation.parse({
        decision_maker_found: true,
        first_name: 'Mario',
        last_name: 'Rossi',
        role: 'Titolare',
        linkedin_url: '',
        public_email: 'mario@gmail.com',
        public_email_source: '',
        confidence: 'high',
        reasoning: 'Named on the Facebook page.',
      });

      expect(parsed).toMatchObject({ business_phone: '', business_description: '' });
    });
  });
});
