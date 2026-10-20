import { and, eq } from 'drizzle-orm';
import { conversationSchema, whatsappHandoffSchema, whatsappMessageSchema } from '@/models/Schema';
import type { ContactFieldSpec } from '@/services/GoHighLevel';
import {
  addContactTags,
  ensureContactFields,
  isGhlConfigured,
  toCustomFieldValues,
  upsertContact,
} from '@/services/GoHighLevel';
import {
  checkWhatsappMessage,
  describeDemoBehavior,
  writeWhatsapp,
} from '@/services/WhatsappWriter';
import { buildOfferBrief } from '@/utils/Offer';
import { cleanReply } from '@/utils/ReplyGuard';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation } from './Conversations';
import { logEvent, setConversationState } from './Conversations';
import { loadThread } from './ConversationThread';
import { db } from './DB';
import { getConversationDemo } from './Demos';
import { loadLeadContext } from './LeadContext';
import { scheduleNextAction } from './NextAction';
import { recordCopywritingUsage } from './Usage';

type Handoff = typeof whatsappHandoffSchema.$inferSelect;

/** The tag that starts the "WA Outreach" workflow on GHL. */
const WHATSAPP_TAG = 'wa-outreach';

/** The contact fields GHL's workflow and Conversation AI read, named so their keys come out as below. */
const WHATSAPP_FIELDS: ContactFieldSpec[] = [
  { key: 'nome_attivita', name: 'Nome attivita', dataType: 'TEXT' },
  { key: 'citta', name: 'Citta', dataType: 'TEXT' },
  { key: 'servizi', name: 'Servizi', dataType: 'LARGE_TEXT' },
  { key: 'link_demo', name: 'Link demo', dataType: 'TEXT' },
  { key: 'sintesi_email', name: 'Sintesi email', dataType: 'LARGE_TEXT' },
  { key: 'obiezioni_emerse', name: 'Obiezioni emerse', dataType: 'LARGE_TEXT' },
  { key: 'comportamento_demo', name: 'Comportamento demo', dataType: 'TEXT' },
  { key: 'wa_primo_messaggio', name: 'WA primo messaggio', dataType: 'LARGE_TEXT' },
];

/**
 * Writes the first WhatsApp message and its context, retrying once with the broken
 * rules as feedback. Every attempt is billed.
 * @param conversation The conversation.
 * @returns The texts, the rules the message still breaks and the model, or null when the lead never replied.
 * @throws {Error} When no attempt returns a parsable answer, so the job retries.
 */
const writeHandoff = async (conversation: Conversation) => {
  const settings = await getAutomationSettings(conversation.organizationId);
  const context = await loadThread(conversation.id);
  const demo = await getConversationDemo(conversation.id);

  if (!context) {
    return null;
  }

  const demoBehavior = demo ? describeDemoBehavior(demo.summary) : 'Nessuna demo';
  const lead = await loadLeadContext(conversation);
  let issues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const written = await writeWhatsapp({
      model: settings.writingModel,
      offer: buildOfferBrief(settings),
      lead,
      thread: context.thread,
      demoBehavior,
      issues,
    });

    // oxlint-disable-next-line no-await-in-loop
    await recordCopywritingUsage({
      userId: conversation.userId,
      organizationId: conversation.organizationId,
      campaignId: conversation.campaignId,
      sequence: written.call,
    });

    if (written.output) {
      const firstMessage = cleanReply(written.output.primo_messaggio);
      issues = checkWhatsappMessage(firstMessage);

      if (issues.length === 0 || attempt === 1) {
        return {
          firstMessage,
          emailSummary: written.output.sintesi_email.trim(),
          objections: written.output.obiezioni_emerse.trim(),
          demoBehavior,
          issues,
          model: written.call.model,
        };
      }
    }
  }

  throw new Error(`No parsable WhatsApp hand-off for conversation ${conversation.id}`);
};

/**
 * Hands the lead to WhatsApp on GHL: the custom fields the workflow and Conversation AI
 * read, then the tag that starts the workflow. Test conversations stop before GHL.
 * A GHL refusal sends the conversation to a person instead of retrying.
 * @param options The hand-off.
 * @param options.conversation The conversation.
 * @param options.handoff The stored hand-off.
 * @param options.firstMessage The first message, as approved.
 * @param options.approvedByUserId The person who approved it, null in automatic mode.
 * @returns Whether the lead was handed over.
 */
