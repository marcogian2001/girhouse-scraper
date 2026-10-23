/** Rows a dashboard list shows per page. */
export const LIST_PAGE_SIZE = 25;

/**
 * Reads the 1-based page from a search param, falling back to the first page.
 * @param value The raw `page` search param.
 * @returns A whole page number, at least 1.
 */
export const parsePage = (value: string | string[] | undefined) =>
  typeof value === 'string' ? Math.max(1, Math.trunc(Number(value)) || 1) : 1;
