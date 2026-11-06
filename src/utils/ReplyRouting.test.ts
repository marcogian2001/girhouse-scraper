import { describe, expect, it } from 'vitest';
import { decideState, entersPipeline, needsAnswer, parseReturnDate } from './ReplyRouting';

const decision = (overrides: Partial<Parameters<typeof decideState>[0]> = {}) =>
  decideState({
    category: 'interested',
    confidence: 0.9,
    threshold: 0.75,
    hasReferral: false,
    ...overrides,
  });

describe('ReplyRouting', () => {
  describe('Next state', () => {
    it('stops on a stop reply even with low confidence', () => {
      expect(decision({ category: 'stop', confidence: 0.2 })).toBe('stop');
    });

    it('sends a low-confidence reply to manual review', () => {
      expect(decision({ confidence: 0.5 })).toBe('manual_review');
    });

    it('sends an unclassifiable reply to manual review', () => {
      expect(decision({ category: 'other' })).toBe('manual_review');
    });

    it('closes the lead on a first negative reply', () => {
      expect(decision({ category: 'not_interested' })).toBe('closed_not_interested');
    });

    it('sends a low-confidence negative reply to manual review', () => {
      expect(decision({ category: 'not_interested', confidence: 0.5 })).toBe('manual_review');
    });

    it('marks an out-of-office reply', () => {
      expect(decision({ category: 'out_of_office' })).toBe('out_of_office');
    });

    it('marks an automatic reply without sending it to review', () => {
      expect(decision({ category: 'auto_reply' })).toBe('auto_reply');
    });

    it('closes a wrong person without a referral', () => {
      expect(decision({ category: 'wrong_person' })).toBe('wrong_person');
    });

    it('reviews a wrong person with a referral', () => {
      expect(decision({ category: 'wrong_person', hasReferral: true })).toBe('manual_review');
    });

    it('classifies a confident interested reply', () => {
      expect(decision()).toBe('classified');
    });
  });

  describe('Answer', () => {
    it('answers a classified question', () => {
      expect(
        needsAnswer({ category: 'question', state: 'classified', hasReferral: false }),
      ).toBeTruthy();
    });

    it('drafts an answer for a reply in manual review', () => {
      expect(
        needsAnswer({ category: 'question', state: 'manual_review', hasReferral: false }),
      ).toBeTruthy();
    });

    it('never answers a stop, an out-of-office or an automatic reply', () => {
      expect(needsAnswer({ category: 'stop', state: 'stop', hasReferral: false })).toBeFalsy();
      expect(
        needsAnswer({ category: 'out_of_office', state: 'out_of_office', hasReferral: false }),
      ).toBeFalsy();
      expect(
        needsAnswer({ category: 'auto_reply', state: 'auto_reply', hasReferral: false }),
      ).toBeFalsy();
    });

    it('never answers a no or an old objection, even in manual review', () => {
      expect(
        needsAnswer({ category: 'not_interested', state: 'manual_review', hasReferral: false }),
      ).toBeFalsy();
      expect(
        needsAnswer({ category: 'objection', state: 'manual_review', hasReferral: false }),
      ).toBeFalsy();
    });

    it('thanks a wrong person only when they gave a referral', () => {
      expect(
        needsAnswer({ category: 'wrong_person', state: 'manual_review', hasReferral: true }),
      ).toBeTruthy();
      expect(
        needsAnswer({ category: 'wrong_person', state: 'wrong_person', hasReferral: false }),
      ).toBeFalsy();
    });
  });

  describe('Pipeline', () => {
    it('puts positive and open replies in the pipeline', () => {
      expect(entersPipeline('interested')).toBeTruthy();
      expect(entersPipeline('question')).toBeTruthy();
      expect(entersPipeline('not_now')).toBeTruthy();
    });

    it('keeps negative and automatic replies out of the pipeline', () => {
      expect(entersPipeline('objection')).toBeFalsy();
      expect(entersPipeline('not_interested')).toBeFalsy();
      expect(entersPipeline('stop')).toBeFalsy();
      expect(entersPipeline('auto_reply')).toBeFalsy();
      expect(entersPipeline('out_of_office')).toBeFalsy();
    });
  });

  describe('Return date', () => {
    it('parses an ISO date', () => {
      expect(parseReturnDate('2026-10-20')?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    });

    it('rejects other formats', () => {
      expect(parseReturnDate('20/10/2026')).toBeNull();
      expect(parseReturnDate(null)).toBeNull();
    });
  });
});
