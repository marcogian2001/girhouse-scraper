import type { ReplyCategory } from './ReplyRouting';
import { rateOf } from './ReplyStats';

/** Categories an autoresponder gets: the lead did not write them. */
const AUTOMATIC_CATEGORIES = new Set<ReplyCategory>(['auto_reply', 'out_of_office']);

/** What happened to one lead of a campaign, as the test record counts it. */
export type LeadFacts = {
  // Every category the lead's replies got, empty when none was classified; null without replies
  categories: ReplyCategory[] | null;
  demoCompleted: boolean;
  booked: boolean;
  won: boolean;
  // Euros, 0 when the sale has no value on GHL
  wonValue: number;
};

/** The steps a campaign test is measured on, in order. */
export const TEST_STEPS = ['replied', 'positive', 'demo_completed', 'booked', 'won'] as const;

export type TestStep = (typeof TEST_STEPS)[number];

/** The step each one is a share of: a call follows a yes, with or without the full demo. */
export const STEP_BASE = {
  replied: 'contacted',
  positive: 'replied',
  demo_completed: 'positive',
  booked: 'positive',
  won: 'booked',
} as const satisfies Record<TestStep, TestStep | 'contacted'>;

/**
 * Tells whether the lead wrote back themselves. A reply nobody classified, as on a
 * campaign the sales reps answer, counts: only autoresponders are left out.
 * @param lead The lead.
 * @returns True once the lead replied.
 */
const hasReplied = (lead: LeadFacts) =>
  lead.categories !== null &&
  (lead.categories.length === 0 ||
    lead.categories.some((category) => !AUTOMATIC_CATEGORIES.has(category)));

/**
 * Tells whether the lead said yes: a reply classified as interested, or a call booked
 * after replying, since an objection that ends in a call was a yes too.
 * @param lead The lead.
 * @returns True for a positive reply.
 */
const isPositive = (lead: LeadFacts) =>
  hasReplied(lead) && (lead.categories?.includes('interested') === true || lead.booked);

/**
 * Counts how a campaign's leads went, from the reply to the sale.
 * @param options The campaign.
 * @param options.contacted How many leads the campaign emailed.
 * @param options.leads One entry per lead, only those something happened to are needed.
 * @returns Each step's count with its share of the leads contacted and of its base step,
 * the replies nobody classified and the value of the sales.
 */
export const buildCampaignTest = (options: { contacted: number; leads: LeadFacts[] }) => {
  const count = (pick: (lead: LeadFacts) => boolean) => options.leads.filter(pick).length;

  const counts: Record<TestStep | 'contacted', number> = {
    contacted: options.contacted,
    replied: count(hasReplied),
    positive: count(isPositive),
    demo_completed: count((lead) => lead.demoCompleted),
    // A sale always went through a call, even one booked before the platform recorded it
    booked: count((lead) => lead.booked || lead.won),
    won: count((lead) => lead.won),
  };

  return {
    contacted: options.contacted,
    steps: TEST_STEPS.map((step) => ({
      step,
      count: counts[step],
      ofContacted: rateOf(counts[step], options.contacted),
      ofBase: rateOf(counts[step], counts[STEP_BASE[step]]),
    })),
    unclassified: count((lead) => lead.categories?.length === 0),
    wonValue: options.leads.reduce((total, lead) => total + (lead.won ? lead.wonValue : 0), 0),
  };
};

/**
 * Picks who and where a campaign tests: what was typed by hand, else what most of its
 * contacts share, else the first two parts of a name like "idraulico · Roma · #1".
 * @param options The campaign.
 * @param options.name The campaign name.
 * @param options.target The target typed by hand.
 * @param options.zone The zone typed by hand.
 * @param options.contactTarget The profession most contacts share.
 * @param options.contactZone The province or city most contacts share.
 * @returns The target and the zone, null when nothing tells.
 */
export const resolveTargeting = (options: {
  name: string;
  target: string | null;
  zone: string | null;
  contactTarget: string | null;
  contactZone: string | null;
}) => {
  const parts = options.name.split(' · ').map((part) => part.trim());
  const fromName = parts.length >= 3 ? parts : [];

  return {
    target: options.target ?? options.contactTarget ?? fromName[0] ?? null,
    zone: options.zone ?? options.contactZone ?? fromName[1] ?? null,
  };
};
