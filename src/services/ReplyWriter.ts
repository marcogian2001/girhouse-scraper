import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import { logger } from '@/libs/Logger';
import { AppConfig } from '@/utils/AppConfig';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import type { FollowUpKind } from '@/utils/FollowUps';
import { DEMO_LINK_PLACEHOLDER, SLOTS_PLACEHOLDER } from '@/utils/ReplyGuard';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import { getClient, reasoningFor } from './Claude';
import type { LeadContext, ThreadMessage } from './ReplyPrompt';
import { renderLeadFacts, renderThread, toBilledCall } from './ReplyPrompt';

const MAX_TOKENS = 8000;

const replyOutputSchema = z.object({ corpo: z.string() });

/** The categories that get an answer, and what that answer does. */
const REPLY_GUIDANCE: Partial<Record<ReplyCategory, string>> = {
  interested: `The lead is interested. Thank them in a few words, say you prepared a page showing how it would work for their business, put ${DEMO_LINK_PLACEHOLDER} alone on its own line, and ask them to take a look. That is the only call to action.`,
  question:
    'Answer the question briefly, using only the offer and the facts below. If the answer is not there, do not guess: say it is quicker to explain in a short call. Then ask whether they want to see the page prepared for their business.',
  objection:
    'Answer the objection following the angle from the objection library entry below, in your own words. The angle wins over everything else here: end with the call to action it gives, make no proposal when it says to make none, and only when it gives no call to action ask whether they want to see the page prepared for their business.',
  not_now:
    'Accept the timing. Explain the offer a little better in one or two lines and mention the real scarcity below. End with one light question, such as whether you can write again in a few weeks.',
  not_interested:
    'This is the only email after a no. Re-explain the offer clearly: a new landing page plus the complete Go High Level setup at the monthly price, with the first week free and no card. End with a low-pressure line saying a reply is enough if they change their mind.',
  wrong_person:
    'Thank them for pointing you to the right person and say you will write to them directly. Ask nothing else.',
};

/** What the reply does about the call: offer two times, confirm a booking, or say a time is gone. */
export type CallPlan = { kind: 'offer' } | { kind: 'booked'; when: string } | { kind: 'taken' };

const SLOT_RULE = `the two free times are filled in for you, so never write a day or a time yourself`;

/**
 * Renders what the reply says about the call.
 * @param call The call plan, if the reply has one.
 * @returns The guidance, or an empty string.
 */
const callGuidance = (call: CallPlan | null) => {
  if (call?.kind === 'offer') {
    return `After the demo link, add one line offering a short call instead, ending with ${SLOTS_PLACEHOLDER}: ${SLOT_RULE}.`;
  }

  if (call?.kind === 'taken') {
    return `The time the lead asked for is no longer free. Say so in a few words and propose the other two in one line ending with ${SLOTS_PLACEHOLDER}: ${SLOT_RULE}. No other call to action.`;
  }

  return '';
};

/** What each follow-up to a silent lead does. */
const FOLLOW_UP_GUIDANCE: Record<FollowUpKind, string> = {
  demo_not_opened: `You sent the link to the page prepared for their business a few days ago and it was never opened. Ask lightly whether it arrived, put ${DEMO_LINK_PLACEHOLDER} alone on its own line again, and ask nothing else. No guilt, no pressure.`,
  demo_partial: `The lead opened the page prepared for their business but stopped halfway. Say in a few words that the most useful part comes next, put ${DEMO_LINK_PLACEHOLDER} alone on its own line (it opens where they stopped), and say you can also explain it in two minutes on the phone.`,
  demo_complete:
    'The lead watched the whole page prepared for their business but did not book the call. Ask simply, without pressure, what held them back. That question is the only call to action: no link.',
  closing: `This is the last email of the sequence. Say you will not write again about this, recall the real scarcity below in one line, and propose a short call in one line ending with ${SLOTS_PLACEHOLDER}: ${SLOT_RULE}. No link.`,
  nurturing:
    'The lead said "not now" a while ago and asked to be contacted later. Write a short, warm check-in: one line on what the system does for a business like theirs, the real scarcity, and one light question asking whether now is a better time. No link.',
};

/**
 * Picks what the reply does: a follow-up's guidance, the category's guidance, or the
 * booking confirmation once the lead's time is on the calendar.
 * @param options The writer inputs.
 * @returns The guidance for this reply.
 */
const guidanceFor = (options: Pick<WriteReplyOptions, 'category' | 'call' | 'followUp'>) => {
  if (options.followUp) {
    return FOLLOW_UP_GUIDANCE[options.followUp];
  }

  if (options.call?.kind === 'booked') {
    return `The lead picked a time and the call is booked for ${options.call.when}. Thank them, confirm the day and time in one line, and say someone from the Girhouse team will call them then, with a reminder first. Ask nothing else and add no link.`;
  }

  // The lead asked for a time: the slots answer replaces the category's call to action
  if (options.call?.kind === 'taken') {
    return callGuidance(options.call);
  }

  return [REPLY_GUIDANCE[options.category] ?? '', callGuidance(options.call)]
    .filter(Boolean)
    .join(' ');
};

