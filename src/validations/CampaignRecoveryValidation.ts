import * as z from 'zod';

export const CampaignRecoveryValidation = z.object({
  budgetUsd: z.number().positive().max(2000).multipleOf(0.01),
  revision: z.string().regex(/^[a-f0-9]{64}$/u),
  reviewed: z.literal(true),
  action: z.enum(['increase', 'resume']),
});
