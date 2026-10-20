import type { SQL } from 'drizzle-orm';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  campaignSchema,
  contactSchema,
  conversationSchema,
  whatsappMessageSchema,
} from '@/models/Schema';
import { MEETING_BOOKED_INTEREST, updateLeadInterest } from '@/services/Instantly';
import { toE164 } from '@/utils/Phone';
import { FINAL_STATES } from '@/utils/ReplyRouting';
import type { GhlWebhook } from '@/validations/GhlWebhookValidation';
import { applyStop, logEvent, setConversationState } from './Conversations';
import { db } from './DB';
import { markCallBooked } from './DemoBooking';
import { logger } from './Logger';

/**
 * Reads the most recent real conversation matching a condition.
 * @param match The condition.
 * @returns The conversation, or undefined.
 */
const latestConversation = async (match: SQL) => {
  const [conversation] = await db
    .select()
    .from(conversationSchema)
    .where(and(match, eq(conversationSchema.isTest, false)))
    .orderBy(desc(conversationSchema.updatedAt))
    .limit(1);

  return conversation;
};

/**
 * Finds the conversation a GHL contact belongs to: by the contact id the platform
 * stored, else by email, else by phone, since a setter may create the contact with only
 * one of them. Test conversations never match.
 * @param webhook The GHL delivery.
 * @returns The most recent matching conversation, or null.
 */
const findConversation = async (webhook: GhlWebhook) => {
  const phone = toE164(webhook.phone);
  const matches = [
    webhook.contact_id ? eq(conversationSchema.ghlContactId, webhook.contact_id) : null,
    webhook.email ? eq(sql`lower(${conversationSchema.leadEmail})`, webhook.email) : null,
    phone ? eq(conversationSchema.phoneE164, phone) : null,
  ].filter((match): match is SQL => match !== null);

  for (const match of matches) {
    // oxlint-disable-next-line no-await-in-loop
    const conversation = await latestConversation(match);

    if (conversation) {
      return conversation;
    }
  }

  return null;
};

/**
 * Stops the Instantly sequence of a lead who never replied but booked a call on GHL,
 * for example with a setter on the phone: every campaign that holds their email marks
 * them "meeting booked", which completes them there.
 * @param email The lead's email.
 * @returns How many campaigns were updated.
 */
const stopCampaignSequences = async (email: string) => {
  const campaigns = await db
    .selectDistinct({ instantlyCampaignId: campaignSchema.instantlyCampaignId })
    .from(contactSchema)
    .innerJoin(campaignSchema, eq(campaignSchema.id, contactSchema.campaignId))
    .where(
      and(
        eq(sql`lower(${contactSchema.email})`, email),
        isNotNull(campaignSchema.instantlyCampaignId),
      ),
    );

  for (const campaign of campaigns) {
    if (campaign.instantlyCampaignId) {
      // oxlint-disable-next-line no-await-in-loop
      await updateLeadInterest({
        email,
        campaignId: campaign.instantlyCampaignId,
        value: MEETING_BOOKED_INTEREST,
      });
    }
  }

  logger.info('Stopped the Instantly sequence of {email} in {count} campaigns', {
    email,
    count: campaigns.length,
  });

  return campaigns.length;
};

/**
 * Applies what a GHL workflow reports about a lead: a call booked on GHL stops the
 * emails, a handover sends the conversation to a person, a Do Not Disturb stops it for
 * good, and a WhatsApp reply is recorded.
 * Safe to receive twice, except a WhatsApp reply, which is simply recorded again.
 * @param webhook The GHL delivery.
 * @returns What happened to the delivery.
 */
export const receiveGhlEvent = async (webhook: GhlWebhook) => {
  const conversation = await findConversation(webhook);

  // Booked by a setter before the lead ever replied: only Instantly has to stop
  if (!conversation && webhook.customData.event === 'appointment_booked' && webhook.email) {
    const campaigns = await stopCampaignSequences(webhook.email);

    return campaigns > 0
      ? { status: 'instantly_stopped' as const, campaigns }
      : { status: 'ignored' as const };
  }

  if (!conversation) {
    return { status: 'ignored' as const };
  }

  const { event, start_time: startTime } = webhook.customData;

  if (webhook.contact_id && !conversation.ghlContactId) {
    await db
      .update(conversationSchema)
      .set({ ghlContactId: webhook.contact_id })
      .where(eq(conversationSchema.id, conversation.id));
  }

  // Recorded whatever the state: the platform only reads WhatsApp, it never answers there
  if (event === 'whatsapp_inbound') {
    await db.insert(whatsappMessageSchema).values({
      conversationId: conversation.id,
      direction: 'inbound',
      body: webhook.customData.message ?? '',
      raw: webhook,
    });
    await logEvent({ conversationId: conversation.id, type: 'whatsapp_reply' });

    return { status: 'recorded' as const };
  }

  if (event === 'dnd') {
    await logEvent({ conversationId: conversation.id, type: 'ghl_dnd_received' });
    await applyStop({ conversation, reason: 'ghl_dnd' });

    return { status: 'stopped' as const };
  }

  if (FINAL_STATES.has(conversation.state)) {
    return { status: 'ignored' as const };
  }

  if (event === 'appointment_booked') {
    if (conversation.state !== 'call_booked') {
      await logEvent({
        conversationId: conversation.id,
        type: 'ghl_appointment_booked',
        payload: { startTime },
      });
      await markCallBooked(conversation);
    }

    return { status: 'booked' as const };
  }

  await logEvent({ conversationId: conversation.id, type: 'ghl_handover' });
  await setConversationState({ conversation, state: 'manual_review' });

  return { status: 'handed_over' as const };
};
