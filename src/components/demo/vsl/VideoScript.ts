import type { DemoSnapshot, DemoVsl } from '@/models/Schema';
import type { BookingPhase } from '../steps/BookingStep';
import type { VslScene } from './VslScript';
import { VSL_BOOKING_PHASES, VSL_MISSED_CALL_STEP_MS } from './VslScript';

/** The closings under test, in order: buy, book a call, or both. */
export const VIDEO_CLOSINGS = ['purchase', 'call', 'both'] as const;

export type VideoClosing = (typeof VIDEO_CLOSINGS)[number];

/** Where customers get lost along the way, each followed by what Girhouse does about it. */
export type VideoLoss = 'not_found' | 'not_chosen' | 'lost' | 'social' | 'not_back';

/** Lines the AI writes for each lead. */
export const VIDEO_WRITTEN_LINES = [
  'video_line_loss_not_found',
  'video_line_google',
  'video_line_site_hero',
  'video_line_loss_not_chosen',
  'video_line_review_request',
  'video_line_loss_lost',
  'video_line_missed_call',
  'video_line_chat_start',
  'video_line_chat_booked',
  'video_line_loss_social',
  'video_line_social',
  'video_line_inbox',
  'video_line_loss_not_back',
  'video_line_reminder',
] as const;

export type VideoWrittenLine = (typeof VIDEO_WRITTEN_LINES)[number];

/** Lines told over a photo Kie makes for each lead. */
export const VIDEO_PHOTO_LINES = [
  'video_line_loss_not_found',
  'video_line_loss_not_chosen',
  'video_line_loss_lost',
  'video_line_loss_social',
  'video_line_loss_not_back',
] as const satisfies readonly VideoWrittenLine[];

export type VideoPhotoLine = (typeof VIDEO_PHOTO_LINES)[number];

/** Lines said the same for everyone: the offer never depends on what the AI writes. */
type VideoFixedLine =
  | 'video_line_intro'
  | 'video_line_diy_site'
  | 'video_line_diy_google'
  | 'video_line_diy_or_us'
  | 'video_line_booking_phone_both'
  | 'video_line_offer_price_direct'
  | 'video_line_offer_price_call'
  | 'video_line_offer_included'
  | 'video_line_offer_guarantee'
  | `video_line_closing_${VideoClosing}`
  | `video_line_booking_${BookingPhase}`;

export type VideoLine = VideoWrittenLine | VideoFixedLine;

/** Words the plan keeps away from the customer: each confuses or scares them. */
const BANNED_WORDS = [
  /\bgestional[ei]\b/iu,
  /\bcrm\b/iu,
  /\bpipeline\b/iu,
  /\blead\b/iu,
  /\bfunnel\b/iu,
  /\blanding\b/iu,
  /\bautomazion[ei]\b/iu,
  /\bbot\b/iu,
  /\bAI\b/u,
  /\bintelligenza artificiale\b/iu,
  /24\s*\/\s*7/u,
  /\bh24\b/iu,
  /\bprova gratuita\b/iu,
  /\bposti limitati\b/iu,
  /\bcandidatura\b/iu,
  /\bmanychat\b/iu,
  /\bgo ?high ?level\b/iu,
  /\bil tuo nuovo sito\b/iu,
];

const WRITTEN = new Set<string>(VIDEO_WRITTEN_LINES);

/** What can be done alone, in three screens: the site, then Google and the profiles, then "or we do it". */
const DIY_LINES = ['video_line_diy_site', 'video_line_diy_google', 'video_line_diy_or_us'] as const;

const CHAT_MESSAGE_MS = 1500;

/** Marks the tall photo of a line, made for phones next to the wide one. */
const PORTRAIT_SUFFIX = ':portrait';

/**
 * Names the tall photo of a line.
 * @param line The line.
 * @returns The key its tall photo is stored under.
 */
export const portraitLine = (line: string) => `${line}${PORTRAIT_SUFFIX}`;

/**
 * Tells whether a stored photo is the tall one.
 * @param line The key the photo is stored under.
 * @returns Whether it is.
 */
