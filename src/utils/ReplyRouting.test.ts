import { describe, expect, it } from 'vitest';
import { decideState, needsAnswer, parseReturnDate, toObjectionKey } from './ReplyRouting';

const decision = (overrides: Partial<Parameters<typeof decideState>[0]> = {}) =>
  decideState({
    category: 'interested',
    confidence: 0.9,
    threshold: 0.75,
    isNewObjection: false,
    hasReferral: false,
    negativeReplyCount: 0,
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

    it('sends a new objection to manual review', () => {
      expect(decision({ category: 'objection', isNewObjection: true })).toBe('manual_review');
    });

    it('keeps a first negative reply open for one more email', () => {
      expect(decision({ category: 'not_interested' })).toBe('classified');
    });

    it('closes the lead on a second negative reply', () => {
      expect(decision({ category: 'not_interested', negativeReplyCount: 1 })).toBe(
        'closed_not_interested',
      );
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
        needsAnswer({ category: 'objection', state: 'manual_review', hasReferral: false }),
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

    it('does not answer a second no', () => {
      expect(
        needsAnswer({
          category: 'not_interested',
          state: 'closed_not_interested',
          hasReferral: false,
        }),
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

  describe('Return date', () => {
    it('parses an ISO date', () => {
      expect(parseReturnDate('2026-10-20')?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    });

    it('rejects other formats', () => {
      expect(parseReturnDate('20/10/2026')).toBeNull();
      expect(parseReturnDate(null)).toBeNull();
    });
  });

  describe('Objection key', () => {
    it('builds a snake_case key without accents', () => {
      expect(toObjectionKey('Ho già un sito!')).toBe('ho_gia_un_sito');
    });

    it('falls back when nothing is left', () => {
      expect(toObjectionKey('!!!')).toBe('obiezione');
    });
  });
});
