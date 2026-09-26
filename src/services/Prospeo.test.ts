import { describe, expect, it } from 'vitest';
import { parseEnrichResponse } from './Prospeo';

describe('Prospeo', () => {
  describe('Enrich response', () => {
    it('returns a verified email as billed', () => {
      const match = parseEnrichResponse({
        error: false,
        free_enrichment: false,
        person: { email: { status: 'VERIFIED', email: 'Mario.Rossi@StudioRossi.it' } },
      });

      expect(match).toStrictEqual({ email: 'mario.rossi@studiorossi.it', charged: true });
    });

    it('marks a repeat enrichment as free', () => {
      const match = parseEnrichResponse({
        error: false,
        free_enrichment: true,
        person: { email: { status: 'VERIFIED', email: 'mario@studiorossi.it' } },
      });

      expect(match?.charged).toBeFalsy();
    });

    it('returns null when no person matched', () => {
      expect(parseEnrichResponse({ error: true, error_code: 'NO_MATCH' })).toBeNull();
    });

    it('returns null for an unverified email', () => {
      const match = parseEnrichResponse({
        error: false,
        person: { email: { status: 'UNVERIFIED', email: 'mario@studiorossi.it' } },
      });

      expect(match).toBeNull();
    });

    it('throws on any other error', () => {
      expect(() =>
        parseEnrichResponse({ error: true, error_code: 'INSUFFICIENT_CREDITS' }),
      ).toThrow('INSUFFICIENT_CREDITS');
    });
  });
});