export const isPortraitLine = (line: string) => line.endsWith(PORTRAIT_SUFFIX);

/**
 * Names the line a stored photo goes behind, tall or wide.
 * @param line The key the photo is stored under.
 * @returns The line.
 */
export const landscapeLine = (line: string) =>
  isPortraitLine(line) ? line.slice(0, -PORTRAIT_SUFFIX.length) : line;

/**
 * Tells whether a line belongs to version C.
 * @param line The line.
 * @returns Whether it does.
 */
export const isVideoLine = (line: string): line is VideoLine => line.startsWith('video_line_');

/**
 * The closing every video ends on: buying now, with the call one tap away. The other two
 * are kept only to read videos written while the three were under test.
 */
export const VIDEO_CLOSING: VideoClosing = 'both';

/**
 * Builds the opening of one stretch of the path: where customers get lost, over a photo.
 * @param options The stretch.
 * @param options.step Its place in the demo.
 * @param options.loss Where customers get lost.
 * @param options.sound The sound that opens it.
 * @returns The scene.
 */
const lossScene = (options: {
  step: 1 | 2 | 3 | 4;
  loss: VideoLoss;
  sound: 'hit' | 'ring' | 'ping';
}): VslScene => ({
  step: options.step,
  kind: 'loss',
  loss: options.loss,
  line: `video_line_loss_${options.loss}`,
  chapter: 'problem',
  cues: [{ atMs: 0, sound: options.sound }],
});

/**
 * Builds version C's scenes: the path from "they look for you" to "they come back", each
 * stretch with what Girhouse does about it, then the offer and the closing.
 * @param options What is known.
 * @param options.data The demo snapshot, with the video's chat.
 * @param options.closing How the video ends.
 * @returns The scenes, from the intro to the closing.
 */
export const buildVideoScenes = (options: { data: DemoSnapshot; closing: VideoClosing }) => {
  const { data, closing } = options;
  const { messages } = data.chat;
  const firstReply = messages.findIndex((message) => message.from === 'business');

  const scenes: VslScene[] = [
    { step: 0, kind: 'intro', line: 'video_line_intro', chapter: 'opening', cues: [] },
    lossScene({ step: 1, loss: 'not_found', sound: 'hit' }),
    {
      step: 1,
      kind: 'google',
      line: 'video_line_google',
      chapter: 'solution',
      cues: [{ atMs: 0, sound: 'pop' }],
    },
    {
      step: 1,
      kind: 'site',
      sections: ['hero'],
      line: 'video_line_site_hero',
      chapter: 'solution',
      cues: [],
    },
    lossScene({ step: 2, loss: 'not_chosen', sound: 'hit' }),
    {
      step: 2,
      kind: 'review_request',
      line: 'video_line_review_request',
      chapter: 'solution',
      cues: [{ atMs: 3000, sound: 'ping' }],
    },
    lossScene({ step: 3, loss: 'lost', sound: 'ring' }),
    {
      step: 3,
      kind: 'missed_call',
      line: 'video_line_missed_call',
      chapter: 'solution',
      cues: [
        { atMs: 0, sound: 'ring' },
        { atMs: 2 * VSL_MISSED_CALL_STEP_MS + CHAT_MESSAGE_MS, sound: 'ping' },
        { atMs: 2 * VSL_MISSED_CALL_STEP_MS + 2 * CHAT_MESSAGE_MS, sound: 'pop' },
      ],
    },
    {
      step: 3,
      kind: 'chat',
      upTo: Math.max(firstReply + 1, 1),
      line: 'video_line_chat_start',
      chapter: 'solution',
      cues: [{ atMs: CHAT_MESSAGE_MS, sound: 'pop' }],
    },
    {
      step: 3,
      kind: 'chat',
      upTo: messages.length,
      line: 'video_line_chat_booked',
      chapter: 'solution',
      cues: [{ atMs: CHAT_MESSAGE_MS, sound: 'pop' }],
    },
    lossScene({ step: 3, loss: 'social', sound: 'ping' }),
    {
      step: 3,
      kind: 'social',
      line: 'video_line_social',
      chapter: 'solution',
      cues: [
        { atMs: 1500, sound: 'ping' },
        { atMs: 3000, sound: 'pop' },
      ],
    },
    {
      step: 3,
      kind: 'crm',
      part: 4,
      line: 'video_line_inbox',
      chapter: 'solution',
      cues: [{ atMs: 0, sound: 'pop' }],
    },
    lossScene({ step: 4, loss: 'not_back', sound: 'hit' }),
    {
      step: 4,
      kind: 'reminder',
      line: 'video_line_reminder',
      chapter: 'solution',
      cues: [{ atMs: 0, sound: 'bell' }],
    },
    ...([1, 2, 3] as const).map((part): VslScene => ({
      step: 5,
      kind: 'diy',
      part,
      line: DIY_LINES[part - 1] ?? 'video_line_diy_or_us',
      chapter: part === 3 ? 'offer' : 'solution',
      cues: part === 3 ? [{ atMs: 0, sound: 'hit' }] : [{ atMs: 0, sound: 'pop' }],
    })),
    {
      step: 5,
      kind: 'offer',
      part: 1,
      line: closing === 'call' ? 'video_line_offer_price_call' : 'video_line_offer_price_direct',
      chapter: 'offer',
      cues: [{ atMs: 0, sound: 'ping' }],
    },
    {
      step: 5,
      kind: 'offer',
      part: 2,
      line: 'video_line_offer_included',
      chapter: 'offer',
      cues: [],
    },
    {
      step: 5,
      kind: 'offer',
      part: 3,
      line: 'video_line_offer_guarantee',
      chapter: 'offer',
      cues: [],
    },
    {
      step: 6,
      kind: 'closing',
      closing,
      line: `video_line_closing_${closing}`,
      chapter: 'offer',
      cues: [],
    },
  ];

  return scenes;
};

