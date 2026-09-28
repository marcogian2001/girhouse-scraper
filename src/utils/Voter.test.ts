import { describe, expect, it } from 'vitest';
import { getClientIp, hashVoter } from './Voter';

describe('Voter', () => {
  describe('Client IP', () => {
    it('takes the first forwarded address', () => {
      const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });

      expect(getClientIp(headers)).toBe('203.0.113.7');
    });

    it('falls back to the real IP header', () => {
      expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    });

    it('returns null without proxy headers', () => {
      expect(getClientIp(new Headers())).toBeNull();
    });
  });

  describe('Voter hash', () => {
    it('differs between polls for the same address', () => {
      const ip = '203.0.113.7';

      expect(hashVoter({ pollId: 'one', ip })).not.toBe(hashVoter({ pollId: 'two', ip }));
    });
  });
});
