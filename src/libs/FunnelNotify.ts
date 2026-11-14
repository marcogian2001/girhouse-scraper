import { and, eq } from 'drizzle-orm';
import { conversationEventSchema, conversationSchema, demoSchema } from '@/models/Schema';
import {
  addContactTags,
  findPipelineOpportunity,
  getContactFieldIds,
  isDemoSentFieldConfigured,
  isGhlConfigured,
  markOpportunityDemoSent,
  setContactCustomFields,
  toCustomFieldValues,
} from '@/services/GoHighLevel';
import { logEvent } from './Conversations';
import { db } from './DB';
import { demoUrl } from './DemoLinks';
import { logger } from './Logger';

/** The GHL contact field the demo link is written to, which the WhatsApp message reads. */
const LINK_FIELD = 'contact.link_demo';

/**
 * Names the tag that starts a funnel's WhatsApp workflow on GHL, e.g. `demo-f3-pronta`.
 * @param funnel The funnel code, e.g. `F3`.
 * @returns The tag.
 */
export const funnelReadyTag = (funnel: string) => `demo-${funnel.toLowerCase()}-pronta`;

/**
 * Reads an event of a conversation.
 * @param conversationId The conversation.
 * @param type The event type.
 * @returns The event, or undefined.
 */
const findEvent = async (conversationId: string, type: string) =>
  await db.query.conversationEventSchema.findFirst({
    where: and(
      eq(conversationEventSchema.conversationId, conversationId),
      eq(conversationEventSchema.type, type),
    ),
  });

/**
 * Hands a funnel demo whose video is done to GHL, once: the link goes in the contact's
 * "Link demo" field and the funnel's tag starts the workflow that sends it on WhatsApp.
 * The opportunity's "Demo Inviata" box is ticked when the setting pipeline is configured.
 * Demos that did not come from a funnel are left alone.
 * @param demoId The demo whose video is done.
 */
const notifyFunnelDemo = async (demoId: string) => {
  const demo = await db.query.demoSchema.findFirst({ where: eq(demoSchema.id, demoId) });
  const conversation = demo
    ? await db.query.conversationSchema.findFirst({
        where: eq(conversationSchema.id, demo.conversationId),
      })
    : undefined;
  const contactId = conversation?.ghlContactId;

  if (!demo || !conversation || !contactId || !isGhlConfigured()) {
    return;
  }

  const requested = await findEvent(conversation.id, 'funnel_demo_requested');

  if (!requested || (await findEvent(conversation.id, 'funnel_demo_sent'))) {
    return;
  }

  const funnel = typeof requested.payload.funnel === 'string' ? requested.payload.funnel : 'F3';
  const url = demoUrl(demo.slug);
  const fields = toCustomFieldValues(await getContactFieldIds(), { [LINK_FIELD]: url });

  if (fields.length === 0) {
    throw new Error(`The GHL contact field ${LINK_FIELD} does not exist`);
  }

  await setContactCustomFields(contactId, fields);
  await addContactTags(contactId, [funnelReadyTag(funnel)]);

  if (isDemoSentFieldConfigured()) {
    const opportunity = await findPipelineOpportunity(contactId);

    if (opportunity) {
      await markOpportunityDemoSent({ opportunityId: opportunity.id });
    }
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'funnel_demo_sent',
    payload: { demoId, url, tag: funnelReadyTag(funnel) },
  });
  logger.info('Handed the {funnel} demo {slug} to GHL contact {contact}', {
    funnel,
    slug: demo.slug,
    contact: contactId,
  });
};

/**
 * Hands a funnel demo to GHL without failing the caller: a GHL error is logged, since the
 * video job that calls it must still finish.
 * @param demoId The demo whose video is done.
 */
export const notifyFunnelDemoSafely = async (demoId: string) => {
  await notifyFunnelDemo(demoId).catch((error: unknown) => {
    logger.error('Could not hand demo {demoId} to GHL: {error}', {
      demoId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};
