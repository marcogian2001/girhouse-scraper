import * as z from 'zod';

/**
 * A lead from a girhouse.com funnel who asked for a demo: who they are, the GHL contact
 * the site created, and the Google Maps place they picked in the form.
 */
export const FunnelDemoValidation = z.object({
  funnel: z.string().trim().min(1).max(20),
  ghlContactId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(30).nullish(),
  company: z.string().trim().min(1).max(200),
  city: z.string().trim().max(120).nullish(),
  place: z.object({
    // Places API v1 ids come bare or as `places/<id>`
    id: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .transform((id) => id.replace(/^places\//u, '')),
    address: z.string().trim().max(300).nullish(),
    category: z.string().trim().max(120).nullish(),
    rating: z.number().min(0).max(5).nullish(),
    reviews: z.number().int().min(0).nullish(),
    website: z.url().nullish(),
    phone: z.string().trim().max(40).nullish(),
  }),
});

export type FunnelDemoRequest = z.infer<typeof FunnelDemoValidation>;
