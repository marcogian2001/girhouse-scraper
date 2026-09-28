import * as z from 'zod';

export const MAX_POLL_CONTACTS_PER_CAMPAIGN = 10;

export const EmailPollValidation = z.object({
  name: z.string().trim().min(1).max(120),
  campaignIds: z.array(z.uuid()).min(1).max(20),
  contactsPerCampaign: z.number().int().min(1).max(MAX_POLL_CONTACTS_PER_CAMPAIGN),
});

export const EmailPollVisibilityValidation = z
  .object({
    showModel: z.boolean().optional(),
    showCost: z.boolean().optional(),
  })
  .refine((value) => value.showModel !== undefined || value.showCost !== undefined, {
    error: 'At least one setting is required',
  });

export const EmailPollVoteValidation = z.object({
  itemId: z.uuid(),
  score: z.number().int().min(1).max(10),
});
