import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import type { VslWrittenLine } from '@/components/demo/vsl/VslScript';
import { VSL_WRITTEN_LINES } from '@/components/demo/vsl/VslScript';
import { logger } from '@/libs/Logger';
import type { DemoSnapshot, DemoVsl } from '@/models/Schema';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { findSectorPainPoints, renderPainPlaybook } from '@/utils/DemoPainPoints';
import { cleanReply } from '@/utils/ReplyGuard';
import { getClient, reasoningFor } from './Claude';
import { toBilledCall } from './ReplyPrompt';

const MAX_TOKENS = 8000;

const MAX_PAINS = 3;

const MAX_CHAT_MESSAGES = 10;

const MAX_REMINDER_MESSAGES = 5;

const messageSchema = z.object({
  da: z.enum(['cliente', 'attivita']),
  testo: z.string(),
  opzioni: z.array(z.string()),
});

const vslTextsSchema = z.object({
  dolori: z.array(z.string()),
  chat: z.object({
    nome_cliente: z.string(),
    servizio: z.string().nullable(),
    nota: z.string().nullable(),
    messaggi: z.array(messageSchema),
  }),
  promemoria: z.object({
    titolo: z.string(),
    nome_cliente: z.string(),
    messaggi: z.array(messageSchema),
  }),
  follow_up: z.object({
    nome_cliente: z.string(),
    quando: z.string(),
    whatsapp: z.string(),
    oggetto_email: z.string(),
    testo_email: z.string(),
  }),
  // One per line of `VSL_WRITTEN_LINES`, which `satisfies` keeps in step
  battute: z.object({
    intro: z.string().nullable(),
    landing_hero: z.string().nullable(),
    landing_services: z.string().nullable(),
    landing_about: z.string().nullable(),
    landing_highlights: z.string().nullable(),
    landing_steps: z.string().nullable(),
    landing_faq: z.string().nullable(),
    chat_start: z.string().nullable(),
    chat_slots: z.string().nullable(),
    chat_booked: z.string().nullable(),
    reminder: z.string().nullable(),
    crm_contact: z.string().nullable(),
    crm_timeline: z.string().nullable(),
    crm_pipeline: z.string().nullable(),
    crm_inbox: z.string().nullable(),
    followup: z.string().nullable(),
  } satisfies Record<VslWrittenLine, z.ZodNullable<z.ZodString>>),
});

export type DemoVslTexts = z.infer<typeof vslTextsSchema>;

/** What each scene shows while Gigi says its line, so the line describes what is on screen. */
const SCENES: Record<VslWrittenLine, string> = {
  intro:
    'Gigi a tutto schermo, prima di tutto il resto. Saluta, dice che la demo è fatta per questa attività e annuncia uno o due problemi del suo settore che le mostrerà come risolvere.',
  landing_hero:
    "La nuova pagina web dell'attività, la parte in alto: titolo, foto e pulsanti per prenotare e scrivere su WhatsApp.",
  landing_services: 'La sezione dei servizi della pagina.',
  landing_about: 'La sezione "chi siamo" della pagina.',
  landing_highlights: 'La sezione "perché sceglierci" della pagina.',
  landing_steps: 'La sezione che spiega il percorso passo dopo passo.',
  landing_faq: 'Le domande frequenti della pagina.',
  chat_start:
    "Inizia la chat WhatsApp di esempio: il cliente della chat scrive mentre l'attività è occupata e riceve una risposta automatica dopo 30 secondi, a nome dell'attività.",
  chat_slots:
    'Nella chat il sistema ascolta il problema del cliente, risponde con empatia e propone due orari liberi presi dal calendario.',
  chat_booked:
    "Il cliente sceglie l'orario: appuntamento fissato, con promemoria. Il titolare non ha fatto nulla.",
  reminder:
    'Una seconda chat WhatsApp: il promemoria automatico tipico di questo settore (il `promemoria`), che parte da solo e porta il cliente a prenotare o confermare.',
  crm_contact:
    'Il gestionale: la scheda del cliente della chat, compilata da sola con da dove arriva, cosa gli serve e quando viene.',
  crm_timeline:
    'La timeline del cliente: ogni passo tracciato, dalla chiamata persa al promemoria.',
  crm_pipeline:
    'La pipeline: il cliente avanza da nuovo contatto ad appuntamento fissato, con la nota scritta in automatico dalla chat.',
  crm_inbox:
    "Un'unica inbox: chiamate, WhatsApp ed email dello stesso cliente in una sola conversazione, e si risponde da lì.",
  followup:
    "L'automazione per chi non risponde (il `follow_up`): aspetta, manda un WhatsApp, poi un'email, poi avvia la chiamata, e si ferma da sola appena il cliente risponde.",
};

