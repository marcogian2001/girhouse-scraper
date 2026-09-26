import * as z from 'zod';

/** Kept well under the campaign contact cap, so one search always fits one campaign. */
export const MAX_LEADS_PER_SEARCH = 500;

const MAX_SEARCH_TERMS = 10;

export const LeadSearchValidation = z.object({
  name: z.string().trim().min(1).max(120),
  searchTerms: z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_SEARCH_TERMS),
  location: z.string().trim().min(1).max(200),
  maxResults: z.number().int().min(1).max(MAX_LEADS_PER_SEARCH),
  websiteFilter: z.enum(['any', 'without', 'with']).default('any'),
  processor: z.enum(['lite', 'base', 'core', 'pro']).default('base'),
});

/** The decision maker research Parallel fills in for one business. */
export const DecisionMakerValidation = z.object({
  decision_maker_found: z.boolean(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.string(),
  linkedin_url: z.string(),
  public_email: z.string(),
  public_email_source: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  reasoning: z.string(),
});

export type DecisionMaker = z.infer<typeof DecisionMakerValidation>;

/** What the search form posts: the search terms are typed one per line. */
export const LeadSearchFormValidation = LeadSearchValidation.extend({
  searchTerms: z
    .string()
    .transform((value) =>
      value
        .split('\n')
        .map((term) => term.trim())
        .filter(Boolean),
    )
    .pipe(LeadSearchValidation.shape.searchTerms),
});
