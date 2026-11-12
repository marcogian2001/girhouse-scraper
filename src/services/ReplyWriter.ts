import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import { logger } from '@/libs/Logger';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import type { FollowUpKind } from '@/utils/FollowUps';
import { DEMO_LINK_PLACEHOLDER, SLOTS_PLACEHOLDER } from '@/utils/ReplyGuard';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import type { NotInterestedVersion } from '@/validations/AutomationValidation';
import { getClient, reasoningFor } from './Claude';
import type { LeadContext, ThreadMessage } from './ReplyPrompt';
import { renderLeadFacts, renderThread, toBilledCall } from './ReplyPrompt';

const MAX_TOKENS = 8000;

const replyOutputSchema = z.object({ corpo: z.string() });

/** The categories that get an answer, and what that answer does. */
const REPLY_GUIDANCE: Partial<Record<ReplyCategory, string>> = {
  interested: `The lead is interested. Thank them in a few words, say you prepared a page showing how it would work for their business, put ${DEMO_LINK_PLACEHOLDER} alone on its own line, and ask them to take a look. That is the only call to action: never propose a call, since the page itself proposes one at its end.`,
  question:
    'Answer the question briefly, using only the offer and the facts below. If the answer is not there, do not guess: say it is quicker to explain in a short call. Then ask whether they want to see the page prepared for their business.',
  objection:
    'Answer the objection following the angle from the objection library entry below, in your own words. The angle wins over everything else here: end with the call to action it gives, make no proposal when it says to make none, and only when it gives no call to action ask whether they want to see the page prepared for their business.',
  not_now:
    'Accept the timing. Explain the offer a little better in one or two lines and mention the real scarcity below. End with one light question, such as whether you can write again in a few weeks.',
  not_interested: `The lead said no. This is the only email after a no, so be careful: a no that gets a sales pitch annoys. Be kind and helpful, never pushy. Thank them for answering and respect the no in a few words. Then, in one or two lines, present the offer as almost a gift: first what it includes, the new landing page plus phone, WhatsApp and email in one place, with automatic replies and follow-ups, and only then that it all comes for the monthly price of the offer below. Then offer the demo lightly, asking permission: you already prepared a short page showing how it would work for their business, you can send it over if they want, and if it does not interest them you will simply delete it. No link, no deadline, no scarcity, nothing else to ask.`,
  wrong_person:
    'Thank them for pointing you to the right person and say you will write to them directly. Ask nothing else.',
};

/** What the reply does about the call the lead asked for: confirm the booking, or say the time is gone. */
export type CallPlan = { kind: 'booked'; when: string } | { kind: 'taken' };

const SLOT_RULE = `the two free times are filled in for you, so never write a day or a time yourself`;

// The first link expired after 24 hours, so a follow-up sending it again says it is live once more
const REACTIVATED_RULE =
  'say in the line right after it that you reactivated the page for another 24 hours, instead of saying it stays active for 24 hours';

/** What each follow-up to a lead who went silent after the demo does. */
const FOLLOW_UP_GUIDANCE: Record<FollowUpKind, string> = {
  demo_not_opened: `You sent the link to the page prepared for their business and it was never opened. Ask lightly whether it arrived, put ${DEMO_LINK_PLACEHOLDER} alone on its own line again, ${REACTIVATED_RULE}, and ask nothing else. No guilt, no pressure.`,
  demo_complete:
    'The lead watched the whole page prepared for their business but did not answer. Ask simply, without pressure, what held them back. That question is the only call to action: no link.',
};

// The second follow-up is the last email that leaves on its own
const LAST_FOLLOW_UP_RULE =
  'This is your second follow-up: make it shorter than the one before and do not repeat its words. Never say it is the last email.';

/** What a new email does when the lead has not answered the latest one, and what it leads to. */
export type NudgeStep = 'offer_demo' | 'resend_demo' | 'propose_call';

const NUDGE_INTRO =
  'The lead has not answered your latest email yet and you write again before they do. Be more proactive than a usual reply: pick up the thread of your latest email without repeating it, give one concrete reason to act now that fits their business (such as the requests a business like theirs loses while the owner is busy working), and end with one direct question. Never sound like you are chasing them, never apologise for writing again, and never quote numbers that are not below.';

const NUDGE_GUIDANCE: Record<NudgeStep, string> = {
  offer_demo: `${NUDGE_INTRO} Then ask directly whether you can send the page you prepared for their business. No link.`,
  resend_demo: `${NUDGE_INTRO} Put ${DEMO_LINK_PLACEHOLDER} alone on its own line, ${REACTIVATED_RULE}, and ask them directly to take a look at it today.`,
  propose_call: `${NUDGE_INTRO} They already watched the page prepared for their business: propose a short call to set it up for them, in one line ending with ${SLOTS_PLACEHOLDER}: ${SLOT_RULE}. No link.`,
};

