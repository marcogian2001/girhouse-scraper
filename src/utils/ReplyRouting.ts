import type { conversationSchema, replyClassificationSchema } from '@/models/Schema';

export type ConversationState = (typeof conversationSchema.$inferSelect)['state'];

export type ReplyCategory = (typeof replyClassificationSchema.$inferSelect)['category'];

/** The Italian categories the classifier answers with, as stored. */
export const CATEGORY_FROM_CLASSIFIER = {
  interessato: 'interested',
  domanda: 'question',
  obiezione: 'objection',
  non_ora: 'not_now',
  non_interessato: 'not_interested',
  stop: 'stop',
  fuori_ufficio: 'out_of_office',
  persona_sbagliata: 'wrong_person',
  altro: 'other',
} as const satisfies Record<string, ReplyCategory>;

/** States the automation never leaves on its own. */
export const FINAL_STATES = new Set<ConversationState>(['stop', 'paused']);

/**
 * Decides where a conversation goes once its latest reply is classified.
 * `stop` wins over everything, confidence included: in doubt the lead is left alone.
 * @param options The decision inputs.
 * @param options.category The reply's category.
 * @param options.confidence How sure the classifier was, from 0 to 1.
 * @param options.threshold The confidence below which a person reviews the reply.
 * @param options.isNewObjection Whether the objection was just added to the library.
 * @param options.hasReferral Whether the lead pointed to someone else.
 * @param options.negativeReplyCount How many earlier replies were `not_interested`.
 * @returns The next conversation state.
 */
export const decideState = (options: {
  category: ReplyCategory;
  confidence: number;
  threshold: number;
  isNewObjection: boolean;
  hasReferral: boolean;
  negativeReplyCount: number;
}): ConversationState => {
  if (options.category === 'stop') {
    return 'stop';
  }

  if (options.category === 'other' || options.confidence < options.threshold) {
    return 'manual_review';
  }

  // The first answer to an unseen objection is never sent before a person reads the angle
  if (options.isNewObjection) {
    return 'manual_review';
  }

  if (options.category === 'not_interested' && options.negativeReplyCount > 0) {
    return 'closed_not_interested';
  }

  if (options.category === 'out_of_office') {
    return 'out_of_office';
  }

  if (options.category === 'wrong_person') {
    // The referral becomes a new contact, which a person approves
    return options.hasReferral ? 'manual_review' : 'wrong_person';
  }

  return 'classified';
};

/** Categories that get an answer. Stops, out-of-office replies and unknowns never do. */
const ANSWERED_CATEGORIES = new Set<ReplyCategory>([
  'interested',
  'question',
  'objection',
  'not_now',
  'not_interested',
  'wrong_person',
]);

/**
 * Tells whether a classified reply gets an answer. Replies in manual review get a
 * draft too, so the person reviewing starts from a proposal.
 * @param options The decision inputs.
 * @param options.category The reply's category.
 * @param options.state The state the conversation moved to.
 * @param options.hasReferral Whether the lead pointed to someone else.
 * @returns True when a reply should be written.
 */
export const needsAnswer = (options: {
  category: ReplyCategory;
  state: ConversationState;
  hasReferral: boolean;
}) =>
  ANSWERED_CATEGORIES.has(options.category) &&
  (options.state === 'classified' || options.state === 'manual_review') &&
  // A wrong person is only thanked when they pointed to someone else
  (options.category !== 'wrong_person' || options.hasReferral);

/**
 * Parses the return date of an out-of-office reply.
 * @param value An ISO date such as `2026-10-20`, or null.
 * @returns The date at midnight UTC, or null when it is missing or invalid.
 */
export const parseReturnDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Turns a free-text title into the key the classifier refers to an objection by.
 * @param title The objection title.
 * @returns A lowercase snake_case key.
 */
export const toObjectionKey = (title: string) =>
  title
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '')
    .slice(0, 60) || 'obiezione';
