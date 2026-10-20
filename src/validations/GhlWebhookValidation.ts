import * as z from 'zod';

/** What a GHL workflow tells the platform about a lead. */
const GHL_EVENTS = ['appointment_booked', 'handover', 'dnd'] as const;

/**
 * A delivery from a GHL workflow's Webhook action. GHL sends the contact's standard
 * fields at the top level and the action's own fields under `customData`, where the
 * workflow sets `event` (and `start_time` for a booking). Loose, since GHL adds fields.
 */
export const GhlWebhookValidation = z
  .looseObject({
    contact_id: z.string().min(1).nullish(),
    email: z.string().trim().toLowerCase().nullish(),
    customData: z.looseObject({
      event: z.enum(GHL_EVENTS),
      start_time: z.string().nullish(),
    }),
  })
  .refine((webhook) => Boolean(webhook.contact_id ?? webhook.email), {
    message: 'A contact id or an email is required',
  });

export type GhlWebhook = z.infer<typeof GhlWebhookValidation>;