const WRITING_RULES = [
  'You answer, on behalf of Girhouse, a lead who replied to a cold email. Write the body of the reply.',
  '',
  'Rules:',
  '- Italian. Human and direct, one business owner to another. No marketing language, never "AI Employee", never "sostituiamo il tuo dipendente". The automation is "un sistema che ti dà una mano", with an Italian team behind it.',
  '- 3 to 6 lines, plus the greeting and the signature. One call to action only.',
  '- Never use em dashes or en dashes.',
  '- Stay consistent with the thread: do not repeat what was already said, answer what the lead actually wrote.',
  '- Never quote data, results, prices or deadlines that are not in the business facts or the offer below. No links, unless the instructions give a placeholder.',
  '- Plain text, no subject line. Greet by first name when known. Use "tu" or "lei" as the earlier Girhouse emails did.',
  '- Sign with the first name that signs the earlier Girhouse emails; if none does, do not sign.',
].join('\n');

/**
 * Builds the reply subject: the thread's own subject, as a reply.
 * @param subject The subject of the lead's reply, if known.
 * @param fallback What to reply to when the subject is unknown.
 * @returns A subject starting with "Re:".
 */
export const replySubject = (subject: string | null, fallback: string) => {
  const base = subject?.trim() ? subject.trim() : fallback;

  return /^re:/iu.test(base) ? base : `Re: ${base}`;
};

/**
 * Renders the scarcity a reply may use for this lead.
 * @param options The scarcity inputs.
 * @param options.slots How many new businesses are taken each month.
 * @param options.newPrice The monthly price after the increase.
 * @param options.increaseOn When the price goes up for this lead, if known.
 * @param options.now The current time.
 * @returns The scarcity, without the price increase once its date has passed.
 */
export const renderScarcity = (options: {
  slots: number;
  newPrice: number;
  increaseOn: Date | null;
  now: Date;
}) => {
  const lines = [`Prendiamo solo ${options.slots} nuove attività al mese.`];

  if (options.increaseOn && options.increaseOn > options.now) {
    const date = options.increaseOn.toLocaleDateString('it-IT', {
      timeZone: AppConfig.timeZone,
      day: 'numeric',
      month: 'long',
    });

    lines.push(`Dal ${date} il prezzo per questa attività sale a ${options.newPrice}€/mese.`);
  }

  return lines.join(' ');
};

/** What the writer needs to answer one reply. */
export type WriteReplyOptions = {
  model: string;
  offer: string;
  scarcity: string;
  category: ReplyCategory;
  objection: { title: string; responseAngle: string } | null;
  lead: LeadContext;
  thread: ThreadMessage[];
  reply: string;
  // What the reply does about the call, when the calendar is connected
  call: CallPlan | null;
  // Set for an email to a lead who went silent; `reply` is then their last reply
  followUp?: FollowUpKind;
  // Rules a previous attempt broke, so the next one avoids them
  issues: string[];
};

/**
 * Renders the per-reply half of the writer prompt.
 * @param options The writer inputs.
 * @returns The prompt text.
 */
export const buildWriterPrompt = (options: WriteReplyOptions) =>
  [
    `## What this reply does\n${guidanceFor(options)}`,
    options.objection
      ? `## Objection library entry\n${options.objection.title}\nAngle: ${options.objection.responseAngle}`
      : '',
    `## Real scarcity\n${options.scarcity}`,
    `## Business\n${renderLeadFacts(options.lead) || '(nothing known)'}`,
    options.thread.length > 0 ? `## Earlier emails\n${renderThread(options.thread)}` : '',
    options.followUp
      ? `## The lead's last reply, a while ago\n${options.reply}`
      : `## The lead's reply\n${options.reply}`,
    options.issues.length > 0
      ? `## Fix these problems of the previous attempt\n${options.issues.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

/**
 * Writes the body of a reply with Claude.
 * @param options The writer inputs.
 * @returns The body, or null when the answer did not parse, plus the billed call.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const writeReply = async (options: WriteReplyOptions) => {
  const model = requireCopywritingModel({ id: options.model, provider: 'anthropic' });
  const reasoning = reasoningFor(model.id, 'medium');

  const response = await getClient().messages.parse({
    model: model.id,
    max_tokens: MAX_TOKENS,
    thinking: reasoning.thinking,
    output_config: { effort: reasoning.effort, format: zodOutputFormat(replyOutputSchema) },
    // Identical for every reply of an organization until its offer changes
    system: [
      {
        type: 'text',
        text: `${WRITING_RULES}\n\n## Offer\n${options.offer}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildWriterPrompt(options) }],
  });

  logger.info(`Wrote a ${options.followUp ?? options.category} email with ${model.id}`);

  return { body: response.parsed_output?.corpo ?? null, call: toBilledCall(response, model) };
};
