import { eq } from 'drizzle-orm';
import { conversationSchema } from '@/models/Schema';
import { db } from './DB';
import { enqueue } from './JobQueue';

/**
 * Sets when a silent lead's next follow-up is due, and queues the job that runs it then.
 * A job whose due time no longer matches the conversation does nothing, so moving or
 * clearing the time is enough to call off an earlier one.
 * @param conversationId The conversation.
 * @param at When the next step is due, or null to stop the follow-ups.
 * @param executor The transaction to clear the time in, when there is one.
 */
export const scheduleNextAction = async (
  conversationId: string,
  at: Date | null,
  executor: Pick<typeof db, 'update'> = db,
) => {
  await executor
    .update(conversationSchema)
    .set({ nextActionAt: at })
    .where(eq(conversationSchema.id, conversationId));

  if (at) {
    await enqueue([
      {
        type: 'conversation_tick',
        payload: { conversationId, dueAt: at.toISOString() },
        runAfter: at,
      },
    ]);
  }
};
