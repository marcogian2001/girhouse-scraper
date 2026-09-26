import { describe, expect, it } from 'vitest';
import type { DecisionMakerTarget, EnrichmentTarget } from './Parallel';
import { buildDecisionMakerInput, buildTaskInput, PROCESSOR_RUN_COST_MICROS } from './Parallel';

const target = (overrides: Partial<EnrichmentTarget> = {}): EnrichmentTarget => ({
  email: 'ada@analytical.com',
  firstName: null,
  lastName: null,
  phone: null,
  company: null,
  website: null,
  linkedinUrl: null,
  extra: {},
  ...overrides,
});

const business = (overrides: Partial<DecisionMakerTarget> = {}): DecisionMakerTarget => ({
  company: 'Studio Rossi',
  website: null,
  hasWebsite: false,
  phone: '035 123456',
  address: 'Via Roma 1, Bergamo',
  city: 'Bergamo',
  category: 'Commercialista',
  ...overrides,
});

describe('Parallel', () => {
  describe('Task input', () => {
    it('derives the email domain as the employer signal', () => {
      expect(buildTaskInput(target())).toContain('analytical.com');
    });

    it('omits fields the CSV did not provide', () => {
      const input = buildTaskInput(target({ firstName: 'Ada' }));

      expect(input).toContain('- First name: Ada');
      expect(input).not.toContain('Last name');
      expect(input).not.toContain('LinkedIn');
    });

    it('includes unmapped CSV columns', () => {
      const input = buildTaskInput(target({ extra: { Segment: 'SMB' } }));

      expect(input).toContain('- Segment: SMB');
    });

    it('asks for a low confidence when the name is the only link', () => {
      expect(buildTaskInput(target())).toContain('identity_match_confidence');
    });
  });

  describe('Decision maker input', () => {
    it('starts from the website when the business has one', () => {
      const input = buildDecisionMakerInput(
        business({ website: 'https://studiorossi.it', hasWebsite: true }),
      );

      expect(input).toContain('- Website: https://studiorossi.it');
      expect(input).toContain('Start from the website');
    });

    it('relies on social pages when the business has no website', () => {
      const input = buildDecisionMakerInput(
        business({ website: 'https://facebook.com/studiorossi' }),
      );

      expect(input).toContain('- Page listed as website: https://facebook.com/studiorossi');
      expect(input).toContain('has no website of its own');
    });

    it('forbids constructing an email address', () => {
      expect(buildDecisionMakerInput(business())).toContain('Never guess or construct an address');
    });
  });

  describe('Run cost', () => {
    it('prices each processor at its list rate per run', () => {
      // $5, $10, $25 and $100 per thousand runs
      expect(PROCESSOR_RUN_COST_MICROS).toStrictEqual({
        lite: 5000,
        base: 10_000,
        core: 25_000,
        pro: 100_000,
      });
    });
  });
});
