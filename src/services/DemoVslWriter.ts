import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import type { VideoPhotoLine, VideoWrittenLine } from '@/components/demo/vsl/VideoScript';
import { VIDEO_PHOTO_LINES, VIDEO_WRITTEN_LINES } from '@/components/demo/vsl/VideoScript';
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
  recensione: z.object({
    nome_cliente: z.string(),
    messaggio: z.string(),
    risposta: z.string(),
  }),
  // One per line of `VIDEO_WRITTEN_LINES`, which `satisfies` keeps in step
  battute: z.object({
    video_line_loss_not_found: z.string(),
    video_line_google: z.string(),
    video_line_site_hero: z.string(),
    video_line_site_services: z.string(),
    video_line_loss_not_chosen: z.string(),
    video_line_review_request: z.string(),
    video_line_loss_lost: z.string(),
    video_line_missed_call: z.string(),
    video_line_chat_start: z.string(),
    video_line_chat_booked: z.string(),
    video_line_inbox: z.string(),
    video_line_loss_not_back: z.string(),
    video_line_reminder: z.string(),
  } satisfies Record<VideoWrittenLine, z.ZodString>),
  // The prompt of the photo behind each of these lines, in English
  foto: z.object({
    video_line_loss_not_found: z.string(),
    video_line_loss_not_chosen: z.string(),
    video_line_loss_lost: z.string(),
    video_line_loss_not_back: z.string(),
  } satisfies Record<VideoPhotoLine, z.ZodString>),
});

export type DemoVslTexts = z.infer<typeof vslTextsSchema>;

/** What each scene shows while Gigi says its line, so the line describes what is on screen. */
const SCENES: Record<VideoWrittenLine, string> = {
  video_line_loss_not_found:
    'FIRST STRETCH, "ti cercano, ma non ti trovano", over a photo. Someone in this city needs this kind of business and looks on Google: whoever does not show up gets passed over. Say it about the sector, never about this business.',
  video_line_google:
    'The Google profile of the business as it could be: the search, the name, the buttons to call and get directions. Say that Girhouse takes care of the Google profile and of being found for this kind of search in this area, and that it takes a few months. Never promise a position.',
  video_line_site_hero:
    'The site as it could be, the top part. Say clearly that this is an example of how it could look ("potrebbe essere così") and that the buttons to book and write are always in view.',
  video_line_site_services:
    'The services section of the example site: whoever arrives understands at once what the business does and how to book.',
  video_line_loss_not_chosen:
    'SECOND STRETCH, "ti trovano, ma non ti scelgono", over a photo. Someone compares two or three businesses on the phone and reads the reviews before writing to anyone. Say it about how people choose, never about this business.',
  video_line_review_request:
    'The review request: after every service every customer gets the same WhatsApp message (`recensione`) with the link to write a Google review. It goes to everyone, without any filter by rating.',
  video_line_loss_lost:
    'THIRD STRETCH, "ti scrivono, ma si perdono", over a photo. A call while the owner cannot answer, messages scattered around, read in the evening. Tell it as something that can happen in this job.',
  video_line_missed_call:
    'A phone shows a call with no answer, then a WhatsApp message from the business arrives on its own a few seconds later (`chiamata_persa`) and the caller answers.',
  video_line_chat_start:
    'The example WhatsApp chat: the customer writes and gets an answer at once, in the name of the business.',
  video_line_chat_booked:
    'The chat goes on: two free times from the calendar, the customer picks one and it is booked, with a reminder the day before.',
  video_line_inbox:
    'One place where every message, call and appointment of that customer arrives. Say "un posto unico" and what the owner sees, without naming any software.',
  video_line_loss_not_back:
    'FOURTH STRETCH, "sono già clienti, ma non tornano", over a photo. People who came once, forget the next check or renewal, and nobody has the time to call them all.',
  video_line_reminder:
    'A second WhatsApp chat: the reminder typical of this sector (`promemoria`) goes out on its own and the customer books again.',
};

