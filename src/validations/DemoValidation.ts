import * as z from 'zod';
import { isCustomDemoSlug, normalizeCustomDemoSlug } from '@/utils/CustomDemoSlug';
import { DEMO_STEPS } from '@/utils/DemoStats';

/** A demo slug: a business name as a slug, numbered when taken (older ones end in a random suffix). */
export const DemoSlugValidation = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[0-9A-Za-z-]+$/u);

const sessionId = z.string().min(8).max(64);

export const DemoEventValidation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), sessionId }),
  z.object({ type: z.literal('heartbeat'), sessionId }),
  z.object({ type: z.literal('whatsapp_click'), sessionId }),
  z.object({ type: z.literal('step'), sessionId, step: z.number().int().min(1).max(DEMO_STEPS) }),
]);

export const DemoPhoneValidation = z.object({
  sessionId,
  phone: z.string().trim().min(6).max(30),
});

export const DemoBookingValidation = z.object({
  sessionId,
  startTime: z.iso.datetime({ offset: true }),
});

export const DemoRebuildValidation = z.object({
  // What the Girhouse team tells the demo to use, links to the business's pages included
  guidance: z.string().trim().max(4000),
});

/** A new demo may use an exact custom slug; blank input keeps automatic generation. */
export const DemoCreateValidation = z.object({
  slug: z
    .string()
    .transform(normalizeCustomDemoSlug)
    .refine((value) => !value || isCustomDemoSlug(value))
    .transform((value) => value || undefined)
    .optional(),
});
