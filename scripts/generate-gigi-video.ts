/**
 * Makes one of Gigi's videos: Gemini reads the line, then Kling animates the giraffe so
 * it says it. Run once, and again whenever the line or the slots change:
 *
 *   bun scripts/generate-gigi-video.ts intro
 *   bun scripts/generate-gigi-video.ts pricing --slots=10
 *
 * Writes `public/demo/gigi-{video}.mp4` and its poster. Kie deletes
 * generated files after 14 days, which is why the videos are kept in the project.
 */
import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import * as z from 'zod';
import { stripHighlights } from '@/components/demo/Highlights';
import { logger } from '@/libs/Logger';
import messages from '@/locales/it.json';
import { downloadFromKie, runKieTask, uploadToKie } from './Kie';

/** Gemini "Achird": a friendly male voice that speaks natural Italian. */
const VOICE_NAME = 'Achird';

const VOICE_STYLE =
  'Voce maschile calda e amichevole, italiano naturale, ritmo tranquillo e sorridente.';

const AVATAR_PROMPT =
  'A friendly cartoon giraffe wearing round glasses and a navy suit talks warmly to the camera, with natural lip movements, gentle head nods and blinking. Its arms stay relaxed at its sides and its hooves stay dark brown hooves the whole time: no hands, no fingers, no palms. Only the head, the mouth and the eyes move. Static camera, plain white background, soft studio light.';

/** Gemini has no speed setting, so the voice is sped up with ffmpeg before Kling lip-syncs it. */
const VOICE_TEMPO = 1.15;

/** Kling's background is off-white (about #fcfcfc): lifting the levels makes it match the white page. */
const WHITE_LEVEL = 0.96;

/** Read as written, the voice says "Ghirhouse": spelled the Italian way, the G is soft as in "giraffa". */
const SPOKEN_NAME = 'Giraus';

/** The line each video reads. */
const LINES = {
  intro: messages.DemoPage.line_intro,
  pricing: messages.DemoPage.line_pricing_video,
};

const argsSchema = z.object({
  video: z.enum(['intro', 'pricing']),
  slots: z.coerce.number().int().positive(),
});

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { slots: { type: 'string', default: '10' } },
});
const args = argsSchema.parse({ video: positionals[0], ...values });
const output = `public/demo/gigi-${args.video}`;

// The slots come from the arguments so the video says what the Automation page says
const text = stripHighlights(LINES[args.video]).replaceAll('{slots}', String(args.slots));
const spoken = text.replaceAll('Girhouse', SPOKEN_NAME);
logger.info(`Voicing: ${spoken}`);

const voiceUrl = await runKieTask('google/gemini-3-8-flash-tts', {
  speakers: [{ speaker_id: 'Speaker 1', voice_name: VOICE_NAME }],
  dialogue_turns: [{ speaker_id: 'Speaker 1', style: VOICE_STYLE, text: spoken }],
});
logger.info(`Voice ready: ${voiceUrl}`);

await writeFile(`${output}.voice.wav`, await downloadFromKie(voiceUrl));
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  `${output}.voice.wav`,
  '-filter:a',
  `atempo=${VOICE_TEMPO}`,
  '-b:a',
  '128k',
  `${output}.voice.mp3`,
]);
const audioUrl = await uploadToKie({
  data: await readFile(`${output}.voice.mp3`),
  mimeType: 'audio/mpeg',
  fileName: `gigi-${args.video}-voice.mp3`,
});
await rm(`${output}.voice.wav`);
await rm(`${output}.voice.mp3`);

const imageUrl = await uploadToKie({
  data: await readFile('public/demo/giraffe.jpg'),
  mimeType: 'image/jpeg',
  fileName: 'gigi.jpg',
});

const videoUrl = await runKieTask('kling/ai-avatar-standard', {
  image_url: imageUrl,
  audio_url: audioUrl,
  prompt: AVATAR_PROMPT,
});
logger.info(`Video ready: ${videoUrl}`);

await writeFile(`${output}.raw.mp4`, await downloadFromKie(videoUrl));

// Kling's file is several MB: re-encode it so the page opens fast on mobile, with a pure white background
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  `${output}.raw.mp4`,
  '-vf',
  `colorlevels=rimax=${WHITE_LEVEL}:gimax=${WHITE_LEVEL}:bimax=${WHITE_LEVEL},scale=-2:960`,
  '-c:v',
  'libx264',
  '-crf',
  '28',
  '-preset',
  'slow',
  '-c:a',
  'aac',
  '-b:a',
  '96k',
  '-movflags',
  '+faststart',
  `${output}.mp4`,
]);
await rm(`${output}.raw.mp4`);

// The poster is the first frame
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  `${output}.mp4`,
  '-frames:v',
  '1',
  '-q:v',
  '3',
  `${output}.jpg`,
]);
const seconds = Number(
  execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    `${output}.mp4`,
  ]).toString(),
);

logger.info(`Saved ${output}.mp4 (${seconds.toFixed(1)}s) and its poster`);
