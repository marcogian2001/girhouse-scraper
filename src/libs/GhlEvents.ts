import { and, desc, eq, sql } from 'drizzle-orm';
import { conversationSchema } from '@/models/Schema';
import { FINAL_STATES } from '@/utils/ReplyRouting';
import type { GhlWebhook } from '@/validations/GhlWebhookValidation';
import { applyStop, logEvent, setConversationState } from './Conversations';
import { db } from './DB';
import { markCallBooked } from './DemoBooking';

/**
 * Finds the conversation a GHL contact belongs to: by the contact id the platform
 * stored when it booked, else by the lead's email. Test conversations never match.
 * @param webhook The GHL delivery.
 * @returns The most recent matching conversation, or undefined.
 */
const findConversation = async (webhook: GhlWebhook) => {
  const match = webhook.contact_id
    ? eq(conversationSchema.ghlContactId, webhook.contact_id)
    : eq(sql`lower(${conversationSchema.leadEmail})`, webhook.email ?? '');

  const [byContact] = await db
    .select()
    .from(conversationSchema)
    .where(and(match, eq(conversationSchema.isTest, false)))
    .orderBy(desc(conversationSchema.updatedAt))
    .limit(1);

  if (byContact || !webhook.contact_id || !webhook.email) {
    return byContact;
  }

  // A contact GHL created on its own, such as a WhatsApp booking: fall back to the email
  const [byEmail] = await db
    .select()
    .from(conversationSchema)
    .where(
      and(
        eq(sql`lower(${conversationSchema.leadEmail})`, webhook.email),
        eq(conversationSchema.isTest, false),
      ),
    )
    .orderBy(desc(conversationSchema.updatedAt))
    .limit(1);

  return byEmail;
};

/**
 * Applies what a GHL workflow reports about a lead: a call booked on GHL stops the
 * emails, a handover sends the conversation to a person, a Do Not Disturb stops it for good.
 * Safe to receive twice.
 * @param webhook The GHL delivery.
 * @returns What happened to the delivery.
 */
export const receiveGhlEvent = async (webhook: GhlWebhook) => {
  const conversation = await findConversation(webhook);

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
