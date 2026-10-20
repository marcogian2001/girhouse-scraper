import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import { logger } from '@/libs/Logger';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { DEMO_STEPS } from '@/utils/DemoStats';
import { getClient, reasoningFor } from './Claude';
import type { LeadContext, ThreadMessage } from './ReplyPrompt';
import { renderLeadFacts, renderThread, toBilledCall } from './ReplyPrompt';

const MAX_TOKENS = 6000;

/** WhatsApp is read on a phone: a first message longer than this reads like a newsletter. */
const MAX_MESSAGE_CHARS = 420;

const MAX_MESSAGE_LINES = 5;

const whatsappOutputSchema = z.object({
  sintesi_email: z.string(),
  obiezioni_emerse: z.string(),
  primo_messaggio: z.string(),
});

const WHATSAPP_RULES = [
  'You hand a lead over to WhatsApp on behalf of Girhouse. The lead replied yes to a cold email, received the page prepared for their business, and has not answered the last emails. Write three things, in Italian.',
  '',
  '- `sintesi_email`: 2 to 4 lines on what the lead said, what Girhouse proposed and where it stopped. It is context for the WhatsApp assistant, never shown to the lead.',
  '- `obiezioni_emerse`: the doubts or objections the lead raised in the emails, on one line separated by semicolons, or "Nessuna".',
  '- `primo_messaggio`: the first WhatsApp message to the lead.',
  '',
  'Rules for `primo_messaggio`:',
  '- 2 to 4 short lines, human and warm, like a person of the team writing from their phone. Use "tu" or "lei" as the emails did.',
  '- Reconnect to the emails and to the page they saw, in a few words. One question only, easy to answer.',
  '- No links, no prices, dates or results that are not in the facts below. Never use em dashes or en dashes. At most one emoji.',
  '- Sign with the first name that signs the earlier Girhouse emails; if none does, do not sign.',
].join('\n');

/**
 * Names how far the lead went through their demo, for the GHL contact field.
 * @param summary The demo summary.
 * @param summary.behavior Whether it was opened, and how far.
 * @param summary.maxStep The furthest step reached.
 * @returns A short Italian label.
 */
export const describeDemoBehavior = (summary: {
  behavior: 'not_opened' | 'partial' | 'complete';
  maxStep: number;
}) => {
  if (summary.behavior === 'not_opened') {
    return 'Non aperta';
  }

  return summary.behavior === 'complete'
    ? 'Vista tutta'
    : `Vista fino al passo ${summary.maxStep} di ${DEMO_STEPS}`;
};

/**
 * Checks the first WhatsApp message against the rules a model can get wrong.
 * @param message The message, already cleaned.
 * @returns The broken rules, empty when it can go out.
 */
export const checkWhatsappMessage = (message: string) => {
  const issues: string[] = [];
  const lines = message.split('\n').filter((line) => line.trim());

  if (/(?:https?:\/\/|www\.)\S+/iu.test(message)) {
    issues.push('link');
  }

  if (message.length > MAX_MESSAGE_CHARS || lines.length > MAX_MESSAGE_LINES) {
    issues.push('too_long');
  }

  if (lines.length === 0 || message.trim().length < 20) {
    issues.push('too_short');
  }

  return issues;
};

/** What the writer needs to hand a lead over to WhatsApp. */
export type WriteWhatsappOptions = {
  model: string;
  offer: string;
  lead: LeadContext;
  thread: ThreadMessage[];
  demoBehavior: string;
  // Rules a previous attempt broke, so the next one avoids them
  issues: string[];
};

/**
 * Renders the per-lead half of the WhatsApp prompt.
 * @param options The writer inputs.
 * @returns The prompt text.
 */
export const buildWhatsappPrompt = (options: WriteWhatsappOptions) =>
  [
    `## Business\n${renderLeadFacts(options.lead) || '(nothing known)'}`,
    `## How they went through their page\n${options.demoBehavior}`,
    `## The emails\n${renderThread(options.thread)}`,
    options.issues.length > 0
      ? `## Fix these problems of the previous attempt\n${options.issues.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

/**
 * Writes the email summary, the objections and the first WhatsApp message with Claude.
 * @param options The writer inputs.
 * @returns The three texts, or null when the answer did not parse, plus the billed call.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const writeWhatsapp = async (options: WriteWhatsappOptions) => {
  const model = requireCopywritingModel({ id: options.model, provider: 'anthropic' });
  const reasoning = reasoningFor(model.id, 'low');

  const response = await getClient().messages.parse({
    model: model.id,
    max_tokens: MAX_TOKENS,
    thinking: reasoning.thinking,
    output_config: { effort: reasoning.effort, format: zodOutputFormat(whatsappOutputSchema) },
    // Identical for every hand-off of an organization until its offer changes
    system: [
      {
        type: 'text',
        text: `${WHATSAPP_RULES}\n\n## Offer\n${options.offer}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildWhatsappPrompt(options) }],
  });

  logger.info(`Wrote a WhatsApp hand-off with ${model.id}`);

  return { output: response.parsed_output ?? null, call: toBilledCall(response, model) };
};
