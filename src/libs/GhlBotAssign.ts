import { eq } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import { conversationSchema } from '@/models/Schema';
import {
  addContactTags,
  assignContact,
  assignOpportunity,
  findPipelineOpportunity,
} from '@/services/GoHighLevel';
import { logEvent } from './Conversations';
import { db } from './DB';
import { Env } from './Env';
import { completeJob } from './JobQueue';

type Job = typeof jobSchema.$inferSelect;

/** The tag GHL workflows branch on to hand a lead to the bot instead of the sales reps. */
const BOT_TAG = 'bot-ai';

const assignPayloadSchema = z.object({ conversationId: z.uuid() });

/**
 * Hands a bot-managed lead to the "Bot AI" user on GHL: owns the contact, tags it so the
 * GHL workflows skip the sales reps, and takes over the opportunity they created. Throws
 * while the opportunity is not there yet, so the job retries until the workflow made it.
 * @param job The ghl_bot_assign job being processed.
 * @throws {Error} When GHL rejects a call or the opportunity does not exist yet.
 */
const runGhlBotAssignJob = async (job: Job) => {
  const { conversationId } = assignPayloadSchema.parse(job.payload);
  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, conversationId),
  });
  const userId = Env.GHL_BOT_USER_ID;

  // A booked call belongs to a sales rep, who takes the opportunity from here
  if (!conversation || !userId || conversation.isTest || conversation.state === 'call_booked') {
    await completeJob(job.id);

    return;
  }

  const contactId = await assignContact({ email: conversation.leadEmail, userId });

  await addContactTags(contactId, [BOT_TAG]);

  if (!conversation.ghlContactId) {
    await db
      .update(conversationSchema)
      .set({ ghlContactId: contactId })
      .where(eq(conversationSchema.id, conversation.id));
  }

  const opportunity = await findPipelineOpportunity(contactId);

  if (!opportunity) {
    throw new Error(`No pipeline opportunity yet for GHL contact ${contactId}`);
  }

  if (opportunity.assignedTo !== userId) {
    await assignOpportunity({ opportunityId: opportunity.id, userId });
  }

  await logEvent({
    conversationId: conversation.id,
    type: 'ghl_bot_assigned',
    payload: { contactId, opportunityId: opportunity.id },
  });
  await completeJob(job.id);
};

/**
 * Logs a hand-off to the bot that ran out of attempts. The conversation goes on: only the
 * GHL owner is left to fix by hand.
 * @param job The abandoned ghl_bot_assign job.
 * @param error The last error.
 */
export const markGhlBotAssignAbandoned = async (job: Job, error: string) => {
  const parse = assignPayloadSchema.safeParse(job.payload);

  if (parse.success) {
    await logEvent({
      conversationId: parse.data.conversationId,
      type: 'ghl_bot_assign_failed',
      payload: { error },
    });
  }
};

export const ghlBotJobHandlers = {
  ghl_bot_assign: runGhlBotAssignJob,
};
