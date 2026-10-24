import type { ReplyCategory } from './ReplyRouting';
import { rateOf } from './ReplyStats';

/** Categories an autoresponder gets: the lead did not write them. */
const AUTOMATIC_CATEGORIES = new Set<ReplyCategory>(['auto_reply', 'out_of_office']);

/** Instantly's interest statuses, as labelled in its inbox. */
const INSTANTLY_STATUS = {
  outOfOffice: 0,
  interested: 1,
  meetingBooked: 2,
  meetingCompleted: 3,
  won: 4,
  noShow: -4,
} as const;

/** Labels a lead only gets after saying yes. */
const INSTANTLY_POSITIVE = new Set<number | null>([
  INSTANTLY_STATUS.interested,
  INSTANTLY_STATUS.meetingBooked,
  INSTANTLY_STATUS.meetingCompleted,
  INSTANTLY_STATUS.won,
]);

/** Labels a lead only gets once a call was booked. */
const INSTANTLY_BOOKED = new Set<number | null>([
  INSTANTLY_STATUS.meetingBooked,
  INSTANTLY_STATUS.meetingCompleted,
  INSTANTLY_STATUS.won,
  INSTANTLY_STATUS.noShow,
]);

/** A lead's reply as the platform handled it. */
export type PlatformFacts = {
  // Every category the replies got, empty when none was classified
  categories: ReplyCategory[];
  demoCompleted: boolean;
  booked: boolean;
};

/** A replied lead as Instantly labelled them. */
type InstantlyFacts = {
  // 1 for the first email of the sequence
  repliedStep: number | null;
  interestStatus: number | null;
};

/** What GHL reported about the lead. */
type OutcomeFacts = {
  callBooked: boolean;
  noShow: boolean;
  won: boolean;
  // Euros, null when the sale has no value on GHL
  wonValue: number | null;
};

/** What happened to one lead of a campaign, as the test record counts it. */
export type LeadFacts = {
  replied: boolean;
  positive: boolean;
  repliedStep: number | null;
  demoCompleted: boolean;
  booked: boolean;
  noShow: boolean;
  won: boolean;
  wonValue: number;
};

/**
 * Tells whether the lead wrote back themselves. The platform's classification wins,
 * since it tells autoresponders apart; a reply nobody classified counts. Without it,
 * Instantly's reply counts unless it was labelled out of office.
 * @param platform The lead's conversation, if any.
 * @param instantly The lead as Instantly labelled them, if any.
 * @returns True once the lead replied.
 */
const hasReplied = (platform: PlatformFacts | null, instantly: InstantlyFacts | null) => {
  if (platform) {
    return (
      platform.categories.length === 0 ||
      platform.categories.some((category) => !AUTOMATIC_CATEGORIES.has(category))
    );
  }

  return instantly !== null && instantly.interestStatus !== INSTANTLY_STATUS.outOfOffice;
};

/**
 * Joins what the platform, Instantly and GHL know about one lead. The platform's
 * classification wins on whether the lead wrote back, since it tells autoresponders
 * apart; Instantly's labels cover the replies the platform never received; GHL and
 * Instantly both report calls and sales.
 * @param sources What each source knows, null when it knows nothing about the lead.
 * @param sources.platform The lead's conversation.
 * @param sources.instantly The lead as Instantly labelled them.
 * @param sources.outcome What GHL reported.
 * @returns The lead's facts.
 */
export const mergeLeadFacts = (sources: {
  platform: PlatformFacts | null;
  instantly: InstantlyFacts | null;
  outcome: OutcomeFacts | null;
}): LeadFacts => {
  const { platform, instantly, outcome } = sources;
  const status = instantly?.interestStatus ?? null;

  const replied = hasReplied(platform, instantly);
  const noShow = outcome?.noShow === true || status === INSTANTLY_STATUS.noShow;
  const won = outcome?.won === true || status === INSTANTLY_STATUS.won;
  // A sale or a missed call always had a call booked, even one nobody recorded
  const booked = [
    platform?.booked,
    outcome?.callBooked,
    INSTANTLY_BOOKED.has(status),
    noShow,
    won,
  ].some(Boolean);
  // An objection that ends in a call was a yes too
  const saidYes = [
    platform?.categories.includes('interested'),
    INSTANTLY_POSITIVE.has(status),
    booked,
  ].some(Boolean);

  return {
    replied,
    positive: replied && saidYes,
    repliedStep: replied ? (instantly?.repliedStep ?? null) : null,
    demoCompleted: platform?.demoCompleted === true,
    booked,
    noShow,
    won,
    wonValue: won ? (outcome?.wonValue ?? 0) : 0,
  };
};

