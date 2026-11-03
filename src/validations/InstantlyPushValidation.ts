import * as z from 'zod';

export const InstantlyPushValidation = z.object({
  emailList: z.array(z.email()).min(1).max(50),
  timezone: z.string().trim().min(1).max(60),
});