const INSTRUCTIONS = [
  'You write version B of the demo Girhouse sends an Italian small business that showed interest: a video Gigi, a friendly giraffe, narrates on his own while the screens play. It never stops and nobody presses a button. Gigi talks to the owner, using "tu".',
  '',
  "The goal: the owner must recognise their own working day. Pick from the playbook below the pains that fit this business best, and make every screen about them: the example chat, the reminder, the follow-up and each of Gigi's lines. A mechanic hears about inspection reminders and quotes answered too late, an osteopath about session reminders and patients who skip, a lawyer about calls lost during hearings.",
  '',
  'Rules for every text:',
  '- Italian, plain, warm, short sentences. Never use em dashes or en dashes.',
  '- Never invent facts about this business (numbers, staff, problems they have). The pains are what businesses like this one live: say them as something common ("capita spesso", "so che"), not as facts about them, unless the notes from the Girhouse team say so.',
  '- The notes from the Girhouse team are true and say what to stress: follow them.',
  '- Respect what the playbook says to be careful about (for example, never pushy reminders in healthcare).',
  '',
  '`dolori`: the 2 or 3 pains from the playbook this business most likely lives, in a short Italian sentence each.',
  '',
  'Example WhatsApp chat (`chat`), clearly an example, about the first pain:',
  '- `nome_cliente`: a common Italian first name for the invented customer.',
  '- `servizio`: the service the customer asks about, one of the listed services when there are any, else null.',
  '- `messaggi`: 8 to 10 short messages, each under 220 characters, sounding like real people.',
  '  1. The customer writes first, about something tied to the pain (for example a quote for a noise in the car, a back pain that came back, a dismissal letter).',
  '  2. The business answers at once, kindly, by first name, and asks what they need.',
  '  3. The customer explains their situation in a personal way.',
  '  4. The business FIRST acknowledges it with empathy in one or two sentences, THEN proposes exactly two times as `opzioni` such as "Martedì alle 16:00" and "Giovedì alle 17:30".',
  '  5. The customer picks one: its `testo` is exactly one of the two options.',
  '  6. The business confirms with day and time, says a reminder will arrive the day before, with a caring touch tied to what the customer said.',
  '  7. The customer thanks; the business closes warmly.',
  '- `opzioni` is empty on every other message. No prices, no addresses, no medical, legal or tax advice, no promises beyond booking.',
  '- `nota`: one line the business would write in its CRM about this customer, only from what the customer said.',
  '',
  "The reminder (`promemoria`): the recurring reminder this kind of business sends, from the playbook (for example the car's yearly inspection, the check-up a few weeks after the treatment, the next haircut).",
  '- `titolo`: 2 to 4 words naming it, for example "Promemoria revisione".',
  '- `nome_cliente`: another common Italian first name.',
  '- `messaggi`: 3 to 5 messages. The business writes first: the automatic reminder with a concrete detail (the car model, the treatment, the date), kind and never pushy, offering two times as `opzioni`. The customer picks one, exactly as written. The business confirms. `opzioni` empty on the other messages.',
  '',
  'The follow-up (`follow_up`): the automation chasing the customer this business most often loses, from the playbook.',
  '- `nome_cliente`: another common Italian first name.',
  '- `quando`: what started it, under 50 characters, with the name (for example "Luca non risponde al preventivo da 24 ore").',
  '- `whatsapp`: the WhatsApp message it sends, under 160 characters, kind, by first name.',
  '- `oggetto_email`: the email subject, under 60 characters. `testo_email`: the email, two sentences, under 260 characters.',
  '',
  "Gigi's lines (`battute`): one per screen, read aloud by a voice while the screen plays.",
  '- 1 to 3 short spoken sentences, at most 260 characters, natural to hear. No lists, no symbols, no abbreviations, no numbers written as digits except times and years.',
  '- Each line says what is on screen right now, then why it matters for the pains you picked, with the concrete words of this sector.',
  '- Mark one or two key phrases with `<b>...</b>` (bold) or `<hl>...</hl>` (highlighted), never nested.',
  '- Never tell them to press, tap or click anything: the demo plays on its own.',
  '- Use the real names: the business, and the customer names you wrote for the chat, the reminder and the follow-up.',
  '- Null for a landing section the page does not have.',
  "- The screens, with version A's generic line as a reference for length and tone:",
].join('\n');

/**
 * Lists the screens Gigi speaks on, with version A's generic line for each.
 * @param options What the page shows.
 * @param options.sections The landing sections the page has.
 * @param options.referenceLines Version A's line for each screen, as plain text.
 * @returns The screens, one per line.
 */
const renderScreens = (options: {
  sections: string[];
  referenceLines: Partial<Record<VslWrittenLine, string>>;
}) =>
  VSL_WRITTEN_LINES.map((line) => {
    const isMissing = line.startsWith('landing_') && !options.sections.includes(line.slice(8));
    const reference = options.referenceLines[line];

    return `- \`${line}\`: ${isMissing ? 'NOT ON THIS PAGE, write null.' : SCENES[line]}${reference && !isMissing ? ` Version A says: "${reference}"` : ''}`;
  }).join('\n');