const sendWhatsapp = async (options: {
  conversation: Conversation;
  handoff: Handoff;
  firstMessage: string;
  approvedByUserId: string | null;
}) => {
  const { conversation, handoff } = options;
  const demo = await getConversationDemo(conversation.id);
  const lead = await loadLeadContext(conversation);
  const company = conversation.company ?? lead.company ?? conversation.leadEmail;
  const values = {
    nome_attivita: company,
    citta: lead.city ?? '',
    servizi: (demo?.demo.data.landing.services ?? []).map((service) => service.name).join(', '),
    link_demo: demo?.url ?? '',
    sintesi_email: handoff.emailSummary,
    obiezioni_emerse: handoff.objections,
    comportamento_demo: handoff.demoBehavior,
    wa_primo_messaggio: options.firstMessage,
  };

  if (conversation.isTest) {
    await logEvent({
      conversationId: conversation.id,
      type: 'test_skipped_ghl_whatsapp',
      payload: values,
    });
  } else {
    try {
      const ids = await ensureContactFields(WHATSAPP_FIELDS);
      const contactId = await upsertContact({
        phone: conversation.phoneE164,
        email: conversation.leadEmail,
        name: company,
        companyName: company,
        customFields: toCustomFieldValues(ids, values),
      });

      await addContactTags(contactId, [WHATSAPP_TAG]);
      await db
        .update(conversationSchema)
        .set({ ghlContactId: contactId })
        .where(eq(conversationSchema.id, conversation.id));
    } catch (error) {
      await logEvent({
        conversationId: conversation.id,
        type: 'whatsapp_failed',
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      await setConversationState({ conversation, state: 'manual_review' });

      return false;
    }
  }

  const sentAt = new Date();

  await db
    .update(whatsappHandoffSchema)
    .set({
      status: 'sent',
      firstMessage: options.firstMessage,
      approvedByUserId: options.approvedByUserId,
      sentAt,
    })
    .where(eq(whatsappHandoffSchema.id, handoff.id));

  await db.insert(whatsappMessageSchema).values({
    conversationId: conversation.id,
    direction: 'outbound',
    body: options.firstMessage,
    receivedAt: sentAt,
  });

  await setConversationState({ conversation, state: 'whatsapp' });
  await logEvent({
    conversationId: conversation.id,
    type: 'whatsapp_started',
    payload: { handoffId: handoff.id },
  });

  return true;
};

/**
 * Prepares the hand-off of a silent lead to WhatsApp, once their emails ran out: in
 * automatic mode it goes to GHL at once, otherwise it waits as a draft for a person.
 * @param conversation The conversation the follow-ups closed.
 * @throws {Error} When the AI answer does not parse, so the job retries.
 */
export const prepareWhatsapp = async (conversation: Conversation) => {
  const written = await writeHandoff(conversation);

  // Nothing more is due: the hand-off waits for a person or goes now
  await scheduleNextAction(conversation.id, null);

  if (!written) {
    return;
  }

  const [handoff] = await db
    .insert(whatsappHandoffSchema)
    .values({ conversationId: conversation.id, ...written })
    .onConflictDoNothing()
    .returning();

  // A retried job finds the hand-off its first attempt stored
  if (!handoff) {
    return;
  }

  const settings = await getAutomationSettings(conversation.organizationId);
  const sendsItself =
    settings.enabled &&
    settings.mode === 'auto' &&
    written.issues.length === 0 &&
    isGhlConfigured();

  if (sendsItself) {
    await sendWhatsapp({
      conversation,
      handoff,
      firstMessage: handoff.firstMessage,
      approvedByUserId: null,
    });

    return;
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'whatsapp_drafted',
    payload: { handoffId: handoff.id, issues: written.issues },
  });
};

/**
 * Finds a conversation's hand-off still waiting for a person.
 * @param options The lookup.
 * @param options.organizationId The organization the conversation must belong to.
 * @param options.conversationId The conversation.
 * @returns The conversation and its draft, or undefined.
 */
const findDraft = async (options: { organizationId: string; conversationId: string }) => {
  const [row] = await db
    .select({ conversation: conversationSchema, handoff: whatsappHandoffSchema })
    .from(whatsappHandoffSchema)
    .innerJoin(conversationSchema, eq(conversationSchema.id, whatsappHandoffSchema.conversationId))
    .where(
      and(
        eq(whatsappHandoffSchema.conversationId, options.conversationId),
        eq(conversationSchema.organizationId, options.organizationId),
        eq(whatsappHandoffSchema.status, 'draft'),
      ),
    );

  return row;
};

/**
 * Approves a drafted hand-off, as edited by a person, and sends it to GHL.
 * @param options The approval.
 * @param options.organizationId The organization the conversation must belong to.
 * @param options.userId The person approving.
 * @param options.conversationId The conversation.
 * @param options.message The first message to send.
 * @returns The outcome.
 */
export const approveWhatsapp = async (options: {
  organizationId: string;
  userId: string;
  conversationId: string;
  message: string;
}) => {
  const row = await findDraft(options);

  if (!row) {
    return { status: 'not_found' as const };
  }

  const settings = await getAutomationSettings(options.organizationId);

  if (!settings.enabled) {
    return { status: 'disabled' as const };
  }

  const firstMessage = cleanReply(options.message);

  // A link would break the "no links on WhatsApp" rule the lead's trust rests on
  if (checkWhatsappMessage(firstMessage).includes('link')) {
    return { status: 'blocked' as const };
  }

  const sent = await sendWhatsapp({
    conversation: row.conversation,
    handoff: row.handoff,
    firstMessage,
    approvedByUserId: options.userId,
  });

  return { status: sent ? ('sent' as const) : ('failed' as const) };
};

/**
 * Drops a drafted hand-off and closes the conversation: the lead gets nothing more.
 * @param options The decision.
 * @param options.organizationId The organization the conversation must belong to.
 * @param options.userId The person deciding, recorded in the log.
 * @param options.conversationId The conversation.
 * @returns Whether a draft was dropped.
 */
export const discardWhatsapp = async (options: {
  organizationId: string;
  userId: string;
  conversationId: string;
}) => {
  const row = await findDraft(options);

  if (!row) {
    return false;
  }

  await db
    .update(whatsappHandoffSchema)
    .set({ status: 'cancelled' })
    .where(eq(whatsappHandoffSchema.id, row.handoff.id));
  await logEvent({
    conversationId: row.conversation.id,
    type: 'whatsapp_cancelled',
    actorUserId: options.userId,
  });
  await setConversationState({
    conversation: row.conversation,
    state: 'closed_no_reply',
    actorUserId: options.userId,
  });

  return true;
};
