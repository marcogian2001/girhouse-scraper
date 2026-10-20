import * as z from 'zod';

/** Webhook events that carry a lead's reply. */
export const REPLY_EVENTS = new Set(['reply_received', 'auto_reply_received']);

/**
 * An Instantly webhook delivery. Loose, since Instantly merges the lead's own
 * fields into the payload and adds event types over time.
 */
export const InstantlyWebhookValidation = z.looseObject({
  event_type: z.string(),
  timestamp: z.string(),
  campaign_id: z.string().nullish(),
  lead_email: z.string().nullish(),
  email_account: z.string().nullish(),
  reply_subject: z.string().nullish(),
  reply_text: z.string().nullish(),
  reply_text_snippet: z.string().nullish(),
  reply_html: z.string().nullish(),
});

export type InstantlyWebhook = z.infer<typeof InstantlyWebhookValidation>;