/** Version B of the answer to a no: the demo was ready anyway, so its link is shared as a parting gift. */
const NOT_INTERESTED_SHARE_GUIDANCE = `The lead said no. This is the only email after a no: no sales pitch, no price, no scarcity, no question. Follow this model closely, changing only what the thread and the business require:

Ciao {first name},

grazie per avermi risposto, lo apprezzo davvero.

Nessun problema, capisco perfettamente. Visto che avevo già preparato un esempio pratico pensato per {business name}, mi sembrava un peccato non condividerlo: qui sotto trovi la pagina che mostra come funzionerebbe il nostro sistema nel vostro caso, già pronta.

👉 ${DEMO_LINK_PLACEHOLDER}

La pagina resta attiva 24 ore, perché tenerla online ha un costo per noi.

Se un giorno dovesse tornarti utile, sai dove trovarmi.

Buona giornata,
{signature}`;

/** What a "not now" answer does when it leaves days after the reply, picking the talk up again. */
const RECONTACT_NOT_NOW_GUIDANCE =
  "This email leaves days after the lead's reply and picks the conversation up again. Recall in one line what Girhouse proposes for a business like theirs, mention the real scarcity below, and end with one light question: whether they want to see the page prepared for their business. No link.";

/**
 * Picks what the reply does: a new email's or a follow-up's guidance, the category's
 * guidance, or the booking confirmation once the lead's time is on the calendar.
 * @param options The writer inputs.
 * @returns The guidance for this reply.
 */
const guidanceFor = (
  options: Pick<
    WriteReplyOptions,
    'category' | 'call' | 'followUp' | 'nudge' | 'recontactOn' | 'notInterestedVersion'
  >,
) => {
  if (options.nudge) {
    return NUDGE_GUIDANCE[options.nudge];
  }

  if (options.followUp) {
    const guidance = FOLLOW_UP_GUIDANCE[options.followUp.kind];

    return options.followUp.isLast ? `${guidance} ${LAST_FOLLOW_UP_RULE}` : guidance;
  }

  if (options.call?.kind === 'booked') {
    return `The lead picked a time and the call is booked for ${options.call.when}. Thank them, confirm the day and time in one line, and say someone from the Girhouse team will call them then, with a reminder first. Ask nothing else and add no link.`;
  }

  // The lead asked for a time: the slots answer replaces the category's call to action
  if (options.call?.kind === 'taken') {
    return `The time the lead asked for is no longer free. Say so in a few words and propose the other two in one line ending with ${SLOTS_PLACEHOLDER}: ${SLOT_RULE}. No other call to action.`;
  }

  // The answer leaves on a later day: it picks the talk up again rather than promising to
  if (options.recontactOn && options.category === 'not_now') {
    return RECONTACT_NOT_NOW_GUIDANCE;
  }

  if (options.category === 'not_interested' && options.notInterestedVersion === 'b') {
    return NOT_INTERESTED_SHARE_GUIDANCE;
  }

  return REPLY_GUIDANCE[options.category] ?? '';
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
  `- Whenever the email holds ${DEMO_LINK_PLACEHOLDER}, add one short line right after it: the page stays active for 24 hours, because keeping it online has a cost for us, unless "What this reply does" says otherwise. This is the only deadline an email may quote.`,
  '- Never ask the lead to activate, start or try the system: before anything else they must see the page prepared for their business, so every pitch leads to that page. This wins over the objection angle too.',
  '- Never mention a credit card, not even to say none is needed. This wins over the objection angle too.',
  '- When you quote the price, first say everything it includes, then the price.',
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
 * Renders the scarcity a reply may use. Emails never quote a deadline or a price increase,
 * which reads as a sales push: only the limited number of new businesses each month.
 * @param slots How many new businesses are taken each month.
 * @returns The scarcity.
 */
export const renderScarcity = (slots: number) => `Prendiamo solo ${slots} nuove attività al mese.`;

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
  followUp?: { kind: FollowUpKind; isLast: boolean };
  // Set for a new email a person asks for while the latest one is still unanswered
  nudge?: NudgeStep;
  // The day the email leaves, when the lead asked to be contacted again then
  recontactOn?: string;
  // How the answer to a "not interested" reads, version A when not given
  notInterestedVersion?: NotInterestedVersion;
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
    options.recontactOn
      ? `## When this email leaves\n${options.recontactOn}, days after the lead's reply. Write it for that day: never promise to write later and never refer to that day as still to come. Only when the lead asked to be contacted around then, say you are writing as agreed.`
      : '',
    options.objection
      ? `## Objection library entry\n${options.objection.title}\nAngle: ${options.objection.responseAngle}`
      : '',
    `## Real scarcity\n${options.scarcity}`,
    `## Business\n${renderLeadFacts(options.lead) || '(nothing known)'}`,
    options.thread.length > 0 ? `## Earlier emails\n${renderThread(options.thread)}` : '',
    options.followUp || options.nudge
      ? `## The lead's last reply, before your latest emails\n${options.reply}`
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

  logger.info(
    `Wrote a ${options.nudge ?? options.followUp?.kind ?? options.category} email with ${model.id}`,
  );

  return { body: response.parsed_output?.corpo ?? null, call: toBilledCall(response, model) };
};
