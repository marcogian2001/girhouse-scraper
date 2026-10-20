import { describe, expect, it } from 'vitest';
import { isItalianMobile, toE164 } from './Phone';

describe('Phone', () => {
  describe('E.164 normalisation', () => {
    it('adds the Italian prefix to a mobile', () => {
      expect(toE164('333 123 4567')).toBe('+393331234567');
    });

    it('keeps the leading zero of a landline', () => {
      expect(toE164('02 1234 5678')).toBe('+390212345678');
    });

    it('converts a 00 prefix', () => {
      expect(toE164('0039 333-1234567')).toBe('+393331234567');
    });

    it('keeps a foreign number as written', () => {
      expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
    });

    it('returns null for text that is not a number', () => {
      expect(toE164('chiamatemi')).toBeNull();
      expect(toE164(null)).toBeNull();
    });
  });

  describe('Italian mobile', () => {
    it('accepts a mobile and rejects a landline', () => {
      expect(isItalianMobile('+393331234567')).toBeTruthy();
      expect(isItalianMobile('+390212345678')).toBeFalsy();
    });
  });
});
