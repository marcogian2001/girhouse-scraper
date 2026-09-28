import * as z from 'zod';
import { MAX_CONTACTS_PER_CAMPAIGN } from './CampaignValidation';

/** Matches the campaign contact cap, so one search always fits one campaign. */
export const MAX_LEADS_PER_SEARCH = MAX_CONTACTS_PER_CAMPAIGN;

export const MAX_SEARCH_TERMS = 10;

export const MAX_SEARCH_TERM_LENGTH = 120;

export const LeadSearchValidation = z.object({
  name: z.string().trim().min(1).max(120),
  searchTerms: z
    .array(z.string().trim().min(1).max(MAX_SEARCH_TERM_LENGTH))
    .min(1)
    .max(MAX_SEARCH_TERMS),
  location: z.string().trim().min(1).max(200),
  // Google place id of the area, picked from the suggestions with its label
  locationPlaceId: z.string().trim().min(1).max(300),
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
  // Defaulted, so runs started before these fields were asked for still parse
  business_phone: z.string().default(''),
  business_description: z.string().default(''),
  confidence: z.enum(['low', 'medium', 'high']),
  reasoning: z.string(),
});

export type DecisionMaker = z.infer<typeof DecisionMakerValidation>;
