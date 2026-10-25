import * as z from 'zod';

/** The research payload Parallel fills in, kept free of server-only imports so the review UI can parse it too. */
export const EnrichmentContentValidation = z.object({
  person_found: z.boolean(),
  identity_match_confidence: z.enum(['low', 'medium', 'high']),
  identity_match_reasoning: z.string(),
  full_name: z.string(),
  current_role: z.string(),
  current_company: z.string(),
  company_description: z.string(),
  company_industry: z.string(),
  location: z.string(),
  linkedin_url: z.string(),
  recent_activity: z.string(),
  personalization_hooks: z.string(),
  // Optional because research saved before these fields existed lacks them
  business_positioning: z.string().optional(),
  website_assessment: z.string().optional(),
  customer_signals: z.string().optional(),
});

export type EnrichmentContent = z.infer<typeof EnrichmentContentValidation>;

/** What reading the business's own website directly showed, which the research may get wrong. */
export const WebsiteCheckValidation = z.object({
  // False when the site could not be read well enough to trust that something is missing
  read: z.boolean(),
  pages: z.array(z.string()),
  contactForm: z.boolean(),
  whatsapp: z.boolean(),
  booking: z.boolean(),
  phone: z.boolean(),
});

export type WebsiteCheck = z.infer<typeof WebsiteCheckValidation>;

const EnrichmentCitationValidation = z.object({
  url: z.string(),
  title: z.string().nullish(),
  excerpts: z.array(z.string()).nullish(),
});

export const EnrichmentBasisValidation = z.object({
  field: z.string(),
  citations: z.array(EnrichmentCitationValidation).nullish(),
  reasoning: z.string().nullish(),
  confidence: z.string().nullish(),
});

export type EnrichmentBasis = z.infer<typeof EnrichmentBasisValidation>;
