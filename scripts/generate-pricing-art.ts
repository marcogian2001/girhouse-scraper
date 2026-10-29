/**
 * Makes the picture of the package on the pricing step: Gigi among the things the
 * platform does for the business, on a transparent background. Run once:
 *
 *   bun scripts/generate-pricing-art.ts
 *
 * Writes `public/demo/pricing-package.png`; `next/image` serves it as WebP or AVIF.
 */
import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { logger } from '@/libs/Logger';
import { downloadFromKie, runKieTask, uploadToKie } from '@/services/Kie';

const PROMPT =
  'Use the cartoon giraffe of the reference image as the very same character: same face, round glasses, navy suit and tie, dark brown hooves. Create a glossy 3D Pixar-style product hero composition: the giraffe stands smiling in the middle, surrounded by oversized floating objects that stand for a digital package for a small business: a smartphone showing a WhatsApp chat with green bubbles, an open laptop showing a modern website landing page, a calendar card with a big check mark, a golden five-star review badge and an email envelope. Cyan (#10BADE) and electric blue (#0074F2) accents, soft studio light, premium marketing render, plain light grey background, no text, no letters, no logos.';

const OUTPUT = 'public/demo/pricing-package';

const reference = await uploadToKie({
  data: await readFile('public/demo/giraffe.jpg'),
  mimeType: 'image/jpeg',
  fileName: 'gigi.jpg',
});

const artUrl = await runKieTask('google/nano-banana-edit', {
  prompt: PROMPT,
  image_urls: [reference],
  aspect_ratio: '1:1',
  output_format: 'png',
});
logger.info(`Picture ready: ${artUrl}`);

const cutoutUrl = await runKieTask('recraft/remove-background', { image: artUrl });
logger.info(`Background removed: ${cutoutUrl}`);

await writeFile(`${OUTPUT}.raw.png`, await downloadFromKie(cutoutUrl));

// Large enough for a retina half-width column, small enough to ship in the repo
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  `${OUTPUT}.raw.png`,
  '-vf',
  'scale=1000:-2',
  `${OUTPUT}.png`,
]);
await rm(`${OUTPUT}.raw.png`);

logger.info(`Saved ${OUTPUT}.png`);