const INSTRUCTIONS = [
  'You write the video demo Girhouse sends an Italian small business after it showed interest: a video of about two minutes that Gigi, the friendly Girhouse giraffe, narrates on his own while the screens play. Gigi talks to the owner, using "tu", as someone who knows their work.',
  '',
  'What the video says: more customers without paying for advertising, by making the business easy to find on Google and by losing nobody who gets in touch. It walks one path, "ti cercano, ti trovano, ti scrivono, diventano clienti", in four stretches where customers get lost, each followed by what Girhouse does about it, on a case of this sector. The offer comes after your lines and is fixed: never mention prices, trials or guarantees.',
  '',
  'Rules for every text:',
  '- Italian, plain, short sentences. Never use em dashes or en dashes.',
  '- Never state anything about what this business has or does today: not its site, its Google profile, its reviews, how it answers. You have not checked them. Tell what happens to people in this line of work, or what could be, never "il tuo sito non..." or "non hai...".',
  '- The site and the Google profile are examples: "come potrebbe essere", "potrebbe comparire così". Never "il tuo nuovo sito".',
  '- Promise what Girhouse does and how, never a result: no number of customers or appointments, no first place on Google, no "agenda piena". Being found on Google takes a few months: say it when you talk about Google.',
  '- Never use these words: gestionale, CRM, pipeline, lead, funnel, landing page, automazione, bot, AI, intelligenza artificiale, 24/7, H24. Say "un posto unico dove arrivano tutti i messaggi, i contatti e gli appuntamenti", "clienti", "richieste", "il sito", "messaggi automatici che decidi tu", "risposta automatica".',
  '- No fake urgency, no limited places, no "candidatura", no "attività idonee". Never open on bad news.',
  '- Do not lean on "rispondi subito": most owners already answer on their own or with a secretary. For health professionals lead on being found on Google, reviews and their own bookings. For businesses with a team lead on no request lost and customers coming back.',
  '- Never invent facts about this business. The notes from the Girhouse team are true and say what to stress: follow them.',
  '- Use the real name of the business exactly as written, and only when it reads well aloud. Respect what the playbook says to be careful about (for example, never pushy reminders in healthcare).',
  '',
  '`dolori`: the 2 or 3 points from the playbook that fit this kind of business best, in a short Italian sentence each.',
  '',
  'Example WhatsApp chat (`chat`), clearly an example:',
  '- `nome_cliente`: a common Italian first name for the invented customer.',
  '- `servizio`: the service the customer asks about, one of the listed services when there are any, else null.',
  '- `messaggi`: 6 short messages, each under 160 characters, sounding like real people.',
  '  1. The customer writes first with a request typical of this sector.',
  '  2. The business answers at once, by first name, and asks what they need.',
  '  3. The customer explains in a personal way.',
  '  4. The business acknowledges it in one sentence and proposes exactly two times as `opzioni` such as "Martedì alle 16:00" and "Giovedì alle 17:30".',
  '  5. The customer picks one: its `testo` is exactly one of the two options.',
  '  6. The business confirms with day and time and says a reminder will arrive the day before.',
  '- `opzioni` is empty on every other message. No prices, no addresses, no medical, legal or tax advice, no promises beyond booking.',
  '- `nota`: one line the business would note about this customer, only from what the customer said.',
  '',
  'The missed call (`chiamata_persa`): a customer calls while the business is busy and gets a WhatsApp a few seconds later.',
  '- `nome_cliente`: another common Italian first name.',
  '- `messaggio`: the message the business sends on its own, under 180 characters: says sorry for not answering, in the words of this sector, and asks how it can help.',
  '- `risposta`: what the customer answers, under 120 characters, tied to this sector.',
  '',
  'The review request (`recensione`): the message every customer gets after a service.',
  '- `nome_cliente`: another common Italian first name.',
  '- `messaggio`: under 180 characters, thanks by first name and asks to leave a review on Google with the link below. It never mentions stars, ratings or what to do if unhappy, and never asks for a good review.',
  '- `risposta`: the customer says they just wrote it, under 80 characters.',
  '',
  "The reminder (`promemoria`): the recurring reminder this kind of business sends, from the playbook (for example the car's yearly inspection, the check-up a few weeks after the treatment).",
  '- `titolo`: 2 to 4 words naming it, for example "Promemoria revisione".',
  '- `nome_cliente`: another common Italian first name.',
  '- `messaggi`: 3 messages. The business writes first with a concrete detail, kind and never pushy, offering two times as `opzioni`. The customer picks one, exactly as written. The business confirms. `opzioni` empty on the other messages.',
  '',
  'The photos (`foto`): for each of the four stretches, the English prompt of the photo shown while Gigi says that line.',
  '- It shows the moment the line tells, in a place that fits this sector and is clearly Italian, with the people the line names. It must fit this business: an office professional is never in a warehouse, a workshop owner is never in a medical studio.',
  '- One clear scene, 2 or 3 sentences: who is there, where, what happens, the mood. Simple poses a camera would catch, no close-ups of hands on bodies.',
  "- Four different pictures: never two with the same place and pose. Tell some from the customer's side, for example someone at home searching on their phone.",
  '- When the owner appears, describe them the same way in every prompt, so they look like one person.',
  '- Never ask for written words: no text, signs, names or messages to read on screens or paper.',
  '- The style is added on its own: do not describe the camera, the light or the photo style.',
  '',
  "Gigi's lines (`battute`): one per screen, read aloud while the screen plays.",
  '- Spoken, natural to hear. 1 or 2 short sentences, at most 140 characters each line: the whole video lasts about two minutes. No lists, no symbols, no abbreviations, no numbers written as digits except times.',
  '- Mark one key phrase with `<b>...</b>` (bold) or `<hl>...</hl>` (highlighted), never nested.',
  '- Never tell them to press, tap or click anything: the video plays on its own.',
  '- Say each thing once: never repeat a phrase within a line, such as "come potrebbe essere" and then "potrebbe essere così".',
  '- Never name precise gestures or body parts: the photo may get them wrong.',
  '- Name things plainly. Never soften them with adjectives such as "gentile", "delicato", "con calma".',
  '- Use the customer names you wrote for the missed call, the chat, the review request and the reminder.',
  '- An empty string for `video_line_site_services` when the page lists no services.',
  '- The screens, in order:',
].join('\n');

