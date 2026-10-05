import * as z from 'zod';
import { MAX_LEADS_PER_SEARCH, MAX_SEARCH_TERM_LENGTH } from './LeadSearchValidation';

/** Keeps a typo from scheduling a month of spend in one day. */
export const MAX_DAILY_LEADS = 5000;

export const CoveragePlanValidation = z.object({
  dailyLeads: z.number().int().min(1).max(MAX_DAILY_LEADS),
  leadsPerSearch: z.number().int().min(1).max(MAX_LEADS_PER_SEARCH),
  websiteFilter: z.enum(['any', 'without', 'with']),
  processor: z.enum(['lite', 'base', 'core', 'pro']),
  isActive: z.boolean(),
});

const tier = z.number().int().min(1).max(3);

export const CoverageTermValidation = z.object({
  term: z.string().trim().min(1).max(MAX_SEARCH_TERM_LENGTH),
  tier,
});

export const CoverageTermUpdateValidation = z.object({ tier, isActive: z.boolean() }).partial();
