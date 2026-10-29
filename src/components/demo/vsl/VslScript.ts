import type { DemoSnapshot, DemoVsl } from '@/models/Schema';
import type { VslChapter, VslSound } from '@/utils/VslMusic';
import type { DemoReviews } from '../GoogleReviews';
import { HIGHLIGHT_TAGS, parseHighlights, visibleLength } from '../Highlights';
import type { LandingSection } from '../TourScenes';
import { landingSectionsFor } from '../TourScenes';

/** The new page's sections: its review system has a case of its own earlier on. */
type VslLandingSection = Exclude<LandingSection, 'funnel'>;

/**
 * Tells whether a page section shows in version B.
 * @param section The section.
 * @returns Whether it does.
 */
const isVslLandingSection = (section: LandingSection): section is VslLandingSection =>
  section !== 'funnel';

/** The problems version B tells, each followed by what the system does about it. */
const VSL_CASES = ['missed_call', 'whatsapp', 'reminder', 'followup', 'reviews'] as const;

export type VslCase = (typeof VSL_CASES)[number];

/** A sound played a while after a scene starts, in time with what it shows. */
export type VslCue = { atMs: number; sound: VslSound };

type SceneSound = { chapter: VslChapter; cues: VslCue[] };

/**
 * What version B shows, in order: the problems and their solutions first, then everything
 * in one place, the dream, the new page and the offer. Each scene has its chapter, whose
 * music plays under it, and the sounds it plays.
 */
export type VslScene = SceneSound &
  (
    | { step: 0; kind: 'intro'; line: 'intro' }
    | { step: 1; kind: 'problem'; case: VslCase; line: `problem_${VslCase}` }
    | { step: 1; kind: 'missed_call'; line: 'missed_call' }
    | { step: 1; kind: 'chat'; upTo: number; line: 'chat_start' | 'chat_slots' | 'chat_booked' }
    | { step: 1; kind: 'reminder'; line: 'reminder' }
    | { step: 1; kind: 'followup'; line: 'followup' }
    | { step: 1; kind: 'reviews'; line: 'reviews' }
    | {
        step: 2;
        kind: 'crm';
        part: number;
        line: 'crm_contact' | 'crm_timeline' | 'crm_pipeline' | 'crm_inbox';
      }
    | { step: 3; kind: 'dream'; line: 'dream' }
    | {
        step: 4;
        kind: 'landing';
        sections: VslLandingSection[];
        line: `landing_${VslLandingSection}`;
      }
    | { step: 5; kind: 'video'; line: 'pricing_video' }
    | {
        step: 5;
        kind: 'pricing';
        part: number;
        line: 'pricing_price' | 'pricing_included' | 'pricing_guarantees';
      }
    | { step: 6; kind: 'booking'; line: 'booking' }
  );

/** Where the booking stands, each with its own line. */
export const VSL_BOOKING_PHASES = ['phone', 'slots', 'confirm', 'booked', 'unavailable'] as const;

type BookingLine = `booking_${(typeof VSL_BOOKING_PHASES)[number]}`;

/** Lines the AI writes for each lead, around its pain points. */
export const VSL_WRITTEN_LINES = [
  'intro',
  'problem_missed_call',
  'missed_call',
  'problem_whatsapp',
  'chat_start',
  'chat_slots',
  'chat_booked',
  'problem_reminder',
  'reminder',
  'problem_followup',
  'followup',
  'problem_reviews',
  'reviews',
  'crm_contact',
  'crm_timeline',
  'crm_pipeline',
  'crm_inbox',
  'dream',
  'landing_hero',
  'landing_services',
  'landing_about',
  'landing_highlights',
  'landing_steps',
  'landing_faq',
] as const;

export type VslWrittenLine = (typeof VSL_WRITTEN_LINES)[number];

/** Lines told over a photo Kie makes for each lead, from a prompt the AI writes with the line. */
export const VSL_PHOTO_LINES = [
  'problem_missed_call',
  'problem_whatsapp',
  'problem_reminder',
  'problem_followup',
  'problem_reviews',
  'dream',
] as const satisfies readonly VslWrittenLine[];

export type VslPhotoLine = (typeof VSL_PHOTO_LINES)[number];

