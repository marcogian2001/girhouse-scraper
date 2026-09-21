import { describe, expect, it } from 'vitest';
import type { EnrichmentTarget } from './Parallel';
import { buildTaskInput } from './Parallel';

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
});
