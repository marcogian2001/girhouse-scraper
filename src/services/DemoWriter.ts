import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import { logger } from '@/libs/Logger';
import { isUsableBrandColor, normalizeHex } from '@/utils/Colors';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import type { LandingBodySection } from '@/utils/DemoDesign';
import {
  DEFAULT_SECTION_ORDER,
  DEMO_CORNERS,
  DEMO_FONT_PAIRINGS,
  DEMO_HEROES,
  DEMO_SERVICE_LAYOUTS,
  DEMO_SURFACES,
  LANDING_BODY_SECTIONS,
} from '@/utils/DemoDesign';
import { cleanReply } from '@/utils/ReplyGuard';
import { getClient, reasoningFor } from './Claude';
import { toBilledCall } from './ReplyPrompt';

const MAX_TOKENS = 6000;

const demoTextsSchema = z.object({
  titolo: z.string(),
  sottotitolo: z.string(),
  chi_siamo: z.string().nullable(),
  cta: z.string(),
  servizi: z.array(
    z.object({
      nome: z.string(),
      descrizione: z.string().nullable(),
      prezzo: z.string().nullable(),
    }),
  ),
  perche_sceglierci: z.array(z.object({ titolo: z.string(), testo: z.string() })),
  percorso: z.array(z.object({ titolo: z.string(), testo: z.string() })),
  faq: z.array(z.object({ domanda: z.string(), risposta: z.string() })),
  design: z.object({
    font: z.enum(DEMO_FONT_PAIRINGS),
    hero: z.enum(DEMO_HEROES),
    servizi: z.enum(DEMO_SERVICE_LAYOUTS),
    sfondo: z.enum(DEMO_SURFACES),
    angoli: z.enum(DEMO_CORNERS),
    colore_principale: z.string().nullable(),
    colore_accento: z.string().nullable(),
    ordine_sezioni: z.array(z.enum(LANDING_BODY_SECTIONS)),
  }),
  chat: z.object({
    nome_cliente: z.string(),
    servizio: z.string().nullable(),
    nota: z.string().nullable(),
    messaggi: z.array(
      z.object({
        da: z.enum(['cliente', 'attivita']),
        testo: z.string(),
        opzioni: z.array(z.string()),
      }),
    ),
  }),
});

export type DemoTexts = z.infer<typeof demoTextsSchema>;

/** What the demo texts may be written from: only facts already known about the business. */
export type DemoSources = {
  company: string;
  // The professional behind the business, when known
  person: string | null;
  city: string | null;
  category: string | null;
  categories: string[];
  description: string | null;
  websiteTitle: string | null;
  websiteDescription: string | null;
  websiteText: string | null;
  // Hex colours and font families the website's styles use, the most frequent first
  websiteColors: string[];
  websiteFonts: string[];
  // Roughly how many photos of the business the page can show, and whether one is a portrait
  photoCount: number;
  hasPortrait: boolean;
  // From the professional's MioDottore profile, when one was found
  profileAbout: string | null;
  profileServices: { name: string; price: string | null }[];
  profileLocations: string[];
  reviewQuotes: string[];
  // What the research on the person found: role, field, how they present themselves
  research: string | null;
  // From the business's Instagram profile, when one was found
  socialBio: string | null;
  socialPosts: string[];
  // What the Girhouse team wrote about the business, and the pages it linked
  teamNotes: string | null;
  referencePages: string[];
};

