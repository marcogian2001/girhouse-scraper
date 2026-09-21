import * as z from 'zod';

export const EmailDraftValidation = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10_000),
});
