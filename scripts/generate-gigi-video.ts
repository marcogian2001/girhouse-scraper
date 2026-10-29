/**
 * Makes one of Gigi's videos: Gemini reads the line, then Kling animates the giraffe so
 * it says it. Run once, and again whenever the line or the slots change:
 *
 *   bun scripts/generate-gigi-video.ts intro
 *   bun scripts/generate-gigi-video.ts pricing --slots=10
 *
 * Writes `public/demo/gigi-{video}.mp4`, its poster and the pauses in its voice, which the
 * demo uses to show each sentence while Gigi says it. Kie deletes
 * generated files after 14 days, which is why the videos are kept in the project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import * as z from 'zod';
import gigiPauses from '@/components/demo/gigi-pauses.json';
import { logger } from '@/libs/Logger';
import messages from '@/locales/it.json';
import { downloadFromKie, runKieTask, uploadToKie } from '@/services/Kie';
import {
  GIGI_VOICE_NAME,
  GIGI_VOICE_STYLE,
  GIGI_VOICE_TEMPO,
  toSpokenText,
} from '@/utils/GigiVoice';

const AVATAR_PROMPT =
  'A friendly cartoon giraffe wearing round glasses and a navy suit talks warmly to the camera, with natural lip movements, gentle head nods and blinking. Its arms stay relaxed at its sides and its hooves stay dark brown hooves the whole time: no hands, no fingers, no palms. Only the head, the mouth and the eyes move. Static camera, plain white background, soft studio light.';

/** Quieter than this counts as a pause in the voice. */
const PAUSE_NOISE = '-35dB';

/** Shorter gaps are breaths between words, not breaks between sentences. */
const PAUSE_SECONDS = 0.3;

/** Kling's background is off-white (about #fcfcfc): lifting the levels makes it match the white page. */
const WHITE_LEVEL = 0.96;

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
const spoken = toSpokenText(LINES[args.video].replaceAll('{slots}', String(args.slots)));
logger.info(`Voicing: ${spoken}`);

const voiceUrl = await runKieTask('google/gemini-3-8-flash-tts', {
  speakers: [{ speaker_id: 'Speaker 1', voice_name: GIGI_VOICE_NAME }],
  dialogue_turns: [{ speaker_id: 'Speaker 1', style: GIGI_VOICE_STYLE, text: spoken }],
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
  `atempo=${GIGI_VOICE_TEMPO}`,
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

// Where the voice starts again after each pause: sentences break there. ffmpeg logs
// them on stderr; the silence that ends the video is left out
const silences = spawnSync('ffmpeg', [
  '-hide_banner',
  '-nostats',
  '-i',
  `${output}.mp4`,
  '-af',
  `silencedetect=noise=${PAUSE_NOISE}:d=${PAUSE_SECONDS}`,
  '-f',
  'null',
  '-',
]).stderr.toString();
const pauses = [...silences.matchAll(/silence_end: ([\d.]+)/gu)]
  .map((match) => Math.round(Number(match[1]) * 100) / 100)
  .filter((time) => time < seconds - 0.1);
await writeFile(
  'src/components/demo/gigi-pauses.json',
  `${JSON.stringify({ ...gigiPauses, [args.video]: pauses }, null, 2)}\n`,
);

logger.info(`Saved ${output}.mp4 (${seconds.toFixed(1)}s), its poster and ${pauses.length} pauses`);