const INSTRUCTIONS = [
  "You write the texts of a guided demo Girhouse shows an Italian small business: the landing page Girhouse would build for it, and an example WhatsApp chat where Girhouse's assistant books a customer on the business's behalf.",
  '',
  'Rules for every text:',
  '- Italian, plain and warm, written as the business speaking to its own customers. When the business is one professional, they speak in the first person singular ("ti aspetto", "il mio studio"), never "noi".',
  '- Use only facts in the sources below. Never invent services, prices, years, awards, numbers, staff names or claims.',
  '- The notes from the Girhouse team are true facts about the business and say what to stress: follow them, and prefer them over the other sources when they disagree.',
  '- Never use em dashes or en dashes.',
  '',
  'Landing page:',
  '- `titolo`: the headline, at most 8 words, naming what the business does and where when the city is known.',
  '- `sottotitolo`: one sentence, at most 22 words, on why customers choose it (what the reviews praise, when there are any) or how they book, with no facts beyond the sources.',
  '- `chi_siamo`: 3 or 4 sentences about the business, only from the notes, description, research, reference pages, profile, Instagram bio or posts, or website text: who they are, their training and credentials, their approach, where they work. In the first person when the business is one professional. Null when the sources say nothing about it.',
  '- `cta`: the main button, 2 to 4 words, fitting the business (for example "Prenota una visita", "Richiedi un preventivo").',
  '- `servizi`: up to 6 services the sources state explicitly, the ones a new customer books first, each with a one-sentence `descrizione` taken from the sources, or null when they give none, and its `prezzo` exactly as the sources state it (for example "100 €"), or null. An empty list when no services are stated; the category alone is not a service list.',
  '- `perche_sceglierci`: 3 or 4 reasons customers pick the business, each a `titolo` of 2 to 5 words and a `testo` of one sentence, drawn from what reviews praise, credentials, approach or what the notes stress. Never generic claims any business could make ("professionalità", "cortesia") unless the reviews say them in their own words. An empty list when the sources do not give at least 3 real reasons.',
  '- `percorso`: 3 or 4 steps of how working with the business goes (for example first contact, first visit, treatment, follow-up), each a `titolo` of 2 to 4 words and a `testo` of one sentence, only when the sources describe the process or the service makes it plain. An empty list otherwise.',
  '- `faq`: 3 to 5 questions a new customer of this business would ask, each answered in one or two sentences with facts from the sources only (where, how to book, who it is for, what to bring when the sources say it). Never answer with prices, durations or policies the sources do not state; leave such questions out. An empty list when fewer than 3 can be answered.',
  '',
  'Design (`design`): pick a look made for this business, so the page does not feel like a template. Two businesses of different kinds should rarely get the same choices.',
  '- `font`: the font pair matching its character. `classic` (Playfair Display serif titles: established, formal, law, dentistry), `editorial` (Fraunces soft serif: artisan, food, wine, crafts), `refined` (Cormorant Garamond: luxury, beauty, weddings, spa), `warm` (Lora serif with rounded Nunito: psychology, midwifery, family care), `modern` (Plus Jakarta Sans: studios, design, consultants), `friendly` (Nunito rounded: children, pets, schools), `bold` (Bricolage Grotesque: gyms, barbers, workshops, energetic brands), `clinical` (Outfit: medicine, physiotherapy, labs). When the website fonts are a serif or a sans, stay close to them.',
  '- `colore_principale`: the brand colour as hex. The first website colour when there are any; otherwise a colour fitting the business and its city, never the default blue of every template (for example sage green for a herbalist, terracotta for a trattoria, deep teal for a physiotherapist). Never near white, black or grey.',
  '- `colore_accento`: a second hex colour that goes with it, for details: the second website colour when it suits, else a complementary or harmonious tone.',
  '- `sfondo`: `white` for clean, clinical or modern brands, `warm` (cream) for artisan, food, family or wellness ones, `tinted` (a pale wash of the brand colour) for bold or playful ones.',
  '- `angoli`: `sharp` for formal or editorial brands, `soft` for most, `round` for friendly, children or wellness ones.',
  '- `hero`: `photo` (headline over a full-width photo) when there are several photos, `split` (headline beside a large photo or portrait) when there is a portrait or one strong photo, `editorial` (large serif headline over a photo strip) for refined or artisan brands with photos, `centered` (headline on the brand colour) when there are no photos.',
  '- `servizi`: `cards` for up to 4 services with descriptions, `list` (a menu with prices on the right) when most have prices, `numbered` for treatments or packages that read best as a sequence.',
  "- `ordine_sezioni`: the order of `services`, `highlights` (perche_sceglierci), `about` (chi_siamo), `steps` (percorso), `reviews` and `faq` that tells this business's story best: lead with what convinces its customers most (for example reviews early when they are strong, about early for a single professional, services early for a shop).",
  '- The notes from the Girhouse team win over these rules when they ask for a colour, font or feel.',
  '',
  'Example WhatsApp chat (`chat`), clearly an example:',
  '- `nome_cliente`: a common Italian first name for the invented customer.',
  '- `servizio`: the service the customer asks about, one of `servizi` when there are any, else null.',
  '- `messaggi`: 8 to 10 short messages, each under 220 characters, sounding like real people: warm, human, empathetic.',
  '  1. The customer writes first, asking to book (or for a quote, whatever fits the business).',
  '  2. The business answers at once, kindly, by first name, and asks what they need or why they are writing.',
  '  3. The customer explains their situation or problem in a personal way (for example a pain, a worry, a deadline, an occasion).',
  '  4. The business FIRST acknowledges it with empathy and reassurance, in one or two sentences that show it listened (for example "Mi dispiace, al settimo mese è una cosa che capita spesso: vediamo subito come aiutarti"), THEN proposes exactly two times as `opzioni` such as "Martedì alle 16:00" and "Giovedì alle 17:30", asking which works.',
  '  5. The customer picks one: its `testo` is exactly one of the two options.',
  '  6. The business confirms the appointment with day and time, says a reminder will arrive the day before, and adds a caring touch tied to what the customer said.',
  '  7. The customer thanks; the business closes warmly.',
  '- `opzioni` is empty on every other message. No prices, no addresses, no medical or professional advice, no promises beyond booking.',
  '- `nota`: one line the business would write in its CRM about this customer, only from what the customer said (for example "Settimo mese, mal di schiena frequente, preferisce il pomeriggio").',
].join('\n');