/**
 * Names what Gigi says at a moment of the booking. When buying was on offer too, the first
 * one warns that the call costs the first month's discount.
 * @param options The booking.
 * @param options.phase Where the booking stands.
 * @param options.closing How the video ends.
 * @returns The line.
 */
export const videoBookingLine = (options: {
  phase: BookingPhase;
  closing: VideoClosing;
}): VideoLine =>
  options.phase === 'phone' && options.closing === 'both'
    ? 'video_line_booking_phone_both'
    : `video_line_booking_${options.phase}`;

/**
 * Lists every line version C may say, to voice them all in advance.
 * @param scenes The scenes.
 * @param closing How the video ends: a video that only sells needs no booking lines.
 * @returns The lines, each once.
 */
export const videoLinesToVoice = (scenes: VslScene[], closing: VideoClosing) => [
  ...new Set(
    [
      ...scenes.map((scene) => scene.line),
      ...(closing === 'purchase'
        ? []
        : VSL_BOOKING_PHASES.map((phase) => videoBookingLine({ phase, closing }))),
    ].filter(isVideoLine),
  ),
];

/**
 * Reads what is said on a scene: the AI's line when it wrote one, else the fixed one.
 * @param options The line.
 * @param options.line The line.
 * @param options.vsl The demo's script.
 * @param options.translate Renders the fixed lines.
 * @returns The line, as markup.
 */
export const videoLineMarkup = (options: {
  line: VideoLine;
  vsl: Pick<DemoVsl, 'lines'>;
  translate: (line: VideoLine) => string;
}) => {
  const written = WRITTEN.has(options.line) ? options.vsl.lines[options.line]?.trim() : null;

  if (written) {
    return written.replaceAll('<hl>', '<mark>').replaceAll('</hl>', '</mark>');
  }

  return options.translate(options.line);
};

/**
 * Finds the words the customer should never hear in what the AI wrote.
 * @param lines The script's lines.
 * @returns The words found, for the person checking the video.
 */
export const findBannedWords = (lines: Record<string, string>) => {
  const text = Object.values(lines).join(' ');

  return BANNED_WORDS.flatMap((word) => word.exec(text)?.[0] ?? []);
};
