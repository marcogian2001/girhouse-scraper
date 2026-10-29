import type { DemoSnapshot, DemoVsl } from '@/models/Schema';
import type { DemoReviews } from '../GoogleReviews';
import { HIGHLIGHT_TAGS, parseHighlights, visibleLength } from '../Highlights';
import type { TourScene } from '../TourScenes';
import { buildTourScenes } from '../TourScenes';

/** What version B shows, in order: the tour's scenes plus the reminder this business sends. */
export type VslScene = TourScene | { step: 2; kind: 'reminder'; line: 'reminder' };

/** Where the booking stands, each with its own line. */
export const VSL_BOOKING_PHASES = ['phone', 'slots', 'confirm', 'booked', 'unavailable'] as const;

type BookingLine = `booking_${(typeof VSL_BOOKING_PHASES)[number]}`;

/** Lines the AI writes for each lead, around its pain points. */
export const VSL_WRITTEN_LINES = [
  'intro',
  'landing_hero',
  'landing_services',
  'landing_about',
  'landing_highlights',
  'landing_steps',
  'landing_faq',
  'chat_start',
  'chat_slots',
  'chat_booked',
  'reminder',
  'crm_contact',
  'crm_timeline',
  'crm_pipeline',
  'crm_inbox',
  'followup',
] as const;

export type VslWrittenLine = (typeof VSL_WRITTEN_LINES)[number];

/** Lines version B says the same for everyone, worded for a demo that plays on its own. */
type VslFixedLine =
  | 'intro'
  | 'reminder'
  | 'landing_reviews'
  | 'landing_funnel'
  | 'landing_contact'
  | 'pricing_video'
  | 'pricing_price'
  | 'pricing_included'
  | 'pricing_guarantees'
  | BookingLine;

/** Version A's lines, said when the AI wrote none for a scene. */
type VslTourLine = Exclude<VslWrittenLine, 'intro' | 'reminder'>;

export type VslLine = VslWrittenLine | VslFixedLine;

/** Turns a line into the markup `parseHighlights` reads, whoever wrote it. */
export type VslTranslate = {
  fixed: (line: VslFixedLine) => string;
  tour: (line: VslTourLine) => string;
};

/** The pause between the end of a line and the next scene. */
export const VSL_GAP_MS = 200;

/** How fast the voice plays: quicker than Gigi's videos (1.15), so the demo keeps moving. */
export const VSL_VOICE_TEMPO = 1.3;

/** How long a message of the example chats takes to show. */
const CHAT_MESSAGE_MS = 1500;

/** How long each step of the follow-up automation lights up: quicker than version A's 1.8 seconds. */
export const VSL_FOLLOW_UP_STEP_MS = 1000;

/** The follow-up automation: seven steps. */
const FOLLOW_UP_MS = 7 * VSL_FOLLOW_UP_STEP_MS;

/** The review system: the star is tapped after 1.5 seconds, then three replies 0.7 seconds apart. */
const FUNNEL_MS = 1500 + 3 * 700;

/** How long the CRM timeline takes to fill. */
const TIMELINE_MS = 8 * 600;

/** Without a voice, a line stays on screen as long as it would take to say it. */
const SPOKEN_MS_PER_CHARACTER = 57;

const WRITTEN = new Set<string>(VSL_WRITTEN_LINES);

/**
 * Tells whether a line is one the AI writes.
 * @param line The line.
 * @returns Whether it is.
 */
const isWrittenLine = (line: VslLine): line is VslWrittenLine => WRITTEN.has(line);

/**
 * Shows version B's chat wherever the tour reads the snapshot's, so the CRM follows it too.
 * @param data The demo snapshot.
 * @param vsl The demo's version B.
 * @returns The snapshot with version B's chat.
 */
export const withVslChat = (data: DemoSnapshot, vsl: Pick<DemoVsl, 'chat'>): DemoSnapshot => ({
  ...data,
  chat: vsl.chat,
});

/**
 * Collects the values the fixed lines fill in, the same on the page and for the voice.
 * @param options What the lines name.
 * @param options.company The business.
 * @param options.customer The example chat's customer.
 * @param options.reviews The reviews the page shows.
 * @param options.price The monthly price.
 * @param options.slots How many businesses are set up each month.
 * @returns The values, with the highlight tags.
 */