/**
 * Renders the facts the texts are written from.
 * @param sources What is known about the business.
 * @returns One labelled fact per line, unknown ones left out.
 */
export const renderDemoSources = (sources: DemoSources) =>
  [
    ['Business', sources.company],
    ['Professional', sources.person],
    ['Notes from the Girhouse team', sources.teamNotes],
    ['City', sources.city],
    ['Google Maps category', sources.category],
    ['Other categories', sources.categories.join(', ')],
    ['Description', sources.description],
    ['What research on the professional found', sources.research],
    ['Instagram bio', sources.socialBio],
    ['Recent Instagram posts', sources.socialPosts.map((post) => `- ${post}`).join('\n')],
    ['Reference pages about the business', sources.referencePages.join('\n\n---\n\n')],
    ['Website title', sources.websiteTitle],
    ['Website description', sources.websiteDescription],
    ['Website text', sources.websiteText],
    ['Website colours', sources.websiteColors.join(', ')],
    ['Website fonts', sources.websiteFonts.join(', ')],
    [
      'Photos available for the page',
      `${sources.photoCount}${sources.hasPortrait ? ', plus a portrait of the professional' : ''}`,
    ],
    ['Professional profile', sources.profileAbout],
    [
      'Services and prices',
      sources.profileServices
        .map((service) => (service.price ? `${service.name}: ${service.price}` : service.name))
        .join('\n'),
    ],
    ['Locations', sources.profileLocations.join('\n')],
    ['What patients say in reviews', sources.reviewQuotes.map((quote) => `- ${quote}`).join('\n')],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `## ${label}\n${value}`)
    .join('\n\n');

