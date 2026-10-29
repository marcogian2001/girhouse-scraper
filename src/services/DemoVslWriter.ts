import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import type { VslPhotoLine, VslWrittenLine } from '@/components/demo/vsl/VslScript';
import { VSL_PHOTO_LINES, VSL_WRITTEN_LINES } from '@/components/demo/vsl/VslScript';
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
  chiamata_persa: z.object({
    nome_cliente: z.string(),
    messaggio: z.string(),
    risposta: z.string(),
  }),
  follow_up: z.object({
    nome_cliente: z.string(),
    quando: z.string(),
    whatsapp: z.string(),
    oggetto_email: z.string(),
    testo_email: z.string(),
  }),
  // One per line of `VSL_WRITTEN_LINES`, which `satisfies` keeps in step. Strings, empty when
  // there is nothing to say: the API takes at most 16 nullable fields per schema
  battute: z.object({
    intro: z.string(),
    problem_missed_call: z.string(),
    missed_call: z.string(),
    problem_whatsapp: z.string(),
    problem_reminder: z.string(),
    problem_followup: z.string(),
    problem_reviews: z.string(),
    reviews: z.string(),
    dream: z.string(),
    landing_hero: z.string(),
    landing_services: z.string(),
    landing_about: z.string(),
    landing_highlights: z.string(),
    landing_steps: z.string(),
    landing_faq: z.string(),
    chat_start: z.string(),
    chat_slots: z.string(),
    chat_booked: z.string(),
    reminder: z.string(),
    crm_contact: z.string(),
    crm_timeline: z.string(),
    crm_pipeline: z.string(),
    crm_inbox: z.string(),
    followup: z.string(),
  } satisfies Record<VslWrittenLine, z.ZodString>),
  // The prompt of the photo behind each of these lines, in English
  foto: z.object({
    problem_missed_call: z.string(),
    problem_whatsapp: z.string(),
    problem_reminder: z.string(),
    problem_followup: z.string(),
    problem_reviews: z.string(),
    dream: z.string(),
  } satisfies Record<VslPhotoLine, z.ZodString>),
});

export type DemoVslTexts = z.infer<typeof vslTextsSchema>;

