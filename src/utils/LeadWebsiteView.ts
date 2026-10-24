/** Which leads of a search the table shows, by whether the business has a website. */
export const LEAD_WEBSITE_VIEWS = ['all', 'without', 'with'] as const;

export type LeadWebsiteView = (typeof LEAD_WEBSITE_VIEWS)[number];

/**
 * Reads the website view from a search param, falling back to every lead.
 * @param value The raw `website` search param.
 * @returns The view to show.
 */
export const parseLeadWebsiteView = (value: string | string[] | undefined) =>
  LEAD_WEBSITE_VIEWS.find((view) => view === value) ?? 'all';
