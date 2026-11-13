import type { BusinessHours } from './BusinessHours';
import { toBusinessTime } from './BusinessHours';
import type { ConversationState } from './ReplyRouting';

/** States a lead who got the demo and went silent is followed up from. */
export const FOLLOW_UP_STATES = new Set<ConversationState>([
  'demo_sent',
  'demo_viewed',
  'follow_up',
]);

/** Whether follow-ups go out on their own after the demo; switched off by the owner on 13/11. */
export const AUTOMATIC_FOLLOW_UPS = false;

/** Follow-ups after the email with the demo; then nothing more goes out on its own. */
export const MAX_FOLLOW_UPS = 2;

/** From the email with the demo to the first follow-up, and from one follow-up to the next. */
const FOLLOW_UP_DELAY_MS = 24 * 60 * 60 * 1000;

/** The emails a silent lead can get. */
export type FollowUpKind = 'demo_not_opened' | 'demo_complete';

/** What the next step for a silent lead is. */
export type NextAction = { type: 'email'; kind: FollowUpKind; isLast: boolean } | { type: 'none' };

/** How a lead went through their demo, as `summarizeDemo` reports it. */
type DemoBehaviour = {
  behavior: 'not_opened' | 'partial' | 'complete';
  maxStep: number;
  booked: boolean;
};

/**
 * Picks the follow-up for a lead who went silent after the demo, tuned to what they did on
 * it, until the last one. A lead who stopped halfway gets nothing on its own.
 * @param options What is known about the lead.
 * @param options.state The conversation state.
 * @param options.followUpCount Follow-ups already sent.
 * @param options.demo How the lead went through their demo, null when they have none.
 * @returns The next step.
 */
export const nextAction = (options: {
  state: ConversationState;
  followUpCount: number;
  demo: DemoBehaviour | null;
}): NextAction => {
  if (
    !FOLLOW_UP_STATES.has(options.state) ||
    !options.demo ||
    options.demo.booked ||
    options.demo.behavior === 'partial' ||
    options.followUpCount >= MAX_FOLLOW_UPS
  ) {
    return { type: 'none' };
  }

  const isLast = options.followUpCount === MAX_FOLLOW_UPS - 1;

  return options.demo.behavior === 'not_opened'
    ? { type: 'email', kind: 'demo_not_opened', isLast }
    : { type: 'email', kind: 'demo_complete', isLast };
};

/**
 * Picks when the next follow-up is due: a day after the email before it, weekends
 * included, moved to the next opening when that falls outside business hours.
 * @param options The inputs.
 * @param options.from When the email before it left.
 * @param options.hours The business hours.
 * @returns The due time.
 */
export const followUpDueAt = (options: { from: Date; hours: BusinessHours }) =>
  toBusinessTime(new Date(options.from.getTime() + FOLLOW_UP_DELAY_MS), {
    ...options.hours,
    everyDay: true,
  });

/**
 * Tells whether an email carries the link to a demo, whatever the domain or query: a
 * person may paste it by hand.
 * @param text The email text.
 * @param slug The demo's slug.
 * @returns True when the text links to that demo.
 */
export const mentionsDemo = (text: string, slug: string) =>
  new RegExp(`/${slug.replaceAll(/[^\w-]/gu, '')}(?![\\w-])`, 'u').test(text);