/** Version A's lines, said when the AI wrote none for a scene version A also has. */
export const VSL_TOUR_LINES = [
  'chat_start',
  'chat_slots',
  'chat_booked',
  'crm_contact',
  'crm_timeline',
  'crm_pipeline',
  'crm_inbox',
  'followup',
  'landing_hero',
  'landing_services',
  'landing_about',
  'landing_highlights',
  'landing_steps',
  'landing_faq',
] as const;

type VslTourLine = (typeof VSL_TOUR_LINES)[number];

/** Lines version B says the same for everyone, and its own scenes' lines when the AI wrote none. */
type VslFixedLine =
  | Exclude<VslWrittenLine, VslTourLine>
  | 'landing_reviews'
  | 'landing_contact'
  | 'pricing_video'
  | 'pricing_price'
  | 'pricing_included'
  | 'pricing_guarantees'
  | BookingLine;

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

/** How long the missed call rings, then shows no answer, before the chat opens. */
export const VSL_MISSED_CALL_STEP_MS = 1600;

/** The missed call: the call, no answer, then the chat's two messages, and the reply read. */
const MISSED_CALL_MS = 2 * VSL_MISSED_CALL_STEP_MS + 2 * CHAT_MESSAGE_MS + 1200;

/** The follow-up automation: seven steps. */
const FOLLOW_UP_MS = 7 * VSL_FOLLOW_UP_STEP_MS;

/** The review system: the star is tapped after 1.5 seconds, then three replies 0.7 seconds apart. */
const FUNNEL_MS = 1500 + 3 * 700;

/** How long the CRM timeline takes to fill. */
const TIMELINE_MS = 8 * 600;

/** Without a voice, a line stays on screen as long as it would take to say it. */
const SPOKEN_MS_PER_CHARACTER = 57;

/** The sound that opens each problem. */
const PROBLEM_SOUNDS: Record<VslCase, VslSound> = {
  missed_call: 'ring',
  whatsapp: 'ping',
  reminder: 'hit',
  followup: 'hit',
  reviews: 'hit',
};

const WRITTEN = new Set<string>(VSL_WRITTEN_LINES);

const TOUR = new Set<string>(VSL_TOUR_LINES);

/**
 * Tells whether a line is one the AI writes.
 * @param line The line.
 * @returns Whether it is.
 */
const isWrittenLine = (line: VslLine): line is VslWrittenLine => WRITTEN.has(line);

/**
 * Tells whether version A has a line for a scene.
 * @param line The line.
 * @returns Whether it has.
 */
const isTourLine = (line: VslLine): line is VslTourLine => TOUR.has(line);

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
 * Builds a problem scene.
 * @param useCase The problem.
 * @returns The scene: its photo under the problem's music, opened by its sound.
 */
const problemScene = (useCase: VslCase): VslScene => ({
  step: 1,
  kind: 'problem',
  case: useCase,
  line: `problem_${useCase}`,
  chapter: 'problem',
  cues: [{ atMs: 0, sound: PROBLEM_SOUNDS[useCase] }],
});

/**
 * Builds the example chat's scenes, up to the first reply, the two times and the booking.
 * @param data The demo snapshot, with version B's chat.
 * @returns The scenes.
 */
const chatScenes = (data: DemoSnapshot): VslScene[] => {
  const { messages } = data.chat;
  const firstReply = messages.findIndex((message) => message.from === 'business');
  const slotsOffer = messages.findIndex((message) => message.options.length > 0);
  const chat = (upTo: number, line: 'chat_start' | 'chat_slots' | 'chat_booked'): VslScene => ({
    step: 1,
    kind: 'chat',
    upTo,
    line,
    chapter: 'solution',
    // Each message pops in as it shows, after the one the scene starts on
    cues: [{ atMs: CHAT_MESSAGE_MS, sound: 'pop' }],
  });

  return [
    chat(Math.max(firstReply + 1, 1), 'chat_start'),
    ...(slotsOffer > firstReply ? [chat(slotsOffer + 1, 'chat_slots')] : []),
    chat(messages.length, 'chat_booked'),
  ];
};

/**
 * Gives a solution scene its music and sounds.
 * @param cues The sounds it plays.
 * @returns The solution chapter, with the cues.
 */
const solution = (cues: VslCue[]) => ({ chapter: 'solution' as const, cues });

