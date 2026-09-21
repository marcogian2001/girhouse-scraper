import * as z from 'zod';

export const MAX_EMAILS_PER_SEQUENCE = 5;

export const MAX_CONTACTS_PER_CAMPAIGN = 1000;

export const ContactRowValidation = z.object({
  email: z.email(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
  company: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  linkedinUrl: z.string().trim().max(500).optional(),
  extra: z.record(z.string(), z.string()).default({}),
});

/**
 * Checks that the sequence has a gap defined for every step.
 * @param campaign The campaign settings being validated.
 * @returns Whether there is exactly one delay per email.
 */
const hasOneDelayPerEmail = (campaign: { emailCount: number; delaysDays: number[] }) =>
  campaign.delaysDays.length === campaign.emailCount;

const campaignSettingsShape = z.object({
  name: z.string().trim().min(1).max(120),
  processor: z.enum(['lite', 'base', 'core', 'pro']).default('core'),
  emailCount: z.number().int().min(1).max(MAX_EMAILS_PER_SEQUENCE),
  // Days to wait after each step before the following email
  delaysDays: z.array(z.number().int().min(0).max(60)).max(MAX_EMAILS_PER_SEQUENCE),
  knowledgeAssetIds: z.array(z.uuid()).max(20).default([]),
  extraPrompt: z.string().trim().max(10_000).optional(),
});

export const CampaignNameValidation = campaignSettingsShape.pick({ name: true });

export const CampaignSettingsValidation = campaignSettingsShape.refine(hasOneDelayPerEmail, {
  error: 'One delay is required per email',
  path: ['delaysDays'],
});

/**
 * What the wizard form holds. `processor` and `knowledgeAssetIds` carry a
 * schema default, so they are optional until the schema has parsed the values.
 */
export type CampaignSettingsInput = z.input<typeof CampaignSettingsValidation>;

/** The sequence settings once parsed, with every default filled in. */
export type CampaignSettings = z.output<typeof CampaignSettingsValidation>;

export const CampaignValidation = campaignSettingsShape
  .extend({
    contacts: z.array(ContactRowValidation).min(1).max(MAX_CONTACTS_PER_CAMPAIGN),
  })
  .refine(hasOneDelayPerEmail, {
    error: 'One delay is required per email',
    path: ['delaysDays'],
  });
