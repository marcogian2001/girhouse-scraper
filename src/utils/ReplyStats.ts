import type { ReplyCategory } from './ReplyRouting';

/** Where a call was booked from. */
export type BookingSource = 'demo' | 'email' | 'ghl';

/** What happened to one conversation, as the metrics count it. */
export type ConversationFacts = {
  // The category of the lead's first reply, null when it was never classified
  firstCategory: ReplyCategory | null;
  objectionIds: string[];
  demoSent: boolean;
  demoOpened: boolean;
  demoCompleted: boolean;
  bookingSource: BookingSource | null;
  whatsapp: boolean;
};

/** The steps of the funnel, in order. */
export const FUNNEL_STEPS = [
  'replied',
  'demo_sent',
  'demo_opened',
  'demo_completed',
  'booked',
] as const;

/**
 * Tells whether the lead booked the call, from wherever.
 * @param fact The conversation.
 * @returns True once a call is booked.
 */
const booked = (fact: ConversationFacts) => fact.bookingSource !== null;

/**
 * Divides safely, for a rate shown as a percentage.
 * @param part The count that made it.
 * @param whole The count it is out of.
 * @returns The rate from 0 to 1, or null when there is nothing to divide by.
 */
export const rateOf = (part: number, whole: number) => (whole === 0 ? null : part / whole);

/**
 * Counts how the leads who replied went on: the funnel to the booked call, the outcome
 * by first-reply category and by objection, and where the calls were booked.
 * @param facts One entry per conversation.
 * @returns The metrics.
 */
export const buildReplyStats = (facts: ConversationFacts[]) => {
  const count = (pick: (fact: ConversationFacts) => boolean) => facts.filter(pick).length;

  const funnel = {
    replied: facts.length,
    demo_sent: count((fact) => fact.demoSent),
    demo_opened: count((fact) => fact.demoOpened),
    demo_completed: count((fact) => fact.demoCompleted),
    booked: count(booked),
  };

  const categories = new Map<ReplyCategory, { total: number; demoSent: number; booked: number }>();
  const objections = new Map<string, { total: number; booked: number }>();

  for (const fact of facts) {
    if (fact.firstCategory) {
      const row = categories.get(fact.firstCategory) ?? { total: 0, demoSent: 0, booked: 0 };
      categories.set(fact.firstCategory, {
        total: row.total + 1,
        demoSent: row.demoSent + Number(fact.demoSent),
        booked: row.booked + Number(booked(fact)),
      });
    }

    // A lead who raised the same objection twice counts once for it
    for (const objectionId of new Set(fact.objectionIds)) {
      const row = objections.get(objectionId) ?? { total: 0, booked: 0 };
      objections.set(objectionId, {
        total: row.total + 1,
        booked: row.booked + Number(booked(fact)),
      });
    }
  }

  return {
    funnel,
    whatsapp: count((fact) => fact.whatsapp),
    bookingSources: {
      demo: count((fact) => fact.bookingSource === 'demo'),
      email: count((fact) => fact.bookingSource === 'email'),
      ghl: count((fact) => fact.bookingSource === 'ghl'),
    },
    byCategory: [...categories.entries()]
      .map(([category, row]) => ({ category, ...row }))
      .toSorted((a, b) => b.total - a.total),
    byObjection: [...objections.entries()]
      .map(([objectionId, row]) => ({ objectionId, ...row }))
      .toSorted((a, b) => b.total - a.total),
  };
};
