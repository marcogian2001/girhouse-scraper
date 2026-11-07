/**
 * Makes Gianmarco's clean chest-up portrait for the demo, from a few real photos of him that
 * only keep the face true. Run once, with the photos as arguments:
 *
 *   npx dotenv -c -- npx tsx scripts/generate-host-photo.ts a.png b.png c.png
 *
 * Writes `public/demo/gianmarco/host.jpg`: him on a pure white background, which the page
 * blends away. The real photos stay out of git.
 */
import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { logger } from '@/libs/Logger';
import { downloadFromKie, runKieTask, uploadToKie } from '@/services/Kie';

const PROMPT =
  'Professional studio portrait photograph of the very same man as in the reference photos: keep his face, eyes, nose, smile, curly dark hair, round dark tortoiseshell glasses and small earring exactly as they are. Chest-up framing, centred, facing the camera with a warm natural smile, mouth closed, looking straight into the lens. He wears a plain navy blue knitted short-sleeve polo shirt. His arms rest relaxed at his sides and no hands are visible. Soft even studio light, sharp focus, realistic skin texture, photorealistic. Plain pure white seamless background, nothing else in the frame. No text, no logos.';

const OUTPUT = 'public/demo/gianmarco/host';

/** Tall enough for the start screen on a retina phone. */
const HEIGHT = 1440;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  // The photos from the phone come in sideways
  options: { rotate: { type: 'boolean', default: true } },
});

if (positionals.length === 0) {
  throw new Error('Pass at least one photo of Gianmarco');
}

const references: string[] = [];

for (const [index, path] of positionals.entries()) {
  const upright = `${OUTPUT}.ref-${index}.jpg`;

  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    path,
    '-vf',
    `${values.rotate ? 'transpose=1,' : ''}scale=-2:1600`,
    '-q:v',
    '3',
    upright,
  ]);
  // oxlint-disable-next-line no-await-in-loop
  const data = await readFile(upright);
  // One at a time: Kie refuses calls that come too fast
  // oxlint-disable-next-line no-await-in-loop
  const url = await uploadToKie({
    data,
    mimeType: 'image/jpeg',
    fileName: `gianmarco-ref-${index}.jpg`,
  });
  references.push(url);
  // oxlint-disable-next-line no-await-in-loop
  await rm(upright);
}

const portraitUrl = await runKieTask('nano-banana-2-1', {
  prompt: PROMPT,
  image_input: references,
  aspect_ratio: '2:3',
  resolution: '2K',
  output_format: 'png',
});
logger.info(`Portrait ready: ${portraitUrl}`);

const cutoutUrl = await runKieTask('recraft/remove-background', {
  image: portraitUrl,
});
logger.info(`Background removed: ${cutoutUrl}`);

await writeFile(`${OUTPUT}.raw.png`, await downloadFromKie(cutoutUrl));

// Back on pure white, so the edges are clean and the page's multiply blend hides it
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'color=white:s=16x16',
  '-i',
  `${OUTPUT}.raw.png`,
  '-filter_complex',
  `[1:v]scale=-2:${HEIGHT}[cut];[0:v][cut]scale2ref[bg][cut];[bg][cut]overlay=format=auto`,
  '-frames:v',
  '1',
  '-q:v',
  '2',
  `${OUTPUT}.jpg`,
]);
await rm(`${OUTPUT}.raw.png`);

logger.info(`Saved ${OUTPUT}.jpg`);
process.exit(0);
