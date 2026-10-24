import type { ConversationState, ReplyCategory } from './ReplyRouting';

/** Where a lead stands as the replies list shows it, in the order the filter lists them. */
export const REPLY_STATUSES = [
  'pending',
  'interested',
  'question',
  'objection',
  'not_now',
  'not_interested',
  'manual_review',
  'demo_sent',
  'demo_viewed',
  'follow_up',
  'whatsapp',
  'call_booked',
  'nurturing',
  'out_of_office',
  'auto_reply',
  'no_reply',
  'stop',
  'wrong_person',
] as const;

export type ReplyStatus = (typeof REPLY_STATUSES)[number];

/** States that say nothing about the lead, so the category of their latest reply speaks instead. */
export const CATEGORY_STATES = new Set<ConversationState>(['replied', 'classified', 'paused']);

const STATUS_FROM_CATEGORY: Record<ReplyCategory, ReplyStatus> = {
  interested: 'interested',
  question: 'question',
  objection: 'objection',
  not_now: 'not_now',
  not_interested: 'not_interested',
  stop: 'stop',
  out_of_office: 'out_of_office',
  auto_reply: 'auto_reply',
  wrong_person: 'wrong_person',
  other: 'manual_review',
};

const STATUS_FROM_STATE: Record<ConversationState, ReplyStatus> = {
  replied: 'pending',
  classified: 'pending',
  paused: 'pending',
  demo_sent: 'demo_sent',
  demo_viewed: 'demo_viewed',
  follow_up: 'follow_up',
  whatsapp: 'whatsapp',
  call_booked: 'call_booked',
  nurturing: 'nurturing',
  out_of_office: 'out_of_office',
  auto_reply: 'auto_reply',
  manual_review: 'manual_review',
  closed_not_interested: 'not_interested',
  closed_no_reply: 'no_reply',
  stop: 'stop',
  wrong_person: 'wrong_person',
};

/**
 * Merges a conversation's state and its latest reply's category into the one status shown.
 * @param state The conversation state.
 * @param category The category of the latest reply, or null when it is not classified.
 * @returns The status.
 */
export const toReplyStatus = (state: ConversationState, category: ReplyCategory | null) =>
  CATEGORY_STATES.has(state) && category
    ? STATUS_FROM_CATEGORY[category]
    : STATUS_FROM_STATE[state];

/**
 * Lists what a conversation must have to show a status, so the list can filter on it in SQL.
 * @param options The call options.
 * @param options.status The status to match.
 * @param options.states Every conversation state.
 * @param options.categories Every reply category.
 * @returns The states that show it whatever the category, the categories that show it in a
 * `CATEGORY_STATES` state, and whether an unclassified reply there shows it.
 */
export const replyStatusFilter = (options: {
  status: ReplyStatus;
  states: readonly ConversationState[];
  categories: readonly ReplyCategory[];
}) => ({
  states: options.states.filter(
    (state) => !CATEGORY_STATES.has(state) && STATUS_FROM_STATE[state] === options.status,
  ),
  categories: options.categories.filter(
    (category) => STATUS_FROM_CATEGORY[category] === options.status,
  ),
  unclassified: options.status === 'pending',
});
