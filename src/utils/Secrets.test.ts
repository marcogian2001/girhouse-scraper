import { describe, expect, it } from 'vitest';
import { safeEqual, sha256Hex } from './Secrets';

describe('Secrets', () => {
  describe('Secret comparison', () => {
    it('accepts the expected secret', () => {
      expect(safeEqual('a-long-shared-secret', 'a-long-shared-secret')).toBeTruthy();
    });

    it('rejects a different secret of the same length', () => {
      expect(safeEqual('a-long-shared-secreT', 'a-long-shared-secret')).toBeFalsy();
    });

    it('rejects a secret of another length', () => {
      expect(safeEqual('short', 'a-long-shared-secret')).toBeFalsy();
    });
  });

  describe('Hashing', () => {
    it('returns the same digest for the same input', () => {
      expect(sha256Hex('reply')).toBe(sha256Hex('reply'));
      expect(sha256Hex('reply')).toHaveLength(64);
    });
  });
});