export const vslLineValues = (options: {
  company: string;
  customer: string;
  reviews: Pick<DemoReviews, 'source' | 'rating' | 'count'>;
  price: number;
  slots: number;
}) => ({
  ...HIGHLIGHT_TAGS,
  company: options.company,
  customer: options.customer,
  rating: options.reviews.rating ?? 0,
  count: options.reviews.count ?? 0,
  source: options.reviews.source,
  price: options.price,
  slots: options.slots,
});

/**
 * Builds version B's scenes: the tour's, with the business's reminder after the booking chat.
 * @param options What is known.
 * @param options.data The demo snapshot, with version B's chat.
 * @param options.hasReviews Whether Google returned reviews to show.
 * @returns The scenes, from the intro to the booking.
 */
export const buildVslScenes = (options: { data: DemoSnapshot; hasReviews: boolean }) => {
  const scenes: VslScene[] = buildTourScenes(options);
  const booked = scenes.findIndex((scene) => scene.line === 'chat_booked');

  scenes.splice(booked + 1, 0, { step: 2, kind: 'reminder', line: 'reminder' });

  return scenes;
};

/**
 * Names the line a scene says.
 * @param scene The scene.
 * @param bookingPhase Where the booking stands, for the last scene.
 * @returns The line.
 */
export const vslLineOf = (
  scene: VslScene,
  bookingPhase: (typeof VSL_BOOKING_PHASES)[number],
): VslLine => (scene.kind === 'booking' ? `booking_${bookingPhase}` : scene.line);

/**
 * Turns the AI's tags into the ones `parseHighlights` reads.
 * @param line The line as the AI wrote it.
 * @returns The line with `<hl>` as `<mark>`.
 */
const toMarkup = (line: string) => line.replaceAll('<hl>', '<mark>').replaceAll('</hl>', '</mark>');

/**
 * Reads what Gigi says on a scene: the AI's line when it wrote one, else the fixed one.
 * @param options The line.
 * @param options.line The line.
 * @param options.vsl The demo's version B.
 * @param options.translate Renders the fixed and version A lines.
 * @returns The line, as markup.
 */
export const vslLineMarkup = (options: {
  line: VslLine;
  vsl: Pick<DemoVsl, 'lines'>;
  translate: VslTranslate;
}) => {
  const { line, translate } = options;
  const written = isWrittenLine(line) ? options.vsl.lines[line]?.trim() : null;

  if (written) {
    return toMarkup(written);
  }

  if (line === 'intro' || line === 'reminder' || !isWrittenLine(line)) {
    return translate.fixed(line);
  }

  return translate.tour(line);
};

/**
 * Lists every line version B may say, to voice them all in advance.
 * @param scenes The scenes.
 * @returns The lines, each once, the booking phases included.
 */
export const vslLinesToVoice = (scenes: VslScene[]) => [
  ...new Set<VslLine>([
    ...scenes.flatMap((scene) => (scene.kind === 'booking' ? [] : [scene.line])),
    ...VSL_BOOKING_PHASES.map((phase) => `booking_${phase}` as const),
  ]),
];

/**
 * Says how long a scene must stay on screen for what it plays to finish, whatever the voice.
 * @param options The scene.
 * @param options.scene The scene.
 * @param options.previous The scene before it, whose chat this one may continue.
 * @param options.reminderMessages How many messages the reminder chat has.
 * @returns The minimum, in milliseconds.
 */
export const vslSceneMinimumMs = (options: {
  scene: VslScene;
  previous: VslScene | undefined;
  reminderMessages: number;
}) => {
  const { scene, previous } = options;

  if (scene.kind === 'chat') {
    // The chat stays on screen from one scene to the next and plays on from there
    const before = previous?.kind === 'chat' ? previous.upTo : 0;

    return (scene.upTo - before) * CHAT_MESSAGE_MS;
  }

  if (scene.kind === 'reminder') {
    return options.reminderMessages * CHAT_MESSAGE_MS;
  }

  if (scene.kind === 'followup') {
    return FOLLOW_UP_MS;
  }

  if (scene.kind === 'landing' && scene.line === 'landing_funnel') {
    return FUNNEL_MS;
  }

  if (scene.kind === 'crm' && scene.line === 'crm_timeline') {
    return TIMELINE_MS;
  }

  return 0;
};

/**
 * Says how long a line takes to say, for a scene whose voice is not ready.
 * @param line The line, as markup.
 * @returns The time, in milliseconds.
 */
export const spokenDurationMs = (line: string) =>
  visibleLength(parseHighlights(line)) * SPOKEN_MS_PER_CHARACTER;
