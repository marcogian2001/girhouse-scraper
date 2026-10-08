import { describe, expect, it } from 'vitest';
import { DecisionMakerValidation, LeadSearchValidation } from './LeadSearchValidation';

describe('Lead search validation', () => {
  const search = {
    name: 'Test',
    searchTerms: ['Test'],
    location: 'Test',
    locationPlaceId: 'area',
    maxResults: 1,
  };

  it('preserves searches without a category filter', () => {
    expect(LeadSearchValidation.parse(search).allowedCategories).toStrictEqual([]);
  });

  it('normalises and deduplicates allowed categories', () => {
    expect(
      LeadSearchValidation.parse({
        ...search,
        allowedCategories: ['  Centro   ESTETICO ', 'centro estetico'],
      }).allowedCategories,
    ).toStrictEqual(['centro estetico']);
  });

  it('rejects empty categories and excessive lists', () => {
    for (const allowedCategories of [
      [' '],
      ['x'.repeat(121)],
      Array.from({ length: 21 }, () => 'Estetista'),
    ]) {
      expect(LeadSearchValidation.safeParse({ ...search, allowedCategories }).success).toBeFalsy();
    }
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
