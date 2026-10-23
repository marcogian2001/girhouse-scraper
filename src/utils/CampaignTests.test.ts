import { describe, expect, it } from 'vitest';
import type { LeadFacts } from './CampaignTests';
import { buildCampaignTest, resolveTargeting } from './CampaignTests';

const lead = (overrides: Partial<LeadFacts>): LeadFacts => ({
  categories: ['interested'],
  demoCompleted: false,
  booked: false,
  won: false,
  wonValue: 0,
  ...overrides,
});

describe('Campaign tests', () => {
  describe(buildCampaignTest, () => {
    const test = buildCampaignTest({
      contacted: 100,
      leads: [
        lead({ demoCompleted: true, booked: true, won: true, wonValue: 97 }),
        lead({ demoCompleted: true }),
        lead({ categories: ['objection', 'interested'] }),
        lead({ categories: ['objection'], booked: true }),
        lead({ categories: ['not_interested'] }),
        lead({ categories: [] }),
        lead({ categories: ['out_of_office', 'auto_reply'] }),
        // Booked by a setter without ever replying by email
        lead({ categories: null, booked: true, won: true, wonValue: 194 }),
        // Sold after a call GHL never reported
        lead({ categories: null, won: true }),
      ],
    });

    const step = (name: string) => test.steps.find((item) => item.step === name);

    it('counts the replies without autoresponders', () => {
      expect(step('replied')).toStrictEqual({
        step: 'replied',
        count: 6,
        ofContacted: 0.06,
        ofBase: 0.06,
      });
    });

    it('counts a booked objection as a positive reply', () => {
      expect(step('positive')?.count).toBe(4);
      expect(step('positive')?.ofBase).toBeCloseTo(4 / 6);
    });

    it('counts calls and sales of leads who never replied by email', () => {
      expect(step('booked')?.count).toBe(4);
      expect(step('won')?.count).toBe(3);
      expect(test.wonValue).toBe(291);
    });

    it('shares the call on the positive replies', () => {
      expect(step('booked')?.ofBase).toBe(1);
    });

    it('counts the replies nobody classified', () => {
      expect(test.unclassified).toBe(1);
    });

    it('leaves rates empty without contacted leads', () => {
      const empty = buildCampaignTest({ contacted: 0, leads: [] });

      expect(empty.steps.every((item) => item.ofContacted === null)).toBeTruthy();
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
    });

    it('ignores a free-form name', () => {
      expect(resolveTargeting({ ...base, name: 'Test ottobre' })).toStrictEqual({
        target: null,
        zone: null,
      });
    });
  });
});