/**
 * Lists the screens Gigi speaks on.
 * @returns The screens, one per line.
 */
const renderScreens = () =>
  VIDEO_WRITTEN_LINES.map((line) => `- \`${line}\`: ${SCENES[line]}`).join('\n');

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
 * Writes the video demo's script with Claude, from the demo already built and the sales calls' pain points.
 * @param options The call options.
 * @param options.model The Claude model id.
 * @param options.data The demo snapshot.
 * @param options.notes What the Girhouse team told the demo to use, if anything.
 * @returns The texts, or null when the answer did not parse, plus the billed call.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const writeDemoVsl = async (options: {
  model: string;
  data: DemoSnapshot;
  notes: string | null;
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
      renderScreens(),
      '',
      '# Pain points from the sales calls',
      renderPainPlaybook(sector),
    ].join('\n'),
    messages: [{ role: 'user', content: renderBusiness(options) }],
  });

  logger.info(`Wrote the video demo for ${options.data.company} with ${model.id}`);

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
 * Turns the AI's texts into the script a demo stores, cleaned of the dashes the writing
 * rules forbid and trimmed to what the screens have room for.
 * @param texts The parsed AI answer.
 * @returns The script, waiting for its voice.
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
  reviewRequest: {
    customerName: cleanReply(texts.recensione.nome_cliente),
    message: cleanReply(texts.recensione.messaggio),
    reply: cleanReply(texts.recensione.risposta),
  },
  images: Object.fromEntries(
    VIDEO_PHOTO_LINES.flatMap((line) => {
      const prompt = texts.foto[line].trim();

      return prompt ? [[line, prompt]] : [];
    }),
  ),
  voice: 'pending',
});
