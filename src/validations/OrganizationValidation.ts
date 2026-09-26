import * as z from 'zod';

export const OrganizationValidation = z.object({
  name: z.string().trim().min(1).max(80),
});