/**
 * Writes the demo texts with Claude.
 * @param options The call options.
 * @param options.model The Claude model id.
 * @param options.sources What is known about the business.
 * @returns The texts, or null when the answer did not parse, plus the billed call.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const writeDemoTexts = async (options: { model: string; sources: DemoSources }) => {
  const model = requireCopywritingModel({ id: options.model, provider: 'anthropic' });
  const reasoning = reasoningFor(model.id, 'low');

  const response = await getClient().messages.parse({
    model: model.id,
    max_tokens: MAX_TOKENS,
    thinking: reasoning.thinking,
    output_config: { effort: reasoning.effort, format: zodOutputFormat(demoTextsSchema) },
    system: INSTRUCTIONS,
    messages: [{ role: 'user', content: renderDemoSources(options.sources) }],
  });

  logger.info(`Wrote demo texts for ${options.sources.company} with ${model.id}`);

  return { texts: response.parsed_output ?? null, call: toBilledCall(response, model) };
};

const MAX_SERVICES = 6;

const MAX_MESSAGES = 10;

const MAX_HIGHLIGHTS = 4;

const MAX_STEPS = 4;

const MAX_FAQS = 5;

/**
 * Reads a colour the AI picked.
 * @param value The hex the AI wrote, if any.
 * @returns The colour as six-digit hex, or null when it is not one a page can be tinted with.
 */
const usableColor = (value: string | null) => {
  const hex = normalizeHex(value);

  return hex && isUsableBrandColor(hex) ? hex : null;
};

/**
 * Puts the body sections in the AI's order, then any it left out in the default one, so a
 * section with content always has a place.
 * @param order The order the AI picked.
 * @returns Every body section once.
 */
const completeSectionOrder = (order: LandingBodySection[]) => [
  ...new Set([...order, ...DEFAULT_SECTION_ORDER]),
];

/**
 * Turns the AI's texts into the landing, chat and design a demo stores, cleaned of the
 * dashes the writing rules forbid and trimmed to what the page has room for.
 * @param texts The parsed AI answer.
 * @returns The landing, chat and design of the snapshot, and the colours the AI picked.
 */
export const toDemoContent = (texts: DemoTexts) => ({
  landing: {
    headline: cleanReply(texts.titolo),
    subheadline: cleanReply(texts.sottotitolo),
    about: texts.chi_siamo ? cleanReply(texts.chi_siamo) : null,
    ctaLabel: cleanReply(texts.cta),
    services: texts.servizi.slice(0, MAX_SERVICES).map((service) => ({
      name: cleanReply(service.nome),
      description: service.descrizione ? cleanReply(service.descrizione) : null,
      price: service.prezzo ? cleanReply(service.prezzo) : null,
    })),
    highlights: texts.perche_sceglierci.slice(0, MAX_HIGHLIGHTS).map((item) => ({
      title: cleanReply(item.titolo),
      text: cleanReply(item.testo),
    })),
    steps: texts.percorso.slice(0, MAX_STEPS).map((item) => ({
      title: cleanReply(item.titolo),
      text: cleanReply(item.testo),
    })),
    faqs: texts.faq.slice(0, MAX_FAQS).map((item) => ({
      question: cleanReply(item.domanda),
      answer: cleanReply(item.risposta),
    })),
  },
  design: {
    fonts: texts.design.font,
    surface: texts.design.sfondo,
    corners: texts.design.angoli,
    hero: texts.design.hero,
    services: texts.design.servizi,
    sectionOrder: completeSectionOrder(texts.design.ordine_sezioni),
  },
  colors: {
    primary: usableColor(texts.design.colore_principale),
    accent: usableColor(texts.design.colore_accento),
  },
  chat: {
    customerName: cleanReply(texts.chat.nome_cliente),
    service: texts.chat.servizio ? cleanReply(texts.chat.servizio) : null,
    note: texts.chat.nota ? cleanReply(texts.chat.nota) : null,
    messages: texts.chat.messaggi
      .slice(0, MAX_MESSAGES)
      .map((message) => ({
        from: message.da === 'cliente' ? ('customer' as const) : ('business' as const),
        text: cleanReply(message.testo),
        // Buttons only make sense on the business's side
        options:
          message.da === 'attivita' ? message.opzioni.map((option) => cleanReply(option)) : [],
      }))
      .filter((message) => message.text),
  },
});
