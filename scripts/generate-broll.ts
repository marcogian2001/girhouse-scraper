/**
 * Makes the b-roll version B cuts to, once per sector, with Seedance on Kie:
 *
 *   npx dotenv -c -- npx tsx scripts/generate-broll.ts
 *
 * Writes `public/demo/broll/{sector}/{scene}.mp4` and its poster, small enough for a phone.
 * Clips already there are kept, so it can be run again after a failure. Kie deletes its
 * files after 14 days, which is why the clips are kept in the project.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { logger } from '@/libs/Logger';
import { createKieTask, downloadFromKie, readKieTask } from '@/services/Kie';
import type { BrollScene, BrollSector } from '@/utils/BrollLibrary';
import {
  BROLL_SCENES,
  BROLL_SECTORS,
  brollPath,
  brollPrompt,
  SHARED_BROLL_SCENES,
} from '@/utils/BrollLibrary';

const MODEL = 'bytedance/v1-pro-text-to-video';

const POLL_MS = 10_000;

const clips: { sector: BrollSector; scene: BrollScene }[] = [
  ...BROLL_SECTORS.flatMap((sector) => BROLL_SCENES.map((scene) => ({ sector, scene }))),
  ...SHARED_BROLL_SCENES.map((scene) => ({ sector: 'generic' as const, scene })),
].filter((clip) => !existsSync(`public${brollPath(clip.sector, clip.scene)}.mp4`));

logger.info(`Making ${clips.length} b-roll clips`);

const tasks: { sector: BrollSector; scene: BrollScene; taskId: string }[] = [];

// One at a time: Kie refuses calls that come too fast
for (const clip of clips) {
  // oxlint-disable-next-line no-await-in-loop
  const taskId = await createKieTask(MODEL, {
    prompt: brollPrompt(clip.sector, clip.scene),
    aspect_ratio: '16:9',
    resolution: '480p',
    duration: '5',
    camera_fixed: false,
  });

  tasks.push({ ...clip, taskId });
}

let pending = tasks;

while (pending.length > 0) {
  // oxlint-disable-next-line no-await-in-loop
  await sleep(POLL_MS);
  const waiting: typeof pending = [];

  for (const task of pending) {
    const path = `public${brollPath(task.sector, task.scene)}`;
    let url: string | null = null;

    try {
      // oxlint-disable-next-line no-await-in-loop
      url = await readKieTask(task.taskId);
    } catch (error) {
      logger.warn(`Skipped ${path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (url === null) {
      waiting.push(task);
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop
    await writeFile(`${path}.raw.mp4`, await downloadFromKie(url));
    // Small and silent: the clip plays under the voice in a card, on a phone too
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      `${path}.raw.mp4`,
      '-an',
      '-vf',
      'scale=-2:360',
      '-c:v',
      'libx264',
      '-crf',
      '30',
      '-preset',
      'slow',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      `${path}.mp4`,
    ]);
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      `${path}.mp4`,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      `${path}.jpg`,
    ]);
    // oxlint-disable-next-line no-await-in-loop
    await rm(`${path}.raw.mp4`);
    logger.info(`Saved ${path}.mp4`);
  }

  pending = waiting;
}

logger.info('B-roll done');
process.exit(0);
