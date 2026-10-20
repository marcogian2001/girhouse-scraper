import { DEMO_STEPS } from './DemoStats';
import type { ConversationState } from './ReplyRouting';

/** States a silent lead can still be followed up from. */
export const FOLLOW_UP_STATES = new Set<ConversationState>([
  'demo_sent',
  'demo_viewed',
  'follow_up',
  'nurturing',
]);

/** The emails a silent lead can get. */
export type FollowUpKind =
  | 'demo_not_opened'
  | 'demo_partial'
  | 'demo_complete'
  | 'closing'
  | 'nurturing';

/** What the next step for a silent lead is. */
export type NextAction =
  | { type: 'email'; kind: FollowUpKind; step?: number }
  | { type: 'whatsapp' }
  | { type: 'close' }
  | { type: 'none' };

/** How a lead went through their demo, as `summarizeDemo` reports it. */
type DemoBehaviour = {
  behavior: 'not_opened' | 'partial' | 'complete';
  maxStep: number;
  booked: boolean;
};

/**
 * Picks the follow-up for a lead who went silent: one tuned to what they did on the
 * demo, then a closing email with the real scarcity, then WhatsApp for leads who said
 * yes, or the end. A "not now" gets a few spaced reminders instead.
 * @param options What is known about the lead.
 * @param options.state The conversation state.
 * @param options.followUpCount Follow-up and closing emails already sent.
 * @param options.nurturingCount Nurturing emails already sent.
 * @param options.demo How the lead went through their demo, null when they have none.
 * @param options.maxFollowUps Follow-ups before the closing email.
 * @param options.nurturingMaxCount Nurturing emails before the end.
 * @param options.whatsappEligible Whether the lead said yes, has a mobile number and never booked.
 * @returns The next step.
 */
export const nextAction = (options: {
  state: ConversationState;
  followUpCount: number;
  nurturingCount: number;
  demo: DemoBehaviour | null;
  maxFollowUps: number;
  nurturingMaxCount: number;
  whatsappEligible: boolean;
}): NextAction => {
  if (!FOLLOW_UP_STATES.has(options.state)) {
    return { type: 'none' };
  }

  if (options.state === 'nurturing') {
    return options.nurturingCount < options.nurturingMaxCount
      ? { type: 'email', kind: 'nurturing' }
      : { type: 'close' };
  }

  // Follow-ups are only for leads who got their demo and did not book
  if (!options.demo || options.demo.booked) {
    return { type: 'none' };
  }

  if (options.followUpCount < options.maxFollowUps) {
    if (options.demo.behavior === 'not_opened') {
      return { type: 'email', kind: 'demo_not_opened' };
    }

    return options.demo.behavior === 'partial'
      ? {
          type: 'email',
          kind: 'demo_partial',
          step: Math.min(options.demo.maxStep + 1, DEMO_STEPS),
        }
      : { type: 'email', kind: 'demo_complete' };
  }

  if (options.followUpCount === options.maxFollowUps) {
    return { type: 'email', kind: 'closing' };
  }

  return options.whatsappEligible ? { type: 'whatsapp' } : { type: 'close' };
};
