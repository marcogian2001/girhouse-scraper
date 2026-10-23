import * as z from 'zod';

/** What a GHL workflow tells the platform about a lead. */
const GHL_EVENTS = [
  'appointment_booked',
  'handover',
  'dnd',
  'whatsapp_inbound',
  // The lead's opportunity was marked won: a sale
  'deal_won',
] as const;

/**
 * A delivery from a GHL workflow's Webhook action. GHL sends the contact's standard
 * fields at the top level and the action's own fields under `customData`, where the
 * workflow sets `event`, plus `start_time` for a booking, `message` for a WhatsApp reply
 * and `value` for a sale.
 * Loose, since GHL adds fields.
 */
export const GhlWebhookValidation = z
  .looseObject({
    contact_id: z.string().min(1).nullish(),
    email: z.string().trim().toLowerCase().nullish(),
    phone: z.string().trim().nullish(),
    customData: z.looseObject({
      event: z.enum(GHL_EVENTS),
      start_time: z.string().nullish(),
      // The lead's WhatsApp message, for `whatsapp_inbound`
      message: z.string().nullish(),
      // The opportunity's monetary value, for `deal_won`; GHL sends custom data as text
      value: z.union([z.number(), z.string()]).nullish(),
    }),
  })
  .refine((webhook) => Boolean(webhook.contact_id ?? webhook.email ?? webhook.phone), {
    message: 'A contact id, an email or a phone is required',
  });

export type GhlWebhook = z.infer<typeof GhlWebhookValidation>;
