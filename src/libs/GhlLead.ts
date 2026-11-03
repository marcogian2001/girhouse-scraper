import { eq } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import { conversationSchema } from '@/models/Schema';
import {
  findContactByEmail,
  findPipelineOpportunity,
  updateLeadOpportunity,
  upsertContact,
  upsertLeadOpportunity,
} from '@/services/GoHighLevel';
import { isBotManaged, logEvent } from './Conversations';
import { db } from './DB';
import { Env } from './Env';
import { completeJob } from './JobQueue';

type Job = typeof jobSchema.$inferSelect;

const leadPayloadSchema = z.object({ conversationId: z.uuid() });

/**
 * Puts a lead who replied in the sales pipeline with the email source: a new opportunity
 * in the "new lead" stage, or the one a GHL workflow already made, left in its stage. A
 * bot-managed lead's opportunity goes to the "Bot AI" user.
 * @param job The ghl_lead job being processed.
 * @throws {Error} When GHL rejects a call.
 */
const runGhlLeadJob = async (job: Job) => {
  const { conversationId } = leadPayloadSchema.parse(job.payload);
  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, conversationId),
  });

  if (!conversation || conversation.isTest) {
    await completeJob(job.id);

    return;
  }

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
  const assignedTo = (await isBotManaged(conversation)) ? Env.GHL_BOT_USER_ID : undefined;
  const existing = await findPipelineOpportunity(contactId);

  if (existing) {
    await updateLeadOpportunity({ opportunityId: existing.id, assignedTo });
  }

  const opportunityId =
    existing?.id ?? (await upsertLeadOpportunity({ contactId, name, assignedTo }));

  if (!conversation.ghlContactId) {
    await db
      .update(conversationSchema)
      .set({ ghlContactId: contactId })
      .where(eq(conversationSchema.id, conversation.id));
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'ghl_lead_saved',
    payload: { contactId, opportunityId, isNew: !existing },
  });
  await completeJob(job.id);
};

/**
 * Logs a lead that could not be put in the sales pipeline after every attempt. The
 * conversation goes on: only the opportunity is left to make by hand.
 * @param job The abandoned ghl_lead job.
 * @param error The last error.
 */
export const markGhlLeadAbandoned = async (job: Job, error: string) => {
  const parse = leadPayloadSchema.safeParse(job.payload);

  if (parse.success) {
    await logEvent({
      conversationId: parse.data.conversationId,
      type: 'ghl_lead_failed',
      payload: { error },
    });
  }
};

export const ghlLeadJobHandlers = {
  ghl_lead: runGhlLeadJob,
};
