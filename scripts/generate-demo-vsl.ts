/**
 * Writes, voices and illustrates version B of one demo from the terminal, without the job queue:
 *
 *   npx dotenv -c -- npx tsx scripts/generate-demo-vsl.ts dottor-giorgio-neri
 *   npx dotenv -c -- npx tsx scripts/generate-demo-vsl.ts dottor-giorgio-neri --voice
 *
 * With `--voice` it keeps the script and only makes its voices and photos again.
 * The link keeps the version it shows; version B opens with `?versione=b`. It calls
 * Claude for the script and Kie for each of Gigi's lines and photos, on the database in `.env`.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { db } from '@/libs/DB';
import { advanceDemoVsl } from '@/libs/DemoVsl';
import { logger } from '@/libs/Logger';
import { demoSchema } from '@/models/Schema';
import { DemoSlugValidation } from '@/validations/DemoValidation';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { voice: { type: 'boolean', default: false } },
});
const slug = DemoSlugValidation.parse(positionals[0]);
const demo = await db.query.demoSchema.findFirst({ where: eq(demoSchema.slug, slug) });

if (!demo) {
  throw new Error(`No demo has the slug ${slug}`);
}

if (values.voice && !demo.vsl) {
  throw new Error(`Demo ${slug} has no version B to voice`);
}

let next: Awaited<ReturnType<typeof advanceDemoVsl>> = {
  payload:
    values.voice && demo.vsl
      ? { demoId: demo.id, generatedAt: demo.vsl.generatedAt, phase: 'voice_start', tasks: [] }
      : { demoId: demo.id, generatedAt: new Date().toISOString(), phase: 'script', tasks: [] },
  delaySeconds: 0,
};

while (next) {
  // oxlint-disable-next-line no-await-in-loop
  await sleep(next.delaySeconds * 1000);
  logger.info(`Version B of ${slug}: ${next.payload.phase}`);
  // oxlint-disable-next-line no-await-in-loop
  next = await advanceDemoVsl(next.payload);
}

const done = await db.query.demoSchema.findFirst({ where: eq(demoSchema.id, demo.id) });
logger.info(`Version B of ${slug} is ${z.string().parse(done?.vsl?.voice)}`);
process.exit(0);
