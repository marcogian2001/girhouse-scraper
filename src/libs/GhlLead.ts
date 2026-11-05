import { eq } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import { conversationSchema } from '@/models/Schema';
import {
  findContactByEmail,
  findPipelineOpportunity,
  markOpportunityDemoSent,
  updateLeadOpportunity,
  upsertContact,
  upsertLeadOpportunity,
} from '@/services/GoHighLevel';
import type { Conversation } from './Conversations';
import { logEvent } from './Conversations';
import { db } from './DB';
import { completeJob } from './JobQueue';

type Job = typeof jobSchema.$inferSelect;

const leadPayloadSchema = z.object({ conversationId: z.uuid() });

/**
 * Loads the conversation a GHL job is about, unless it is gone or a test.
 * @param job The job being processed.
 * @returns The conversation, or undefined when there is nothing to send to GHL.
 */
const loadJobConversation = async (job: Job) => {
  const { conversationId } = leadPayloadSchema.parse(job.payload);
  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, conversationId),
  });

  return conversation && !conversation.isTest ? conversation : undefined;
};

/**
 * Puts the lead in the sales pipeline with the email source: a new opportunity in the
 * "new lead" stage, or the one a GHL workflow already made, left in its stage.
 * @param conversation The lead's conversation.
 * @returns The GHL contact and opportunity, and whether the opportunity is new.
 * @throws {Error} When GHL rejects a call.
 */
const saveLeadOpportunity = async (conversation: Conversation) => {
  const name = conversation.company ?? conversation.leadEmail;
  const contactId =
    conversation.ghlContactId ??
    (await findContactByEmail(conversation.leadEmail)) ??
    (await upsertContact({
      phone: conversation.phoneE164,
      email: conversation.leadEmail,
      name,
      companyName: name,
    }));
  const existing = await findPipelineOpportunity(contactId);

  if (existing) {
    await updateLeadOpportunity({ opportunityId: existing.id });
  }

  const opportunityId = existing?.id ?? (await upsertLeadOpportunity({ contactId, name }));

  if (!conversation.ghlContactId) {
    await db
      .update(conversationSchema)
      .set({ ghlContactId: contactId })
      .where(eq(conversationSchema.id, conversation.id));
  }

  return { contactId, opportunityId, isNew: !existing };
};

/**
 * Puts a lead who replied in the sales pipeline. Who owns the opportunity is set on GHL.
 * @param job The ghl_lead job being processed.
 * @throws {Error} When GHL rejects a call.
 */
const runGhlLeadJob = async (job: Job) => {
  const conversation = await loadJobConversation(job);

  if (conversation) {
    const { contactId, opportunityId, isNew } = await saveLeadOpportunity(conversation);

    await logEvent({
      conversationId: conversation.id,
      type: 'ghl_lead_saved',
      payload: { contactId, opportunityId, isNew },
    });
  }

  await completeJob(job.id);
};

/**
 * Ticks "Demo Inviata" on the opportunity of a lead who was just sent the demo, putting
 * the lead in the pipeline first when they are not there yet.
 * @param job The ghl_demo_sent job being processed.
 * @throws {Error} When GHL rejects a call.
 */
const runGhlDemoSentJob = async (job: Job) => {
  const conversation = await loadJobConversation(job);

  if (conversation) {
    const { contactId, opportunityId } = await saveLeadOpportunity(conversation);

    await markOpportunityDemoSent({ opportunityId });
    await logEvent({
      conversationId: conversation.id,
      type: 'ghl_demo_sent_saved',
      payload: { contactId, opportunityId },
    });
  }

  await completeJob(job.id);
};

/**
 * Logs a GHL job that failed every attempt. The conversation goes on: only the GHL
 * update is left to do by hand.
 * @param options The abandoned job.
 * @param options.job The job.
 * @param options.error The last error.
 * @param options.type The event to log.
 */
const logAbandoned = async (options: {
  job: Job;
  error: string;
  type: 'ghl_lead_failed' | 'ghl_demo_sent_failed';
}) => {
  const parse = leadPayloadSchema.safeParse(options.job.payload);

  if (parse.success) {
    await logEvent({
      conversationId: parse.data.conversationId,
      type: options.type,
      payload: { error: options.error },
    });
  }
};

/**
 * Logs a lead that could not be put in the sales pipeline after every attempt.
 * @param job The abandoned ghl_lead job.
 * @param error The last error.
 */
export const markGhlLeadAbandoned = async (job: Job, error: string) => {
  await logAbandoned({ job, error, type: 'ghl_lead_failed' });
};

/**
 * Logs a sent demo that could not be ticked on GHL after every attempt.
 * @param job The abandoned ghl_demo_sent job.
 * @param error The last error.
 */
export const markGhlDemoSentAbandoned = async (job: Job, error: string) => {
  await logAbandoned({ job, error, type: 'ghl_demo_sent_failed' });
};

export const ghlLeadJobHandlers = {
  ghl_lead: runGhlLeadJob,
  ghl_demo_sent: runGhlDemoSentJob,
};
