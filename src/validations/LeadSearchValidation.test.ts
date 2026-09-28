import { describe, expect, it } from 'vitest';
import { DecisionMakerValidation } from './LeadSearchValidation';

describe('Lead search validation', () => {
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
