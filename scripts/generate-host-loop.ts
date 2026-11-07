/**
 * Makes Gianmarco's talking loops for the demos he narrates: ElevenLabs says a line in his
 * cloned voice, then Kling animates his portrait saying it. Run once, after
 * `scripts/generate-host-photo.ts`:
 *
 *   npx dotenv -c -- npx tsx scripts/generate-host-loop.ts
 *
 * Writes `public/demo/gianmarco/host-loop.mp4` (chest up) and `host-loop-face.mp4` (face
 * only), muted, with their posters. The end fades into the start so the loop never jumps.
 */
import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { logger } from '@/libs/Logger';
import { speakAsHost } from '@/services/ElevenLabs';
import { downloadFromKie, runKieTask, uploadToKie } from '@/services/Kie';
import { toSpokenText } from '@/utils/GigiVoice';
import { HOST_VOICE_SAMPLE_RATE } from '@/utils/HostVoice';

/** About fifteen seconds of talk: long enough that the loop does not look repeated. */
const LINE =
  'Ciao, sono Gianmarco, il fondatore di Girhouse. Ogni giorno aiuto piccole attività come la tua a farsi trovare su Google e a non perdere più nessun cliente che scrive. In questo video ti mostro come potrebbe funzionare, passo dopo passo.';

const AVATAR_PROMPT =
  'A young man with round glasses and a navy polo talks warmly and naturally to the camera, with accurate lip movements, small head nods, natural blinking and a light smile. His shoulders stay still and his hands stay out of frame. Static camera, plain pure white background, soft studio light, photorealistic.';

const DIR = 'public/demo/gianmarco';

const PHOTO = `${DIR}/host.jpg`;

/** Kling's white is slightly grey: lifting the levels makes it match the white page. */
const WHITE_LEVEL = 0.96;

/** How long the end fades into the start. */
const FADE_SECONDS = 0.6;

/** Where the face is in the portrait, as shares of its height: centre and side of the square. */
const FACE = { x: 0.5, y: 0.25, size: 0.38 };

/**
 * Runs ffmpeg quietly.
 * @param args Its arguments, after the logging ones.
 */
const ffmpeg = (args: string[]) => {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
};

// ElevenLabs gives raw samples: ffmpeg wraps them as MP3 for Kling
const samples = await speakAsHost(toSpokenText(LINE));
await writeFile(`${DIR}/loop.voice.pcm`, Buffer.from(samples.buffer));
ffmpeg([
  '-f',
  's16le',
  '-ar',
  String(HOST_VOICE_SAMPLE_RATE),
  '-ac',
  '1',
  '-i',
  `${DIR}/loop.voice.pcm`,
  '-b:a',
  '128k',
  `${DIR}/loop.voice.mp3`,
]);
const audioUrl = await uploadToKie({
  data: await readFile(`${DIR}/loop.voice.mp3`),
  mimeType: 'audio/mpeg',
  fileName: 'gianmarco-loop-voice.mp3',
});
await rm(`${DIR}/loop.voice.pcm`);
await rm(`${DIR}/loop.voice.mp3`);

const imageUrl = await uploadToKie({
  data: await readFile(PHOTO),
  mimeType: 'image/jpeg',
  fileName: 'gianmarco.jpg',
});

const videoUrl = await runKieTask('kling/ai-avatar-standard', {
  image_url: imageUrl,
  audio_url: audioUrl,
  prompt: AVATAR_PROMPT,
});
logger.info(`Video ready: ${videoUrl}`);

const raw = `${DIR}/host-loop.raw.mp4`;
await writeFile(raw, await downloadFromKie(videoUrl));

const seconds = Number(
  execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    raw,
  ]).toString(),
);

// The middle plays as it is, then its last moment fades into the first, where the loop restarts
const loop = [
  `[0:v]colorlevels=rimax=${WHITE_LEVEL}:gimax=${WHITE_LEVEL}:bimax=${WHITE_LEVEL},split[a][b]`,
  `[a]trim=0:${FADE_SECONDS},setpts=PTS-STARTPTS[head]`,
  `[b]trim=${FADE_SECONDS}:${seconds},setpts=PTS-STARTPTS[body]`,
  `[body][head]xfade=transition=fade:duration=${FADE_SECONDS}:offset=${seconds - 2 * FADE_SECONDS},format=yuv420p[loop]`,
].join(';');

const encode = (filter: string, output: string) => {
  ffmpeg([
    '-i',
    raw,
    '-filter_complex',
    `${loop};${filter}`,
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-crf',
    '28',
    '-preset',
    'slow',
    '-movflags',
    '+faststart',
    `${output}.mp4`,
  ]);
  // The poster is the first frame, shown while he is quiet
  ffmpeg(['-i', `${output}.mp4`, '-frames:v', '1', '-q:v', '3', `${output}.jpg`]);
};

encode('[loop]scale=-2:720[out]', `${DIR}/host-loop`);
encode(
  `[loop]crop=ih*${FACE.size}:ih*${FACE.size}:iw*${FACE.x}-ih*${FACE.size / 2}:ih*${FACE.y}-ih*${FACE.size / 2},scale=192:192[out]`,
  `${DIR}/host-loop-face`,
);
await rm(raw);

logger.info(`Saved ${DIR}/host-loop.mp4 and ${DIR}/host-loop-face.mp4`);
process.exit(0);
