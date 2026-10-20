import { describe, expect, it } from 'vitest';
import { nextAction } from './FollowUps';

const base = {
  state: 'demo_sent' as const,
  followUpCount: 0,
  nurturingCount: 0,
  demo: { behavior: 'not_opened' as const, maxStep: 0, booked: false },
  maxFollowUps: 3,
  nurturingMaxCount: 3,
  whatsappEligible: true,
};

describe('Follow-ups', () => {
  describe('Behaviour on the demo', () => {
    it('asks whether the link arrived when the demo was never opened', () => {
      expect(nextAction(base)).toStrictEqual({ type: 'email', kind: 'demo_not_opened' });
    });

    it('points to the first step not seen when the demo was left halfway', () => {
      expect(
        nextAction({
          ...base,
          state: 'demo_viewed',
          demo: { behavior: 'partial', maxStep: 3, booked: false },
        }),
      ).toStrictEqual({ type: 'email', kind: 'demo_partial', step: 4 });
    });

    it('asks what held the lead back after the whole demo', () => {
      expect(
        nextAction({
          ...base,
          state: 'follow_up',
          followUpCount: 2,
          demo: { behavior: 'complete', maxStep: 6, booked: false },
        }),
      ).toStrictEqual({ type: 'email', kind: 'demo_complete' });
    });
  });

  describe('End of the sequence', () => {
    it('sends the closing email after the last follow-up', () => {
      expect(nextAction({ ...base, state: 'follow_up', followUpCount: 3 })).toStrictEqual({
        type: 'email',
        kind: 'closing',
      });
    });

    it('waits for WhatsApp when the lead said yes and has a mobile number', () => {
      expect(nextAction({ ...base, state: 'follow_up', followUpCount: 4 })).toStrictEqual({
        type: 'whatsapp_pending',
      });
    });

    it('closes when WhatsApp is not an option', () => {
      expect(
        nextAction({ ...base, state: 'follow_up', followUpCount: 4, whatsappEligible: false }),
      ).toStrictEqual({ type: 'close' });
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

  describe('Nurturing', () => {
    it('sends a reminder until the limit', () => {
      expect(nextAction({ ...base, state: 'nurturing', nurturingCount: 2 })).toStrictEqual({
        type: 'email',
        kind: 'nurturing',
      });
    });

    it('closes after the last reminder', () => {
      expect(nextAction({ ...base, state: 'nurturing', nurturingCount: 3 })).toStrictEqual({
        type: 'close',
      });
    });
  });
});
