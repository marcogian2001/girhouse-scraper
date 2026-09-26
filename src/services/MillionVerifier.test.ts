import { describe, expect, it } from 'vitest';
import { toVerificationResult } from './MillionVerifier';

describe('MillionVerifier', () => {
  describe('Verification result', () => {
    it('treats an ok address as valid', () => {
      expect(toVerificationResult('ok')).toBe('valid');
    });

    it('keeps a catch-all domain apart', () => {
      expect(toVerificationResult('catch_all')).toBe('catch_all');
    });

    it('treats a disposable address as invalid', () => {
      expect(toVerificationResult('disposable')).toBe('invalid');
    });

    it('reports anything else as unknown', () => {
      expect(toVerificationResult('unverified')).toBe('unknown');
    });
  });
});
