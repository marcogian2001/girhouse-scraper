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
});

export type EnrichmentContent = z.infer<typeof EnrichmentContentValidation>;

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