/** What each scene shows while Gigi says its line, so the line describes what is on screen. */
const SCENES: Record<VslWrittenLine, string> = {
  intro:
    'Gigi, the Girhouse giraffe, on screen before anything else. He introduces himself as "Gigi di Girhouse", greets the owner by the business name, says he made this video for them, and opens a loop: before showing anything, he wants to tell them what happens every day to people who do their job.',
  problem_missed_call:
    'PROBLEM 1, over a photo of this moment. Tell it as a short scene the owner lives: they are busy, the phone rings, they cannot answer, the caller hangs up and calls the competitor. Make them feel the loss.',
  missed_call:
    'SOLUTION 1: a phone shows the call ringing, no answer, then a WhatsApp message from the business arrives on its own a few seconds later (the `chiamata_persa` message) and the caller answers it. Say what just happened and what it means: the customer stays theirs.',
  problem_whatsapp:
    'PROBLEM 2, over a photo of this moment. Messages that arrive while they work or after closing get an answer the next day, when the customer has already chosen someone else.',
  chat_start:
    'SOLUTION 2 begins: the example WhatsApp chat. The chat customer writes while the business is busy and gets an answer in thirty seconds, in the business name.',
  chat_slots:
    'In the chat the system listens to the customer, answers with empathy and offers two free times taken from the calendar.',
  chat_booked:
    'The customer picks a time: booked, with a reminder the day before. The owner did nothing.',
  problem_reminder:
    'PROBLEM 3, over a photo of this moment: a forgotten appointment, an empty slot, an hour lost, every week.',
  reminder:
    'SOLUTION 3: a second WhatsApp chat, the automatic reminder typical of this sector (the `promemoria`): it goes out on its own and the customer confirms or moves the appointment.',
  problem_followup:
    'PROBLEM 4, over a photo of this moment: people who ask for information or a quote and then disappear, and nobody has time to chase them.',
  followup:
    'SOLUTION 4: the automation for people who do not answer (the `follow_up`): it waits, sends a WhatsApp, then an email, then starts a call, and stops on its own as soon as the customer answers.',
  problem_reviews:
    'PROBLEM 5, over a photo of this moment: one unhappy customer on a bad day, and the review stays there for years in front of everyone.',
  reviews:
    'SOLUTION 5: the review system. After each visit the customer gets a message asking for a rating; five stars go straight to Google, an unhappy customer writes only to the business, which can make it right.',
  crm_contact:
    'Everything in one place: the CRM card of the chat customer, filled in on its own with where they came from, what they need and when they come.',
  crm_timeline:
    "The customer's timeline: every step tracked, from the missed call to the reminder.",
  crm_pipeline:
    'The pipeline: the customer moves from new contact to booked, with the note written automatically from the chat.',
  crm_inbox:
    'A single inbox: calls, WhatsApp and email from the same customer in one conversation, answered from there.',
  dream:
    'THE DREAM, over a photo of this moment. Make them picture their week with all this in place: every call answered, a full calendar, customers coming back, evenings free. Concrete images from their sector, emotional, hopeful. End on the feeling that this is within reach.',
  landing_hero:
    'Now the new web page of the business, the top part: headline, photo, buttons to book and write on WhatsApp. Say it is the last piece: the page that brings these customers in.',
  landing_services: 'The services section of the page.',
  landing_about: 'The "about" section of the page.',
  landing_highlights: 'The "why choose us" section of the page.',
  landing_steps: 'The section explaining the path step by step.',
  landing_faq: 'The frequently asked questions of the page.',
};

