import { describe, expect, it } from 'vitest';
import { pollDelaySeconds, retryDelaySeconds } from './JobQueue';

describe('JobQueue', () => {
  describe('Retry backoff', () => {
    it('doubles the wait on each failed attempt', () => {
      expect([1, 2, 3].map(retryDelaySeconds)).toStrictEqual([20, 40, 80]);
    });

    it('caps the wait at five minutes', () => {
      expect(retryDelaySeconds(10)).toBe(300);
    });

    it('treats a first attempt as the base delay', () => {
      expect(retryDelaySeconds(0)).toBe(20);
    });
  });

  describe('Poll backoff', () => {
    it('polls often while a run is young', () => {
      expect(pollDelaySeconds(0)).toBe(15);
    });

    it('slows down once a run passes a minute', () => {
      expect(pollDelaySeconds(90_000)).toBe(30);
    });

    it('settles at a minute for long-running research', () => {
      expect(pollDelaySeconds(10 * 60_000)).toBe(60);
    });
  });
});