/**
 * Renders what the AI knows about the business, from the demo already built.
 * @param options The sources.
 * @param options.data The demo snapshot.
 * @param options.notes What the Girhouse team wrote about the business.
 * @returns One labelled fact per line, unknown ones left out.
 */
const renderBusiness = (options: { data: DemoSnapshot; notes: string | null }) => {
  const { data } = options;

  return [
    ['Business', data.company],
    ['Notes from the Girhouse team', options.notes],
    ['City', data.city],
    ['Google Maps category', data.category],
    ['Other categories', data.categories.join(', ')],
    ['Page headline', data.landing.headline],
    ['About', data.landing.about],
    ['Services', data.landing.services.map((service) => `- ${service.name}`).join('\n')],
    [
      'Why customers choose it',
      (data.landing.highlights ?? []).map((item) => `- ${item.title}: ${item.text}`).join('\n'),
    ],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `## ${label}\n${value}`)
    .join('\n\n');
};

/**
 * Writes version B's script with Claude, from the demo already built and the sales calls' pain points.
 * @param options The call options.
 * @param options.model The Claude model id.
 * @param options.data The demo snapshot.
 * @param options.notes What the Girhouse team told the demo to use, if anything.
 * @param options.sections The landing sections the page has.
 * @param options.referenceLines Version A's line for each screen, as plain text.
 * @returns The texts, or null when the answer did not parse, plus the billed call.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const writeDemoVsl = async (options: {
  model: string;
  data: DemoSnapshot;
  notes: string | null;
  sections: string[];
  referenceLines: Partial<Record<VslWrittenLine, string>>;
}) => {
  const model = requireCopywritingModel({ id: options.model, provider: 'anthropic' });
  const reasoning = reasoningFor(model.id, 'low');
  const sector = findSectorPainPoints(options.data);

  const response = await getClient().messages.parse({
    model: model.id,
    max_tokens: MAX_TOKENS,
    thinking: reasoning.thinking,
    output_config: { effort: reasoning.effort, format: zodOutputFormat(vslTextsSchema) },
    system: [
      INSTRUCTIONS,
      renderScreens(options),
      '',
      '# Pain points from the sales calls',
      renderPainPlaybook(sector),
    ].join('\n'),
    messages: [{ role: 'user', content: renderBusiness(options) }],
  });

  logger.info(`Wrote version B of the demo for ${options.data.company} with ${model.id}`);

  return { texts: response.parsed_output ?? null, call: toBilledCall(response, model) };
};

/**
 * Cleans the messages of one of the example chats.
 * @param messages The AI's messages.
 * @param max How many to keep.
 * @returns The messages, with buttons only on the business's side.
 */
const toMessages = (messages: DemoVslTexts['chat']['messaggi'], max: number) =>
  messages
    .slice(0, max)
    .map((message) => ({
      from: message.da === 'cliente' ? ('customer' as const) : ('business' as const),
      text: cleanReply(message.testo),
      options: message.da === 'attivita' ? message.opzioni.map((option) => cleanReply(option)) : [],
    }))
    .filter((message) => message.text);

/**
 * Turns the AI's texts into the version B a demo stores, cleaned of the dashes the
 * writing rules forbid and trimmed to what the screens have room for.
 * @param texts The parsed AI answer.
 * @returns Version B, waiting for its voice.
 */
export const toDemoVsl = (texts: DemoVslTexts): Omit<DemoVsl, 'generatedAt'> => ({
  pains: texts.dolori.slice(0, MAX_PAINS).map((pain) => cleanReply(pain)),
  lines: Object.fromEntries(
    Object.entries(texts.battute).flatMap(([line, text]) =>
      text?.trim() ? [[line, cleanReply(text)]] : [],
    ),
  ),
  chat: {
    customerName: cleanReply(texts.chat.nome_cliente),
    service: texts.chat.servizio ? cleanReply(texts.chat.servizio) : null,
    note: texts.chat.nota ? cleanReply(texts.chat.nota) : null,
    messages: toMessages(texts.chat.messaggi, MAX_CHAT_MESSAGES),
  },
  reminder: {
    title: cleanReply(texts.promemoria.titolo),
    customerName: cleanReply(texts.promemoria.nome_cliente),
    messages: toMessages(texts.promemoria.messaggi, MAX_REMINDER_MESSAGES),
  },
  followUp: {
    customerName: cleanReply(texts.follow_up.nome_cliente),
    trigger: cleanReply(texts.follow_up.quando),
    whatsapp: cleanReply(texts.follow_up.whatsapp),
    emailSubject: cleanReply(texts.follow_up.oggetto_email),
    emailBody: cleanReply(texts.follow_up.testo_email),
  },
  voice: 'pending',
});
