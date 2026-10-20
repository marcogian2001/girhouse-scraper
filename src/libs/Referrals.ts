import { and, eq, max, sql } from 'drizzle-orm';
import { contactSchema, emailSuppressionSchema } from '@/models/Schema';
import { parseReferral } from '@/utils/Referral';
import type { Conversation } from './Conversations';
import { logEvent } from './Conversations';
import { db } from './DB';
import { enqueue } from './JobQueue';

/**
 * Adds the person a "wrong person" reply points to as a new contact of the same
 * campaign. The usual pipeline researches them and writes their emails; a person then
 * approves and sends them from the campaign. Skipped for addresses that are blocked or
 * already in the campaign.
 * @param options The referral.
 * @param options.conversation The conversation of the lead who pointed elsewhere.
 * @param options.referral The referral, as the classifier read it.
 */
export const createReferralContact = async (options: {
  conversation: Conversation;
  referral: string | null;
}) => {
  const { conversation } = options;
  const referral = parseReferral(options.referral);

  if (!referral || !conversation.campaignId) {
    return;
  }

  if (conversation.isTest) {
    await logEvent({
      conversationId: conversation.id,
      type: 'test_skipped_referral_contact',
      payload: { email: referral.email },
    });

    return;
  }

  const [suppressed] = await db
    .select({ email: emailSuppressionSchema.email })
    .from(emailSuppressionSchema)
    .where(
      and(
        eq(emailSuppressionSchema.organizationId, conversation.organizationId),
        eq(emailSuppressionSchema.email, referral.email),
      ),
    );

  const [existing] = await db
    .select({ id: contactSchema.id })
    .from(contactSchema)
    .where(
      and(
        eq(contactSchema.campaignId, conversation.campaignId),
        eq(sql`lower(${contactSchema.email})`, referral.email),
      ),
    );

  if (suppressed || existing) {
    await logEvent({
      conversationId: conversation.id,
      type: 'referral_contact_skipped',
      payload: { email: referral.email, reason: suppressed ? 'suppressed' : 'already_in_campaign' },
    });

    return;
  }

  const referrer = conversation.contactId
    ? await db.query.contactSchema.findFirst({
        where: eq(contactSchema.id, conversation.contactId),
      })
    : undefined;

  const [last] = await db
    .select({ rowIndex: max(contactSchema.rowIndex) })
    .from(contactSchema)
    .where(eq(contactSchema.campaignId, conversation.campaignId));

  const [contact] = await db
    .insert(contactSchema)
    .values({
      campaignId: conversation.campaignId,
      rowIndex: (last?.rowIndex ?? 0) + 1,
      email: referral.email,
      firstName: referral.firstName,
      lastName: referral.lastName,
      company: referrer?.company ?? conversation.company,
      website: referrer?.website,
      // The referrer's segment, such as the category and the city, fits the colleague too
      extra: referrer?.extra ?? {},
      status: 'pending',
    })
    .returning();

  if (!contact) {
    return;
  }

  await enqueue([{ campaignId: conversation.campaignId, contactId: contact.id, type: 'enrich' }]);
  await logEvent({
    conversationId: conversation.id,
    type: 'referral_contact_created',
    payload: { contactId: contact.id, email: referral.email, campaignId: conversation.campaignId },
  });
};
