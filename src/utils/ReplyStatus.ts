import type { ConversationState, ReplyCategory } from './ReplyRouting';

/** The statuses a classified lead can show, in the order the filter lists them. */
export const REPLY_STATUSES = ['interested', 'not_interested'] as const;

export type ClassifiedReplyStatus = (typeof REPLY_STATUSES)[number];

/** Where a lead stands as the replies list shows it: pending until the reply is classified. */
export type ReplyStatus = ClassifiedReplyStatus | 'pending';

/**
 * Positive or open replies, and the ones the AI could not place, count as interested.
 * Objections, a category the classifier no longer gives, count as a no.
 */
const STATUS_FROM_CATEGORY: Record<ReplyCategory, ClassifiedReplyStatus> = {
  interested: 'interested',
  question: 'interested',
  not_now: 'interested',
  other: 'interested',
  objection: 'not_interested',
  not_interested: 'not_interested',
  stop: 'not_interested',
  out_of_office: 'not_interested',
  auto_reply: 'not_interested',
  wrong_person: 'not_interested',
};

/**
 * Turns the category of a conversation's latest reply into the status shown.
 * @param state The conversation state.
 * @param category The category of the latest reply, or null when it is not classified.
 * @returns The status.
 */
export const toReplyStatus = (
  state: ConversationState,
  category: ReplyCategory | null,
): ReplyStatus => {
  if (category) {
    return STATUS_FROM_CATEGORY[category];
  }

  // A stop caught before any classification still means no
  return state === 'stop' ? 'not_interested' : 'pending';
};

/**
 * Lists the reply categories that show a status, so the list can filter on it in SQL.
 * @param options The call options.
 * @param options.status The status to match.
 * @param options.categories Every reply category.
 * @returns The categories that show it.
 */
export const categoriesShowing = (options: {
  status: ClassifiedReplyStatus;
  categories: readonly ReplyCategory[];
}) => options.categories.filter((category) => STATUS_FROM_CATEGORY[category] === options.status);
