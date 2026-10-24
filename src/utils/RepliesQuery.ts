import type { ReplyStatus } from './ReplyStatus';
import { REPLY_STATUSES } from './ReplyStatus';

/** The answers a yes-or-no filter takes in the URL. */
export const YES_NO = ['yes', 'no'] as const;

type YesNo = (typeof YES_NO)[number];

/** The filters of the replies list, as kept in the URL. */
export type RepliesQuery = {
  search: string;
  state?: ReplyStatus;
  answered?: YesNo;
  bot?: YesNo;
};

/**
 * Reads the replies list filters from the page's search params, dropping unknown values.
 * @param params The page's search params.
 * @returns The filters.
 */
export const parseRepliesQuery = (
  params: Record<string, string | string[] | undefined>,
): RepliesQuery => ({
  search: typeof params.q === 'string' ? params.q.trim() : '',
  state: REPLY_STATUSES.find((status) => status === params.state),
  answered: YES_NO.find((value) => value === params.answered),
  bot: YES_NO.find((value) => value === params.bot),
});

/**
 * Tells whether any filter narrows the replies list.
 * @param query The filters.
 * @returns True when at least one filter is set.
 */
export const hasRepliesFilters = (query: RepliesQuery) =>
  query.search.trim() !== '' ||
  query.state !== undefined ||
  query.answered !== undefined ||
  query.bot !== undefined;

/**
 * Builds the link to the replies list with the given filters.
 * @param query The filters.
 * @param page The 1-based page, the first when omitted.
 * @returns The path with its query string.
 */
export const repliesHref = (query: RepliesQuery, page = 1) => {
  const params = new URLSearchParams();
  const search = query.search.trim();

  if (search) {
    params.set('q', search);
  }

  if (query.state) {
    params.set('state', query.state);
  }

  if (query.answered) {
    params.set('answered', query.answered);
  }

  if (query.bot) {
    params.set('bot', query.bot);
  }

  if (page > 1) {
    params.set('page', String(page));
  }

  const queryString = params.toString();

  return `/dashboard/replies/${queryString ? `?${queryString}` : ''}`;
};
