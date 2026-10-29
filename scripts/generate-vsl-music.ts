/**
 * Makes the music under version B, one track per chapter, with Suno on Kie:
 *
 *   npx dotenv -c -- npx tsx scripts/generate-vsl-music.ts
 *
 * Writes `public/demo/music/{chapter}.mp3`, quiet (about -41 LUFS, the voice is at -19) and
 * built to loop: its last seconds fade into its first, so the player can loop from
 * `MUSIC_CROSSFADE_SECONDS` to the end without a gap. Tracks already there are kept.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import * as z from 'zod';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { createKieTask, downloadFromKie } from '@/services/Kie';
import { requireEnv } from '@/utils/Helpers';
import type { VslChapter } from '@/utils/VslMusic';
import { MUSIC_CROSSFADE_SECONDS, VSL_CHAPTERS } from '@/utils/VslMusic';

/** Documentary explainer music, as in the reference the owner picked: it changes with each chapter. */
const STYLES: Record<VslChapter, string> = {
  opening:
    'Minimal documentary explainer underscore, curious and intriguing, soft pulsing synth arpeggio, light ticking percussion, warm sub bass, modern and clean, 95 BPM, even energy under a voice-over.',
  problem:
    'Tense documentary underscore for a problem being explained, low pulsing bass, ticking clock-like percussion, muted piano notes, suspense without drama, dark but not scary, 90 BPM, even energy under a voice-over.',
  solution:
    'Bright uplifting documentary underscore for a solution being revealed, plucked synths and warm piano, light claps on two and four, optimistic and modern, 105 BPM, even energy under a voice-over.',
  dream:
    'Emotional inspiring cinematic underscore, warm felt piano melody, soft strings and cello, gentle pulsing pad, hopeful and moving, mature and elegant, 90 BPM, slow gentle build, even energy under a voice-over.',
  offer:
    'Confident motivational corporate underscore, driving steady kick, bright piano chords, warm strings, sense of momentum and decision, 110 BPM, even energy under a voice-over, no big drops.',
};

const NEGATIVE =
  'vocals, singing, choir, ukulele, whistling, glockenspiel, childish, cartoon, comedy, quirky, heavy metal, dubstep, epic trailer, big drops';

const recordSchema = z.object({
  state: z.string(),
  response: z.object({ data: z.array(z.object({ audio_url: z.string() })) }).nullish(),
});

/**
 * Reads a Suno task on Kie, whose result sits in `response` rather than `resultJson`.
 * @param taskId The task.
 * @returns The first track's URL, or null while it runs.
 */
const readTrack = async (taskId: string) => {
  const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
    headers: { Authorization: `Bearer ${requireEnv('KIE_API_KEY', Env.KIE_API_KEY)}` },
  });
  const record = recordSchema.parse(
    z.object({ data: z.unknown() }).parse(await response.json()).data,
  );

  if (record.state === 'fail') {
    throw new Error(`Suno task ${taskId} failed`);
  }

  return record.state === 'success' ? (record.response?.data[0]?.audio_url ?? null) : null;
};

await mkdir('public/demo/music', { recursive: true });

const chapters = VSL_CHAPTERS.filter((chapter) => !existsSync(`public/demo/music/${chapter}.mp3`));

for (const chapter of chapters) {
  // oxlint-disable-next-line no-await-in-loop
  const taskId = await createKieTask('ai-music-api/generate', {
    custom_mode: true,
    instrumental: true,
    model: 'V6',
    title: `Girhouse ${chapter}`,
    style: STYLES[chapter],
    negative_tags: NEGATIVE,
    duration: 120,
  });
  let url: string | null = null;

  while (url === null) {
    // oxlint-disable-next-line no-await-in-loop
    await sleep(8000);
    // oxlint-disable-next-line no-await-in-loop
    url = await readTrack(taskId);
  }

  const raw = `public/demo/music/${chapter}.raw.mp3`;
  // oxlint-disable-next-line no-await-in-loop
  await writeFile(raw, await downloadFromKie(url));
  const duration = Number(
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
  // Ends before Suno's own fade, and fades into its start, so the loop has no seam
  const end = duration - 6;
  const fade = MUSIC_CROSSFADE_SECONDS;
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    raw,
    '-filter_complex',
    `[0]atrim=0:${end - fade},asetpts=PTS-STARTPTS[a];[0]atrim=${end - fade}:${end},asetpts=PTS-STARTPTS[tail];[0]atrim=0:${fade},asetpts=PTS-STARTPTS[head];[tail][head]acrossfade=d=${fade}:c1=tri:c2=tri[x];[a][x]concat=n=2:v=0:a=1,loudnorm=I=-41:TP=-9:LRA=5[out]`,
    '-map',
    '[out]',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-b:a',
    '64k',
    `public/demo/music/${chapter}.mp3`,
  ]);
  // oxlint-disable-next-line no-await-in-loop
  await rm(raw);
  logger.info(`Saved public/demo/music/${chapter}.mp3`);
}

process.exit(0);
