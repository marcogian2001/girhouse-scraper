import * as z from 'zod';

export const InstantlyPushValidation = z.object({
  emailList: z.array(z.email()).min(1).max(50),
  timezone: z.string().trim().min(1).max(60),
  // Whether the reply bot answers the campaign's leads
  botManaged: z.boolean().default(false),
});
