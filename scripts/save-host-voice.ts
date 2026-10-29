/**
 * Saves Gianmarco's recordings, from which Gemini clones the voice of version B, in the
 * database, where they stay private:
 *
 *   npx dotenv -c -- npx tsx scripts/save-host-voice.ts voce.wav consenso.wav
 *
 * The first is 10 to 30 seconds of natural Italian, the second the consent sentence, both
 * WAV, 24 kHz mono 16-bit, from the same microphone. Saving them again replaces them.
 */
import { readFile } from 'node:fs/promises';
import * as z from 'zod';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { hostVoiceSchema } from '@/models/Schema';
import { readWav } from '@/utils/Mp3';

const [source, consent] = z.tuple([z.string(), z.string()]).parse(process.argv.slice(2));

for (const [kind, path] of [
  ['source', source],
  ['consent', consent],
] as const) {
  // oxlint-disable-next-line no-await-in-loop
  const file = await readFile(path);
  // Throws on anything but 16-bit PCM WAV, which is all Gemini takes
  readWav(file);
  const values = { kind, contentType: 'audio/wav', data: file.toString('base64') };

  // oxlint-disable-next-line no-await-in-loop
  await db
    .insert(hostVoiceSchema)
    .values(values)
    .onConflictDoUpdate({ target: hostVoiceSchema.kind, set: values });
  logger.info(`Saved the ${kind} recording`);
}

process.exit(0);
