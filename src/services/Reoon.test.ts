import { describe, expect, it } from 'vitest';
import { toReoonVerdict } from './Reoon';

describe('Reoon', () => {
  describe('Verdict', () => {
    it('treats a safe address as valid', () => {
      expect(toReoonVerdict({ status: 'safe' })).toBe('valid');
    });

    it('accepts a role account only when it delivers', () => {
      expect(toReoonVerdict({ status: 'role_account', is_deliverable: true })).toBe('valid');
      expect(toReoonVerdict({ status: 'role_account', is_deliverable: false })).toBe('unknown');
    });

    it('keeps a catch-all domain apart', () => {
      expect(toReoonVerdict({ status: 'catch_all' })).toBe('catch_all');
    });

    it('treats disabled, full and trap addresses as invalid', () => {
      expect(toReoonVerdict({ status: 'disabled' })).toBe('invalid');
      expect(toReoonVerdict({ status: 'inbox_full' })).toBe('invalid');
      expect(toReoonVerdict({ status: 'spamtrap' })).toBe('invalid');
    });

    it('reports an unsettled address as unknown', () => {
      expect(toReoonVerdict({ status: 'unknown' })).toBe('unknown');
    });
  });
});