/** The steps a campaign test is measured on, in order. */
export const TEST_STEPS = [
  'replied',
  'positive',
  'demo_completed',
  'booked',
  'no_show',
  'won',
] as const;

export type TestStep = (typeof TEST_STEPS)[number];

/** The step each one is a share of: a call follows a yes, with or without the full demo. */
export const STEP_BASE = {
  replied: 'contacted',
  positive: 'replied',
  demo_completed: 'positive',
  booked: 'positive',
  no_show: 'booked',
  won: 'booked',
} as const satisfies Record<TestStep, TestStep | 'contacted'>;

/**
 * Divides a cost, for a cost per result.
 * @param costMicros The cost.
 * @param count The results it bought.
 * @returns The cost of each, or null without results.
 */
const costPer = (costMicros: number, count: number) =>
  count === 0 ? null : Math.round(costMicros / count);

/**
 * Counts how a campaign's leads went, from the reply to the sale.
 * @param options The campaign.
 * @param options.contacted How many leads the campaign emailed.
 * @param options.replied How many replied according to Instantly, which saw every reply;
 * null to count the leads instead.
 * @param options.leads One entry per lead something happened to.
 * @param options.costMicros What the campaign cost, in millionths of a dollar.
 * @returns Each step's count with its share of the leads contacted and of its base step,
 * the replies by email of the sequence, the value of the sales and the costs per lead
 * contacted, per call and per sale.
 */
export const buildCampaignTest = (options: {
  contacted: number;
  replied: number | null;
  leads: LeadFacts[];
  costMicros: number;
}) => {
  const count = (pick: (lead: LeadFacts) => boolean) => options.leads.filter(pick).length;

  const counts: Record<TestStep | 'contacted', number> = {
    contacted: options.contacted,
    replied: options.replied ?? count((lead) => lead.replied),
    positive: count((lead) => lead.positive),
    demo_completed: count((lead) => lead.demoCompleted),
    booked: count((lead) => lead.booked),
    no_show: count((lead) => lead.noShow),
    won: count((lead) => lead.won),
  };

  const byEmail = new Map<number, number>();

  for (const lead of options.leads) {
    if (lead.repliedStep !== null) {
      byEmail.set(lead.repliedStep, (byEmail.get(lead.repliedStep) ?? 0) + 1);
    }
  }

  const known = [...byEmail.values()].reduce((total, value) => total + value, 0);

  return {
    contacted: options.contacted,
    steps: TEST_STEPS.map((step) => ({
      step,
      count: counts[step],
      ofContacted: rateOf(counts[step], options.contacted),
      ofBase: rateOf(counts[step], counts[STEP_BASE[step]]),
    })),
    // Shares of the replies whose email is known
    repliesByEmail: [...byEmail.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([email, value]) => ({ email, count: value, share: rateOf(value, known) })),
    wonValue: options.leads.reduce((total, lead) => total + lead.wonValue, 0),
    costMicros: options.costMicros,
    costPerLeadMicros: costPer(options.costMicros, options.contacted),
    costPerCallMicros: costPer(options.costMicros, counts.booked),
    costPerWonMicros: costPer(options.costMicros, counts.won),
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
  const parts = options.name.split(/ [·-] /u).map((part) => part.trim());
  const fromName = parts.length >= 3 ? parts : [];

  return {
    target: options.target ?? options.contactTarget ?? fromName[0] ?? null,
    zone: options.zone ?? options.contactZone ?? fromName[1] ?? null,
  };
};
