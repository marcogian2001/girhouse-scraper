import { eq } from 'drizzle-orm';
import * as z from 'zod';
import type { jobSchema } from '@/models/Schema';
import { conversationSchema, outboundEmailSchema } from '@/models/Schema';
import { renderScarcity, replySubject } from '@/services/ReplyWriter';
import type { NextAction } from '@/utils/FollowUps';
import { FOLLOW_UP_STATES, nextAction } from '@/utils/FollowUps';
import { buildOfferBrief } from '@/utils/Offer';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation } from './Conversations';
import { logEvent, setConversationState } from './Conversations';
import { loadThread } from './ConversationThread';
import { db } from './DB';
import { getConversationDemo } from './Demos';
import { mayFollowUp } from './FollowUpStart';
import { completeJob } from './JobQueue';
import { loadLeadContext } from './LeadContext';
import { scheduleNextAction } from './NextAction';
import { BLOCKING_ISSUES, enqueueSend, writeCheckedReply } from './OutboundEmails';

type Job = typeof jobSchema.$inferSelect;

type ConversationDemo = NonNullable<Awaited<ReturnType<typeof getConversationDemo>>>;

const tickPayloadSchema = z.object({ conversationId: z.uuid(), dueAt: z.string() });

/** How long a follow-up waits while the automation is switched off. */
const KILL_SWITCH_RETRY_MS = 60 * 60 * 1000;

/**
 * Writes one follow-up and sends it now; one that breaks a rule a person must look at
 * waits as a draft instead. The next follow-up is only planned once this one is sent.
 * @param options The follow-up.
 * @param options.conversation The conversation.
 * @param options.action The follow-up to write.
 * @param options.demo The lead's demo, for the link.
 * @throws {Error} When the AI answer does not parse, so the job retries.
 */
const writeFollowUp = async (options: {
  conversation: Conversation;
  action: Extract<NextAction, { type: 'email' }>;
  demo: ConversationDemo;
}) => {
  const { conversation, action } = options;
  const context = await loadThread(conversation);

  if (!context) {
    await scheduleNextAction(conversation.id, null);

    return;
  }

  const settings = await getAutomationSettings(conversation.organizationId);
  const link =
    action.kind === 'demo_complete'
      ? null
      : `${options.demo.url}${action.step ? `?passo=${action.step}` : ''}`;
  const written = await writeCheckedReply(
    {
      model: settings.writingModel,
      offer: buildOfferBrief(settings),
      scarcity: renderScarcity(settings.onboardingSlotsPerMonth),
      category: 'interested',
      objection: null,
      lead: await loadLeadContext(conversation),
      thread: context.thread,
      reply: context.reply,
      call: null,
      followUp: { kind: action.kind, isLast: action.isLast },
      prices: [settings.monthlyPrice],
      demoUrl: link,
      offeredSlots: [],
    },
    conversation,
  );

  const sendsItself = !written.issues.some((issue) => BLOCKING_ISSUES.has(issue));

  const [created] = await db
    .insert(outboundEmailSchema)
    .values({
      conversationId: conversation.id,
      kind: 'follow_up',
      subject: replySubject(context.latest.subject, conversation.company ?? 'Girhouse'),
      body: written.body,
      issues: written.issues,
      status: sendsItself ? 'scheduled' : 'draft',
      scheduledFor: sendsItself ? new Date() : null,
      model: written.model,
    })
    .returning();

  // Nothing more is due until this email goes out
  await scheduleNextAction(conversation.id, null);

  if (!created) {
    return;
  }

  await logEvent({
    conversationId: conversation.id,
    type: sendsItself ? 'follow_up_scheduled' : 'follow_up_drafted',
    payload: { outboundEmailId: created.id, kind: action.kind, issues: created.issues },
  });

  if (sendsItself) {
    await enqueueSend(created);
  }
};

/**
 * Tells whether the lead wrote after the latest email to them, which ends the follow-ups.
 * @param conversation The conversation.
 * @returns True when the lead's latest reply is newer than the latest email to them.
 */
const leadAnsweredLast = (conversation: Conversation) =>
  Boolean(
    conversation.lastInboundAt &&
    conversation.lastOutboundAt &&
    conversation.lastInboundAt > conversation.lastOutboundAt,
  );

/**
 * Runs a follow-up for a lead who went silent after the demo when it falls due.
 * @param job The conversation_tick job being processed.
 */
const runConversationTickJob = async (job: Job) => {
  const { conversationId, dueAt } = tickPayloadSchema.parse(job.payload);

  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, conversationId),
  });

  // Moved or cleared since this job was queued
  if (!conversation || conversation.nextActionAt?.toISOString() !== dueAt) {
    await completeJob(job.id);

    return;
  }

  // Booked, stopped or answered since: the follow-ups are off
  if (!FOLLOW_UP_STATES.has(conversation.state)) {
    await scheduleNextAction(conversationId, null);
    await completeJob(job.id);

    return;
  }

  const settings = await getAutomationSettings(conversation.organizationId);

  if (!settings.enabled) {
    await logEvent({ conversationId, type: 'follow_up_held_kill_switch' });
    await scheduleNextAction(conversationId, new Date(Date.now() + KILL_SWITCH_RETRY_MS));
    await completeJob(job.id);

    return;
  }

  const demo = await getConversationDemo(conversationId);
  const action =
    demo && !leadAnsweredLast(conversation) && (await mayFollowUp(conversation))
      ? nextAction({
          state: conversation.state,
          followUpCount: conversation.followUpCount,
          demo: demo.summary,
        })
      : ({ type: 'none' } as const);

  // The writer clears the due time only once its text is stored, so a failed attempt retries
  await (action.type === 'email' && demo
    ? writeFollowUp({ conversation, action, demo })
    : scheduleNextAction(conversationId, null));

  await completeJob(job.id);
};

/**
 * Hands a follow-up the worker gave up on to a person.
 * @param job The abandoned conversation_tick job.
 * @param error The last error.
 */
export const markConversationTickAbandoned = async (job: Job, error: string) => {
  const parse = tickPayloadSchema.safeParse(job.payload);

  if (!parse.success) {
    return;
  }

  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, parse.data.conversationId),
  });

  if (!conversation) {
    return;
  }

  await scheduleNextAction(conversation.id, null);
  await logEvent({
    conversationId: conversation.id,
    type: 'processing_failed',
    payload: { job: 'conversation_tick', error },
  });
  await setConversationState({ conversation, state: 'manual_review' });
};

export const followUpJobHandlers = {
  conversation_tick: runConversationTickJob,
};
