import { describe, expect, it } from 'vitest';
import { followUpDueAt, mentionsDemo, nextAction } from './FollowUps';

const base = {
  state: 'demo_sent' as const,
  followUpCount: 0,
  demo: { behavior: 'not_opened' as const, maxStep: 0, booked: false },
};

const hours = { startHour: 9, endHour: 18 };

describe('Follow-ups', () => {
  describe('Behaviour on the demo', () => {
    it('asks whether the link arrived when the demo was never opened', () => {
      expect(nextAction(base)).toStrictEqual({
        type: 'email',
        kind: 'demo_not_opened',
        isLast: false,
      });
    });

    it('points to the first step not seen when the demo was left halfway', () => {
      expect(
        nextAction({
          ...base,
          state: 'demo_viewed',
          demo: { behavior: 'partial', maxStep: 3, booked: false },
        }),
      ).toStrictEqual({ type: 'email', kind: 'demo_partial', step: 4, isLast: false });
    });

    it('asks what held the lead back after the whole demo', () => {
      expect(
        nextAction({ ...base, demo: { behavior: 'complete', maxStep: 6, booked: false } }),
      ).toStrictEqual({ type: 'email', kind: 'demo_complete', isLast: false });
    });
  });

  describe('End of the sequence', () => {
    it('marks the second follow-up as the last one', () => {
      expect(nextAction({ ...base, state: 'follow_up', followUpCount: 1 })).toStrictEqual({
        type: 'email',
        kind: 'demo_not_opened',
        isLast: true,
      });
    });

    it('stops after two follow-ups', () => {
      expect(nextAction({ ...base, state: 'follow_up', followUpCount: 2 })).toStrictEqual({
        type: 'none',
      });
    });
  });

  describe('Nothing to do', () => {
    it('leaves a lead without a demo alone', () => {
      expect(nextAction({ ...base, demo: null })).toStrictEqual({ type: 'none' });
    });

    it('leaves a booked lead alone', () => {
      expect(
        nextAction({ ...base, demo: { behavior: 'complete', maxStep: 6, booked: true } }),
      ).toStrictEqual({ type: 'none' });
    });

    it('leaves a conversation outside the sequence alone', () => {
      expect(nextAction({ ...base, state: 'call_booked' })).toStrictEqual({ type: 'none' });
    });
  });

  describe('Due time', () => {
    it('falls a day after the email inside business hours', () => {
      expect(followUpDueAt({ from: new Date('2026-11-05T10:30:00Z'), hours }).toISOString()).toBe(
        '2026-11-06T10:30:00.000Z',
      );
    });

    it('falls on a Saturday too', () => {
      expect(followUpDueAt({ from: new Date('2026-11-06T10:30:00Z'), hours }).toISOString()).toBe(
        '2026-11-07T10:30:00.000Z',
      );
    });

    it('moves an evening email to the opening after the next day', () => {
      expect(followUpDueAt({ from: new Date('2026-11-05T20:00:00Z'), hours }).toISOString()).toBe(
        '2026-11-07T08:00:00.000Z',
      );
    });
  });

  describe('Demo link', () => {
    it('finds the link pasted by hand with a query', () => {
      expect(
        mentionsDemo('Eccola:\nhttps://app.girhouse.com/it/demo/da-mario?passo=2', 'da-mario'),
      ).toBeTruthy();
    });

    it('ignores the link to a longer slug', () => {
      expect(
        mentionsDemo('https://app.girhouse.com/it/demo/da-mario-roma', 'da-mario'),
      ).toBeFalsy();
    });
  });
});