/**
 * Builds version B's scenes: each problem followed by its solution, everything in one place,
 * the dream, the new page, then the offer and the booking.
 * @param options What is known.
 * @param options.data The demo snapshot, with version B's chat.
 * @param options.hasReviews Whether Google returned reviews to show.
 * @returns The scenes, from the intro to the booking.
 */
export const buildVslScenes = (options: { data: DemoSnapshot; hasReviews: boolean }) => {
  // The review system has a case of its own, so the page goes without it
  const sections = landingSectionsFor(options).filter(isVslLandingSection);

  const scenes: VslScene[] = [
    { step: 0, kind: 'intro', line: 'intro', chapter: 'opening', cues: [] },
    problemScene('missed_call'),
    {
      step: 1,
      kind: 'missed_call',
      line: 'missed_call',
      // The chat opens on the third moment and shows its two messages 1.5 seconds apart
      ...solution([
        { atMs: 0, sound: 'ring' },
        { atMs: 2 * VSL_MISSED_CALL_STEP_MS + CHAT_MESSAGE_MS, sound: 'ping' },
        { atMs: 2 * VSL_MISSED_CALL_STEP_MS + 2 * CHAT_MESSAGE_MS, sound: 'pop' },
      ]),
    },
    problemScene('whatsapp'),
    ...chatScenes(options.data),
    problemScene('reminder'),
    { step: 1, kind: 'reminder', line: 'reminder', ...solution([{ atMs: 0, sound: 'bell' }]) },
    problemScene('followup'),
    {
      step: 1,
      kind: 'followup',
      line: 'followup',
      ...solution([{ atMs: 2 * VSL_FOLLOW_UP_STEP_MS, sound: 'ping' }]),
    },
    problemScene('reviews'),
    { step: 1, kind: 'reviews', line: 'reviews', ...solution([{ atMs: 1500, sound: 'ping' }]) },
    {
      step: 2,
      kind: 'crm',
      part: 1,
      line: 'crm_contact',
      ...solution([{ atMs: 0, sound: 'pop' }]),
    },
    { step: 2, kind: 'crm', part: 2, line: 'crm_timeline', ...solution([]) },
    { step: 2, kind: 'crm', part: 3, line: 'crm_pipeline', ...solution([]) },
    { step: 2, kind: 'crm', part: 4, line: 'crm_inbox', ...solution([]) },
    { step: 3, kind: 'dream', line: 'dream', chapter: 'dream', cues: [{ atMs: 0, sound: 'bell' }] },
    ...sections.map((section, index): VslScene => ({
      step: 4,
      kind: 'landing',
      sections: sections.slice(0, index + 1),
      line: `landing_${section}`,
      chapter: 'opening',
      cues: [],
    })),
    {
      step: 5,
      kind: 'video',
      line: 'pricing_video',
      chapter: 'offer',
      cues: [{ atMs: 0, sound: 'hit' }],
    },
    {
      step: 5,
      kind: 'pricing',
      part: 1,
      line: 'pricing_price',
      chapter: 'offer',
      cues: [{ atMs: 0, sound: 'ping' }],
    },
    { step: 5, kind: 'pricing', part: 2, line: 'pricing_included', chapter: 'offer', cues: [] },
    { step: 5, kind: 'pricing', part: 3, line: 'pricing_guarantees', chapter: 'offer', cues: [] },
    { step: 6, kind: 'booking', line: 'booking', chapter: 'offer', cues: [] },
  ];

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
 * Reads what is said on a scene: the AI's line when it wrote one, else version A's for the
 * scenes it has, else version B's fixed one.
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

  return isTourLine(line) ? translate.tour(line) : translate.fixed(line);
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

  const minimums: Partial<Record<VslScene['kind'], number>> = {
    missed_call: MISSED_CALL_MS,
    reminder: options.reminderMessages * CHAT_MESSAGE_MS,
    followup: FOLLOW_UP_MS,
    reviews: FUNNEL_MS,
  };

  if (scene.kind === 'crm' && scene.line === 'crm_timeline') {
    return TIMELINE_MS;
  }

  return minimums[scene.kind] ?? 0;
};

/**
 * Says how long a line takes to say, for a scene whose voice is not ready.
 * @param line The line, as markup.
 * @returns The time, in milliseconds.
 */
export const spokenDurationMs = (line: string) =>
  visibleLength(parseHighlights(line)) * SPOKEN_MS_PER_CHARACTER;
