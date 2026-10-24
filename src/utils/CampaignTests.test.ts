import { describe, expect, it } from 'vitest';
import type { LeadFacts, PlatformFacts } from './CampaignTests';
import { buildCampaignTest, mergeLeadFacts, resolveTargeting } from './CampaignTests';

const lead = (overrides: Partial<LeadFacts>): LeadFacts => ({
  replied: true,
  positive: false,
  repliedStep: null,
  demoCompleted: false,
  booked: false,
  noShow: false,
  rescheduled: false,
  won: false,
  wonValue: 0,
  ...overrides,
});

const platform = (overrides: Partial<PlatformFacts>): PlatformFacts => ({
  categories: [],
  demoCompleted: false,
  booked: false,
  ...overrides,
});

describe('Campaign tests', () => {
  describe(mergeLeadFacts, () => {
    it('counts an old reply only Instantly saw', () => {
      expect(
        mergeLeadFacts({
          platform: null,
          instantly: { repliedStep: 2, interestStatus: 1 },
          outcome: null,
        }),
      ).toMatchObject({ replied: true, positive: true, repliedStep: 2, booked: false });
    });

    it('leaves out an out of office Instantly saw', () => {
      expect(
        mergeLeadFacts({
          platform: null,
          instantly: { repliedStep: 1, interestStatus: 0 },
          outcome: null,
        }),
      ).toMatchObject({ replied: false, repliedStep: null });
    });

    it('trusts the platform on autoresponders', () => {
      expect(
        mergeLeadFacts({
          platform: platform({ categories: ['auto_reply'] }),
          instantly: { repliedStep: 1, interestStatus: null },
          outcome: null,
        }).replied,
      ).toBeFalsy();
    });

    it('follows the Instantly label over an earlier yes', () => {
      expect(
        mergeLeadFacts({
          platform: platform({ categories: ['interested', 'not_now'] }),
          instantly: { repliedStep: 1, interestStatus: -1 },
          outcome: null,
        }).positive,
      ).toBeFalsy();
    });

    it('counts a booked objection as a positive reply', () => {
      expect(
        mergeLeadFacts({
          platform: platform({ categories: ['objection'], booked: true }),
          instantly: null,
          outcome: null,
        }),
      ).toMatchObject({ positive: true, booked: true });
    });

    it('counts a no show as a booked call', () => {
      expect(
        mergeLeadFacts({
          platform: null,
          instantly: { repliedStep: 1, interestStatus: -4 },
          outcome: null,
        }),
      ).toMatchObject({ booked: true, noShow: true });
    });

    it('counts a sale of a lead who never replied by email', () => {
      expect(
        mergeLeadFacts({
          platform: null,
          instantly: null,
          outcome: {
            callBooked: false,
            noShow: false,
            rescheduled: false,
            won: true,
            wonValue: 97,
          },
        }),
      ).toMatchObject({ replied: false, booked: true, won: true, wonValue: 97 });
    });

    it('counts a call booked again after a no show as rescheduled', () => {
      expect(
        mergeLeadFacts({
          platform: null,
          instantly: null,
          outcome: {
            callBooked: true,
            noShow: true,
            rescheduled: true,
            won: false,
            wonValue: null,
          },
        }),
      ).toMatchObject({ booked: true, noShow: true, rescheduled: true });
    });

    it('leaves out a reschedule without a no show', () => {
      expect(
        mergeLeadFacts({
          platform: null,
          instantly: null,
          outcome: {
            callBooked: true,
            noShow: false,
            rescheduled: true,
            won: false,
            wonValue: null,
          },
        }).rescheduled,
      ).toBeFalsy();
    });
  });

  describe(buildCampaignTest, () => {
    const test = buildCampaignTest({
      contacted: 100,
      replied: 8,
      costMicros: 30_000_000,
      leads: [
        lead({
          positive: true,
          repliedStep: 1,
          demoCompleted: true,
          booked: true,
          won: true,
          wonValue: 97,
        }),
        lead({ positive: true, repliedStep: 2, booked: true, noShow: true, rescheduled: true }),
        lead({ positive: true, repliedStep: 2 }),
        lead({ repliedStep: 3 }),
        lead({ replied: false, booked: true }),
      ],
    });

    const step = (name: string) => test.steps.find((item) => item.step === name);

    it('takes the replies from Instantly', () => {
      expect(step('replied')).toStrictEqual({
        step: 'replied',
        count: 8,
        ofContacted: 0.08,
        ofBase: 0.08,
      });
    });

    it('shares the positive replies on the replies', () => {
      expect(step('positive')?.ofBase).toBe(3 / 8);
    });

    it('shares no shows and sales on the calls', () => {
      expect(step('no_show')?.ofBase).toBe(1 / 3);
      expect(step('won')?.ofBase).toBe(1 / 3);
    });

    it('counts a rescheduled lead once in the calls and shares it on the no shows', () => {
      expect(step('booked')?.count).toBe(3);
      expect(step('rescheduled')).toMatchObject({ count: 1, ofBase: 1 });
    });

    it('splits the replies by email of the sequence', () => {
      expect(test.repliesByEmail).toStrictEqual([
        { email: 1, count: 1, share: 0.25 },
        { email: 2, count: 2, share: 0.5 },
        { email: 3, count: 1, share: 0.25 },
      ]);
    });

    it('divides the cost by positive replies, calls and sales', () => {
      expect(test.costPerPositiveMicros).toBe(10_000_000);
      expect(test.costPerCallMicros).toBe(10_000_000);
      expect(test.costPerWonMicros).toBe(30_000_000);
      expect(test.wonValue).toBe(97);
    });

    it('counts the replied leads without Instantly totals', () => {
      const own = buildCampaignTest({
        contacted: 0,
        replied: null,
        costMicros: 0,
        leads: [lead({})],
      });

      expect(own.steps[0]?.count).toBe(1);
      expect(own.steps.every((item) => item.ofContacted === null)).toBeTruthy();
      expect(own.costPerCallMicros).toBeNull();
    });
  });

  describe(resolveTargeting, () => {
    const base = {
      name: 'idraulico · Roma · #1',
      target: null,
      zone: null,
      contactTarget: null,
      contactZone: null,
    };

    it('prefers what was typed by hand', () => {
      expect(
        resolveTargeting({ ...base, target: 'Idraulici senza sito', contactTarget: 'idraulico' }),
      ).toStrictEqual({ target: 'Idraulici senza sito', zone: 'Roma' });
    });

    it('reads the contacts before the name', () => {
      expect(
        resolveTargeting({ ...base, contactTarget: 'idraulico', contactZone: 'Milano' }),
      ).toStrictEqual({ target: 'idraulico', zone: 'Milano' });
    });

    it('falls back on the parts of the name', () => {
      expect(resolveTargeting(base)).toStrictEqual({ target: 'idraulico', zone: 'Roma' });
      expect(resolveTargeting({ ...base, name: 'ottico - Roma - #1' })).toStrictEqual({
        target: 'ottico',
        zone: 'Roma',
      });
    });

    it('ignores a free-form name', () => {
      expect(resolveTargeting({ ...base, name: 'Test ottobre' })).toStrictEqual({
        target: null,
        zone: null,
      });
    });
  });
});
