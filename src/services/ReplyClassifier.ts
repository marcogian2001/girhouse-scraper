import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import { logger } from '@/libs/Logger';
import type { objectionSchema } from '@/models/Schema';
import { AppConfig } from '@/utils/AppConfig';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { getClient, reasoningFor } from './Claude';
import type { LeadContext, ThreadMessage } from './ReplyPrompt';
import { renderLeadFacts, renderThread, toBilledCall } from './ReplyPrompt';

const MAX_TOKENS = 8000;

type Objection = typeof objectionSchema.$inferSelect;

/** The classifier's answer, in the shape the brief defines. */
const replyClassificationOutputSchema = z.object({
  categoria: z.enum([
    'interessato',
    'domanda',
    'obiezione',
    'non_ora',
    'non_interessato',
    'stop',
    'fuori_ufficio',
    'persona_sbagliata',
    'altro',
  ]),
  tipo_obiezione: z.string().nullable(),
  nuova_obiezione: z
    .object({ titolo: z.string(), descrizione: z.string(), angolo_risposta: z.string() })
    .nullable(),
  telefono_fornito: z.string().nullable(),
  referente_indicato: z.string().nullable(),
  orario_scelto: z.string().nullable(),
  data_rientro: z.string().nullable(),
  confidenza: z.number(),
  motivazione: z.string(),
});

const CLASSIFIER_INSTRUCTIONS = [
  'You read the replies Italian business owners send to a cold email from Girhouse, and classify the latest one.',
  '',
  'Categories (`categoria`):',
  '- interessato: wants to know more, see the demo, be called, or says yes.',
  '- domanda: asks something specific (price, how it works, who we are) without objecting or committing.',
  '- obiezione: pushes back with a reason that can be answered (already has a website, too expensive, no time, bad experience with agencies).',
  '- non_ora: open in principle but not now (busy season, later in the year, "risentiamoci tra qualche mese").',
  '- non_interessato: a polite no, such as "non mi interessa", "non ci serve", "siamo a posto".',
  '- stop: wants no more contact or is hostile: "non scrivetemi più", "toglietemi", "cancellatemi", "rimuovetemi", insults, threats to report us. When unsure between non_interessato and stop, choose stop.',
  '- fuori_ufficio: an automatic out-of-office or holiday reply.',
  '- persona_sbagliata: they are not the right person, or the business belongs to someone else.',
  '- altro: anything else, or a reply you cannot make sense of.',
  '',
  'Rules:',
  "- Instantly's interest label is a hint only. Decide from what the lead wrote.",
  '- Classify only the latest reply. Use the earlier emails for context.',
  '- `tipo_obiezione` is a key from the objection library below, or null. Never invent a key.',
  '- When the reply is an objection that no library entry fits, set `tipo_obiezione` to null and fill `nuova_obiezione` with a short Italian title, a one-line description and the angle a reply should take, consistent with the offer. Otherwise `nuova_obiezione` is null.',
  '- `telefono_fornito`: a phone number the lead gave in the reply or their signature, in E.164 (+39 for Italian numbers), else null.',
  '- `referente_indicato`: the name and/or email of the person the lead points to, else null.',
  '- `orario_scelto`: the call time the lead picks or proposes, as YYYY-MM-DDTHH:mm in Italian time. Resolve "il primo", "giovedì" or "domani alle 10" against today and the times Girhouse offered. Null when the lead names no specific day and hour.',
  '- `data_rientro`: for out-of-office replies, the return date as YYYY-MM-DD when stated, else null.',
  '- `confidenza`: how sure you are, from 0 to 1.',
  '- `motivazione`: one line in Italian explaining the choice.',
].join('\n');

/**
 * Renders the objection library the classifier must pick from.
 * @param objections The organization's objections.
 * @returns The library as text, or a note that it is empty.
 */
export const buildObjectionLibrary = (objections: Objection[]) => {
  if (objections.length === 0) {
    return '## Objection library\n(empty)';
  }

  const entries = objections.map((objection) =>
    [
      `- key: ${objection.key}`,
      `  title: ${objection.title}`,
      `  description: ${objection.description}`,
      objection.examples.length > 0 ? `  examples: ${objection.examples.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return `## Objection library\n${entries.join('\n')}`;
};

/**
 * Renders the per-reply half of the prompt: the business, the thread and the reply.
 * @param options The prompt inputs.
 * @param options.lead What the platform knows about the business.
 * @param options.thread The earlier emails, oldest first.
 * @param options.reply The lead's latest reply, without the quoted thread.
 * @param options.interestLabel The label Instantly gave the reply, if any.
 * @param options.today Today's date, so relative dates can be resolved.
 * @param options.offeredSlots The call times the last Girhouse email offered, with their labels.
 * @returns The prompt text.
 */
export const buildReplyPrompt = (options: {
  lead: LeadContext;
  thread: ThreadMessage[];
  reply: string;
  interestLabel: string | null;
  today: Date;
  offeredSlots: { key: string; label: string }[];
}) => {
  const lead = renderLeadFacts(options.lead);
  const thread = renderThread(options.thread);

  const today = options.today.toLocaleDateString('en-CA', { timeZone: AppConfig.timeZone });

  return [
    `Today is ${today}.`,
    lead ? `## Business\n${lead}` : '',
    thread ? `## Earlier emails\n${thread}` : '',
    options.offeredSlots.length > 0
      ? `## Call times offered by Girhouse\n${options.offeredSlots.map((slot) => `- ${slot.key} (${slot.label})`).join('\n')}`
      : '',
    `## Instantly label\n${options.interestLabel ?? 'none'}`,
    `## Latest reply to classify\n${options.reply}`,
  ]
    .filter(Boolean)
    .join('\n\n');
};

/**
 * Classifies a lead's reply with Claude.
 * @param options The call options.
 * @param options.model The Claude model id, from the automation settings.
 * @param options.offer The offer brief, so proposed angles stay consistent with it.
 * @param options.objections The organization's objection library.
 * @param options.lead What the platform knows about the business.
 * @param options.thread The earlier emails, oldest first.
 * @param options.reply The lead's latest reply, without the quoted thread.
 * @param options.interestLabel The label Instantly gave the reply, if any.
 * @param options.offeredSlots The call times the last Girhouse email offered, with their labels.
 * @returns The parsed classification, or null when the answer did not parse, plus the billed call.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const classifyReply = async (options: {
  model: string;
  offer: string;
  objections: Objection[];
  lead: LeadContext;
  thread: ThreadMessage[];
  reply: string;
  interestLabel: string | null;
  offeredSlots: { key: string; label: string }[];
}) => {
  const model = requireCopywritingModel({ id: options.model, provider: 'anthropic' });
  const reasoning = reasoningFor(model.id, 'low');

  const response = await getClient().messages.parse({
    model: model.id,
    max_tokens: MAX_TOKENS,
    thinking: reasoning.thinking,
    output_config: {
      effort: reasoning.effort,
      format: zodOutputFormat(replyClassificationOutputSchema),
    },
    // Identical for every reply of an organization until the library changes
    system: [
      {
        type: 'text',
        text: [
          CLASSIFIER_INSTRUCTIONS,
          `## Offer\n${options.offer}`,
          buildObjectionLibrary(options.objections),
        ].join('\n\n'),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildReplyPrompt({ ...options, today: new Date() }) }],
  });

  logger.info(`Classified a reply with ${model.id}`);

  const call = toBilledCall(response, model);

  return { output: response.parsed_output ?? null, call };
};
