import { describe, expect, it } from 'vitest';
import type { ConversationFacts } from './ReplyStats';
import { buildReplyStats, rateOf } from './ReplyStats';

const fact = (overrides: Partial<ConversationFacts>): ConversationFacts => ({
  firstCategory: 'interested',
  objectionIds: [],
  demoSent: false,
  demoOpened: false,
  demoCompleted: false,
  bookingSource: null,
  whatsapp: false,
  ...overrides,
});

const facts = [
  fact({ demoSent: true, demoOpened: true, demoCompleted: true, bookingSource: 'demo' }),
  fact({ demoSent: true, demoOpened: true, whatsapp: true }),
  fact({ demoSent: true, bookingSource: 'email' }),
  fact({ firstCategory: 'objection', objectionIds: ['price', 'price'], bookingSource: 'ghl' }),
  fact({ firstCategory: 'objection', objectionIds: ['price', 'website'] }),
  fact({ firstCategory: null }),
];

describe('Reply stats', () => {
  const stats = buildReplyStats(facts);

  it('counts each step of the funnel', () => {
    expect(stats.funnel).toStrictEqual({
      replied: 6,
      demo_sent: 3,
      demo_opened: 2,
      demo_completed: 1,
      booked: 3,
    });
  });

  it('splits the outcome by the category of the first reply', () => {
    expect(stats.byCategory).toStrictEqual([
      { category: 'interested', total: 3, demoSent: 3, booked: 2 },
      { category: 'objection', total: 2, demoSent: 0, booked: 1 },
    ]);
  });

  it('counts a lead once per objection', () => {
    expect(stats.byObjection).toStrictEqual([
      { objectionId: 'price', total: 2, booked: 1 },
      { objectionId: 'website', total: 1, booked: 0 },
    ]);
  });

  it('tells where the calls were booked and who moved to WhatsApp', () => {
    expect(stats.bookingSources).toStrictEqual({ demo: 1, email: 1, ghl: 1 });
    expect(stats.whatsapp).toBe(1);
  });

  it('has no rate when there is nothing to divide by', () => {
    expect(rateOf(1, 4)).toBe(0.25);
    expect(rateOf(0, 0)).toBeNull();
  });
});