const INSTRUCTIONS = [
  'You write version B of the demo Girhouse sends an Italian small business that showed interest: a video sales letter Gigi, the friendly Girhouse giraffe, narrates on his own while the screens play, with music and photos. It never stops and nobody presses a button. Gigi talks to the owner, using "tu", warmly, as a friend who knows their work.',
  '',
  'The goal: the owner must recognise their own working day and feel it, then dream of how it could be. The video opens straight on five problems, each told as a short scene and followed by what the system does about it, then everything in one place, then the dream, then the new web page. Pick from the playbook below the pains that fit this business best and use its concrete words: a mechanic hears about inspection reminders and quotes answered too late, an osteopath about session reminders and patients who skip, a lawyer about calls lost during hearings.',
  '',
  'Rules for every text:',
  '- Italian, plain, warm, short sentences. Never use em dashes or en dashes.',
  '- Never invent facts about this business (numbers, staff, problems they have). The pains are what businesses like this one live: tell them as scenes they will recognise ("sei con un paziente e il telefono squilla"), not as facts about them, unless the notes from the Girhouse team say so.',
  '- The notes from the Girhouse team are true and say what to stress: follow them.',
  '- Respect what the playbook says to be careful about (for example, never pushy reminders in healthcare).',
  '',
  '`dolori`: the 2 or 3 pains from the playbook this business most likely lives, in a short Italian sentence each.',
  '',
  'Example WhatsApp chat (`chat`), clearly an example, about the pain of messages answered too late:',
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
  'The missed call (`chiamata_persa`): a customer calls while the business is busy and gets a WhatsApp a few seconds later.',
  '- `nome_cliente`: another common Italian first name.',
  '- `messaggio`: the message the business sends on its own, under 180 characters: says sorry for not answering because it is with a customer or at work (in the words of this sector), and asks how it can help.',
  '- `risposta`: what the customer answers, under 120 characters, tied to this sector (for example asking to book a session, a quote for the car, a consultation).',
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
  'The photos (`foto`): for each problem and the dream, the English prompt of the photo shown while Gigi says that line.',
  '- It shows exactly the moment the line tells, in a place like this business (an Italian studio, workshop or office of this sector, in its city when known), with the owner or the people the line names.',
  '- One clear scene, 2 or 3 sentences: who is there, where, what happens, the mood (tense or tired for the problems, warm and bright for the dream). Simple poses a camera would catch, no close-ups of hands on bodies.',
  "- Six different pictures: never two with the same place and pose (not the owner at the desk with the phone again and again). Tell some from the customer's side when the line allows, for example the caller at home hearing the phone ring out, the unhappy customer typing on the sofa, the empty chair in the waiting room.",
  '- When the owner appears, describe them the same way in every prompt (age, hair, clothes), so they look like one person.',
  '- Never ask for written words: no text, signs, names or messages to read on screens or paper. A phone may light up with a call or show stars, never readable words.',
  '- The style is added on its own: do not describe the camera, the light or the photo style.',
  '',
  "Gigi's lines (`battute`): one per screen, read aloud by his voice while the screen plays, over music.",
  '- Spoken, natural to hear, short sentences. No lists, no symbols, no abbreviations, no numbers written as digits except times and years.',
  "- Problems (`problem_*`): 2 or 3 sentences, at most 300 characters. A short scene in the present tense, from the owner's point of view, with a concrete detail of this sector, ending on what it costs them (a customer lost, an empty hour, an evening gone). Emotional, never dramatic or insulting.",
  '- Solutions: 2 or 3 sentences, at most 280 characters. Start with "Con Girhouse" or with what is happening on screen, then say what changes for them.',
  '- The dream (`dream`): 3 or 4 sentences, at most 380 characters, vivid and hopeful.',
  '- The other screens: 1 to 3 sentences, at most 260 characters, saying what is on screen and why it matters for the pains you picked.',
  '- Mark one or two key phrases with `<b>...</b>` (bold) or `<hl>...</hl>` (highlighted), never nested.',
  '- Never tell them to press, tap or click anything: the video plays on its own.',
  '- The problems and the dream play over a photo made from your `foto` prompt, so line and photo tell the same moment. Never name precise gestures or body parts ("hai le mani sulla schiena"): the photo may get them wrong.',
  '- Name things plainly: "il promemoria", "l\'automazione", "il messaggio". Never soften them with adjectives or adverbs such as "gentile", "con gentilezza", "delicato", "senza pressioni", "con calma": the owner hears them as odd. The care the playbook asks for goes into the messages the customer gets, not into how Gigi describes them.',
  '- Use the real names: the business, and the customer names you wrote for the missed call, the chat, the reminder and the follow-up.',
  '- An empty string for a landing section the page does not have.',
  "- The screens, in order, with version A's generic line as a reference for length and tone where it has one:",
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

    return `- \`${line}\`: ${isMissing ? 'NOT ON THIS PAGE, write an empty string.' : SCENES[line]}${reference && !isMissing ? ` Version A says: "${reference}"` : ''}`;
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
      text.trim() ? [[line, cleanReply(text)]] : [],
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
  missedCall: {
    customerName: cleanReply(texts.chiamata_persa.nome_cliente),
    message: cleanReply(texts.chiamata_persa.messaggio),
    reply: cleanReply(texts.chiamata_persa.risposta),
  },
  followUp: {
    customerName: cleanReply(texts.follow_up.nome_cliente),
    trigger: cleanReply(texts.follow_up.quando),
    whatsapp: cleanReply(texts.follow_up.whatsapp),
    emailSubject: cleanReply(texts.follow_up.oggetto_email),
    emailBody: cleanReply(texts.follow_up.testo_email),
  },
  images: Object.fromEntries(
    VSL_PHOTO_LINES.flatMap((line) => {
      const prompt = texts.foto[line].trim();

      return prompt ? [[line, prompt]] : [];
    }),
  ),
  voice: 'pending',
});
