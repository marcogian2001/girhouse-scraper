import { and, eq, isNotNull } from 'drizzle-orm';
import { automationSettingsSchema, campaignSchema } from '@/models/Schema';
import { ghlHookFor } from '@/utils/GhlRelay';
import type { InstantlyWebhook } from '@/validations/InstantlyWebhookValidation';
import { db } from './DB';
import { Env } from './Env';
import { logger } from './Logger';

/**
 * Tells whether an Instantly campaign belongs to a notify-only organization.
 * @param instantlyCampaignId The Instantly campaign id.
 * @returns True when its organization must never reach GHL.
 */
const isNotifyOnlyCampaign = async (instantlyCampaignId: string) => {
  const [row] = await db
    .select({ id: campaignSchema.id })
    .from(campaignSchema)
    .innerJoin(
      automationSettingsSchema,
      eq(automationSettingsSchema.organizationId, campaignSchema.organizationId),
    )
    .where(
      and(
        eq(campaignSchema.instantlyCampaignId, instantlyCampaignId),
        isNotNull(automationSettingsSchema.notifyEmail),
      ),
    )
    .limit(1);

  return Boolean(row);
};

/**
 * Passes an Instantly event on to the GHL workflows, unchanged, unless it comes from a
 * notify-only organization. Campaigns made by hand on Instantly are relayed too. GHL is
 * secondary here: a failure is logged and never fails the Instantly delivery.
 * @param options The call options.
 * @param options.webhook The validated event.
 * @param options.body The raw body Instantly sent.
 */
export const relayToGhl = async (options: { webhook: InstantlyWebhook; body: string }) => {
  const hook = ghlHookFor({
    eventType: options.webhook.event_type,
    replyHook: Env.GHL_REPLY_HOOK_URL,
    interestedHook: Env.GHL_INTERESTED_HOOK_URL,
  });

  if (!hook) {
    return;
  }

  if (options.webhook.campaign_id && (await isNotifyOnlyCampaign(options.webhook.campaign_id))) {
    return;
  }

  try {
    const response = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: options.body,
    });

    if (!response.ok) {
      logger.error(`GHL relay of ${options.webhook.event_type} failed with ${response.status}`);
    }
  } catch (error) {
    logger.error(`GHL relay of ${options.webhook.event_type} failed: ${String(error)}`);
  }
};
