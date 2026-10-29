import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import sharp from 'sharp';
import * as z from 'zod';
import { landingSectionsFor } from '@/components/demo/TourScenes';
import type { VslWrittenLine } from '@/components/demo/vsl/VslScript';
import {
  buildVslScenes,
  VSL_TOUR_LINES,
  vslLineMarkup,
  vslLinesToVoice,
  vslLineValues,
  withVslChat,
} from '@/components/demo/vsl/VslScript';
import messages from '@/locales/it.json';
import type { DemoVsl } from '@/models/Schema';
import {
  conversationSchema,
  demoPhotoSchema,
  demoSchema,
  demoVoiceSchema,
  jobSchema,
} from '@/models/Schema';
import { toDemoVsl, writeDemoVsl } from '@/services/DemoVslWriter';
import { createKieTask, downloadFromKie, readKieTask } from '@/services/Kie';
import { GIGI_VOICE_NAME, GIGI_VOICE_STYLE, toSpokenText } from '@/utils/GigiVoice';
import { wavToMp3 } from '@/utils/Mp3';
import { getAutomationSettings } from './AutomationSettings';
import { db } from './DB';
import { loadDemoReviews } from './DemoReviews';
import { completeJob, enqueue, pollDelaySeconds, rescheduleJob } from './JobQueue';
import { logger } from './Logger';
import { recordCopywritingUsage } from './Usage';

type Job = typeof jobSchema.$inferSelect;

type Demo = typeof demoSchema.$inferSelect;

const TTS_MODEL = 'google/gemini-3-8-flash-tts';

/** 4 credits a photo at 1K. */
const PHOTO_MODEL = 'nano-banana-2-1';

/** Added to every prompt the AI writes, so the photos look alike. */
const PHOTO_STYLE =
  'Candid documentary photograph, natural light, shallow depth of field, realistic, 35mm. No text, no logos, no captions, no readable words on screens or paper.';

/** Wide enough for the frame on a large screen. */
const PHOTO_WIDTH = 1280;

const PHOTO_QUALITY = 78;

/** Past this, the lines Kie has voiced are kept and the others are only typed, without a photo. */
const VOICE_TIMEOUT_MS = 15 * 60 * 1000;

/** A voice or a photo Kie fails is asked again this many times. */
const VOICE_RETRIES = 1;

const taskSchema = z.object({
  // Jobs from before the photos only voiced
  kind: z.enum(['voice', 'photo']).default('voice'),
  line: z.string(),
  // What the voice says, or the prompt of the photo
  text: z.string(),
  taskId: z.string(),
  retries: z.number().int(),
  url: z.string().nullable(),
  // Kie gave up on it for good
  isFailed: z.boolean(),
});

const payloadSchema = z.object({
  demoId: z.uuid(),
  // Stamps the version B this job writes, so a newer request makes it stop
  generatedAt: z.string(),
  phase: z.enum(['script', 'voice_start', 'voice_poll']),
  tasks: z.array(taskSchema).default([]),
  voiceStartedAt: z.number().optional(),
});

type Payload = z.infer<typeof payloadSchema>;

type KieTask = z.infer<typeof taskSchema>;

/**
 * Reads what the lines the page shows say, with the facts the page reads.
 * @param demo The demo.
 * @param vsl The version whose chat the lines name.
 * @returns The snapshot with version B's chat, the reviews and the line values.
 */
const loadLineContext = async (demo: Demo, vsl: Pick<DemoVsl, 'chat'>) => {
  const settings = await getAutomationSettings(demo.organizationId);
  const { reviews } = await loadDemoReviews({
    data: demo.data,
    formatWhen: (date) => date.toISOString(),
  });
  const data = withVslChat(demo.data, vsl);
  const values = vslLineValues({
    company: data.company,
    customer: data.chat.customerName,
    reviews,
    price: settings.monthlyPrice,
    slots: settings.onboardingSlotsPerMonth,
  });

  return { settings, data, hasReviews: reviews.items.length > 0, values };
};

/**
 * Writes version B's script from the demo already built, and stores it waiting for its voice.
 * @param demo The demo.
 * @param generatedAt The stamp of this version B.
 * @throws {Error} When the AI answer does not parse, so the job retries.
 */
const writeScript = async (demo: Demo, generatedAt: string) => {
  const context = await loadLineContext(demo, demo.data);
  const t = createTranslator({ locale: 'it', messages, namespace: 'DemoPage' });
  const sections = landingSectionsFor({ data: demo.data, hasReviews: context.hasReviews });
  // Version A's line for the scenes it shares, as a reference for length and tone
  const referenceLines: Partial<Record<VslWrittenLine, string>> = Object.fromEntries(
    VSL_TOUR_LINES.map((line) => [line, toSpokenText(t.markup(`line_${line}`, context.values))]),
  );

  const { texts, call } = await writeDemoVsl({
    model: context.settings.classificationModel,
    data: demo.data,
    notes: demo.guidance,
    sections,
    referenceLines,
  });

  const conversation = await db.query.conversationSchema.findFirst({
    where: eq(conversationSchema.id, demo.conversationId),
  });

  // Recorded before the answer is checked: an unparsable answer is still billed
  if (conversation) {
    await recordCopywritingUsage({
      userId: conversation.userId,
      organizationId: conversation.organizationId,
      campaignId: conversation.campaignId,
      sequence: call,
    });
  }

  if (!texts) {
    throw new Error(`${call.model} returned no parsable version B for demo ${demo.id}`);
  }

  const vsl: DemoVsl = { ...toDemoVsl(texts), generatedAt };

  await db.update(demoSchema).set({ vsl }).where(eq(demoSchema.id, demo.id));
};

/**
 * Lists what Gigi says in version B, written exactly as the page will show it.
 * @param demo The demo, with its version B.
 * @param vsl Its version B.
 * @returns Each line and its spoken text, empty ones left out.
 */
const renderVoiceLines = async (demo: Demo, vsl: DemoVsl) => {
  const context = await loadLineContext(demo, vsl);
  const t = createTranslator({ locale: 'it', messages, namespace: 'DemoPage' });
  const scenes = buildVslScenes({ data: context.data, hasReviews: context.hasReviews });

  return vslLinesToVoice(scenes)
    .map((line) => ({
      line,
      text: toSpokenText(
        vslLineMarkup({
          line,
          vsl,
          translate: {
            fixed: (key) => t.markup(`vsl_line_${key}`, context.values),
            tour: (key) => t.markup(`line_${key}`, context.values),
          },
        }),
      ),
    }))
    .filter((entry) => entry.text);
};

/**
 * Asks Kie to voice one of Gigi's lines. Gianmarco's own cloned voice, from the recordings
 * in `host_voice`, was used on 29/10 and set aside when Gigi came back (see commit 3204160).
 * @param text What he says.
 * @returns The Kie task.
 */
const startVoice = async (text: string) =>
  await createKieTask(TTS_MODEL, {
    speakers: [{ speaker_id: 'Speaker 1', voice_name: GIGI_VOICE_NAME }],
    dialogue_turns: [{ speaker_id: 'Speaker 1', style: GIGI_VOICE_STYLE, text }],
  });

/**
 * Asks Kie for the photo behind one of Gigi's lines.
 * @param prompt What it shows, as the AI wrote it.
 * @returns The Kie task.
 */
const startPhoto = async (prompt: string) =>
  await createKieTask(PHOTO_MODEL, {
    prompt: `${prompt} ${PHOTO_STYLE}`,
    aspect_ratio: '16:9',
    resolution: '1K',
    output_format: 'jpg',
  });

/**
 * Asks Kie for a voice or a photo.
 * @param task What to make.
 * @returns The Kie task.
 */
const startTask = async (task: Pick<KieTask, 'kind' | 'text'>) =>
  await (task.kind === 'photo' ? startPhoto(task.text) : startVoice(task.text));

/**
 * Reads where one voice or photo stands, asking again once when Kie failed it.
 * @param task The task.
 * @returns The task, updated.
 */
const pollTask = async (task: KieTask): Promise<KieTask> => {
  if (task.url || task.isFailed) {
    return task;
  }

  try {
    return { ...task, url: await readKieTask(task.taskId) };
  } catch (error) {
    if (task.retries >= VOICE_RETRIES) {
      logger.warn('Kie could not make the {kind} of {line}: {error}', {
        kind: task.kind,
        line: task.line,
        error: error instanceof Error ? error.message : String(error),
      });

      return { ...task, isFailed: true };
    }

    return { ...task, taskId: await startTask(task), retries: task.retries + 1 };
  }
};

/**
 * Downloads one voice Kie made, as MP3.
 * @param task The voice task, done.
 * @returns The line, what it says and the MP3.
 */
const downloadVoice = async (task: KieTask & { url: string }) => ({
  line: task.line,
  text: task.text,
  ...wavToMp3(await downloadFromKie(task.url)),
});

/**
 * Downloads one photo Kie made, shrunk to what the frame shows.
 * @param task The photo task, done.
 * @returns The line, its prompt and the JPEG.
 */
const downloadPhoto = async (task: KieTask & { url: string }) => ({
  line: task.line,
  prompt: task.text,
  data: await sharp(await downloadFromKie(task.url))
    .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
    .toBuffer(),
});

/**
 * Downloads the voices and photos Kie made, stores them in place of the demo's old ones
 * and marks version B as voiced.
 * @param demo The demo.
 * @param tasks The voice and photo tasks.
 */
const storeResults = async (demo: Demo, tasks: KieTask[]) => {
  const voiced: Awaited<ReturnType<typeof downloadVoice>>[] = [];
  const photos: Awaited<ReturnType<typeof downloadPhoto>>[] = [];

  // One at a time: Kie's file host drops connections when many come at once
  for (const task of tasks) {
    if (task.url && task.kind === 'photo') {
      // oxlint-disable-next-line no-await-in-loop
      photos.push(await downloadPhoto({ ...task, url: task.url }));
    } else if (task.url) {
      // oxlint-disable-next-line no-await-in-loop
      voiced.push(await downloadVoice({ ...task, url: task.url }));
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(demoVoiceSchema).where(eq(demoVoiceSchema.demoId, demo.id));
    await tx.delete(demoPhotoSchema).where(eq(demoPhotoSchema.demoId, demo.id));

    if (voiced.length > 0) {
      await tx.insert(demoVoiceSchema).values(
        voiced.map((voice) => ({
          demoId: demo.id,
          line: voice.line,
          text: voice.text,
          contentType: 'audio/mpeg',
          data: voice.data.toString('base64'),
          seconds: voice.seconds,
        })),
      );
    }

    if (photos.length > 0) {
      await tx.insert(demoPhotoSchema).values(
        photos.map((photo) => ({
          demoId: demo.id,
          line: photo.line,
          prompt: photo.prompt,
          contentType: 'image/jpeg',
          data: photo.data.toString('base64'),
        })),
      );
    }

    await tx
      .update(demoSchema)
      .set({
        vsl: sql`jsonb_set(${demoSchema.vsl}, '{voice}', ${JSON.stringify(voiced.length > 0 ? 'ready' : 'failed')}::jsonb)`,
      })
      .where(eq(demoSchema.id, demo.id));
  });
};

/**
 * Moves version B on by one phase: the script, then the voice and photo tasks, then their results.
 * @param payload Where version B stands.
 * @returns Where it stands next and when to look again, or null once it is done.
 */
export const advanceDemoVsl = async (
  payload: Payload,
): Promise<{ payload: Payload; delaySeconds: number } | null> => {
  const demo = await db.query.demoSchema.findFirst({ where: eq(demoSchema.id, payload.demoId) });

  // Gone, or a newer request took over: nothing left to do
  if (!demo || (payload.phase !== 'script' && demo.vsl?.generatedAt !== payload.generatedAt)) {
    return null;
  }

  if (payload.phase === 'script') {
    await writeScript(demo, payload.generatedAt);

    return { payload: { ...payload, phase: 'voice_start' }, delaySeconds: 0 };
  }

  if (payload.phase === 'voice_start' && demo.vsl) {
    const tasks: KieTask[] = [];
    const lines = await renderVoiceLines(demo, demo.vsl);
    const entries = [
      ...lines.map((entry) => ({
        ...entry,
        kind: 'voice' as const,
      })),
      ...Object.entries(demo.vsl.images ?? {}).map(([line, text]) => ({
        line,
        text,
        kind: 'photo' as const,
      })),
    ];

    // One at a time: Kie refuses calls that come too fast
    for (const entry of entries) {
      // oxlint-disable-next-line no-await-in-loop
      const taskId = await startTask(entry);

      tasks.push({ ...entry, taskId, retries: 0, url: null, isFailed: false });
    }

    return {
      payload: { ...payload, phase: 'voice_poll', tasks, voiceStartedAt: Date.now() },
      delaySeconds: pollDelaySeconds(0),
    };
  }

  const tasks: KieTask[] = [];

  for (const task of payload.tasks) {
    // oxlint-disable-next-line no-await-in-loop
    tasks.push(await pollTask(task));
  }

  const elapsed = Date.now() - (payload.voiceStartedAt ?? Date.now());
  const isWaiting = tasks.some((task) => !task.url && !task.isFailed);

  if (isWaiting && elapsed < VOICE_TIMEOUT_MS) {
    return { payload: { ...payload, tasks }, delaySeconds: pollDelaySeconds(elapsed) };
  }

  await storeResults(demo, tasks);

  return null;
};

/**
 * Runs one phase of version B for the worker.
 * @param job The `demo_vsl` job.
 */
const runDemoVslJob = async (job: Job) => {
  const next = await advanceDemoVsl(payloadSchema.parse(job.payload));

  await (next ? rescheduleJob({ jobId: job.id, ...next }) : completeJob(job.id));
};

export const demoVslJobHandlers = {
  demo_vsl: runDemoVslJob,
};

/**
 * Marks a version B whose job ran out of attempts as unvoiced: the page types its lines.
 * @param job The abandoned job.
 * @param message The last error.
 */
export const markDemoVslAbandoned = async (job: Job, message: string) => {
  const payload = payloadSchema.safeParse(job.payload);

  logger.warn('Version B of demo {demoId} was abandoned: {error}', {
    demoId: payload.data?.demoId,
    error: message,
  });

  if (!payload.success) {
    return;
  }

  await db
    .update(demoSchema)
    .set({ vsl: sql`jsonb_set(${demoSchema.vsl}, '{voice}', '"failed"'::jsonb)` })
    .where(
      and(
        eq(demoSchema.id, payload.data.demoId),
        sql`${demoSchema.vsl}->>'generatedAt' = ${payload.data.generatedAt}`,
      ),
    );
};

/**
 * Finds the `demo_vsl` jobs still to run for a demo.
 * @param demoId The demo.
 * @returns The jobs, queued or running.
 */
const findVslJobs = async (demoId: string) =>
  await db
    .select({ id: jobSchema.id, status: jobSchema.status })
    .from(jobSchema)
    .where(
      and(
        eq(jobSchema.type, 'demo_vsl'),
        inArray(jobSchema.status, ['queued', 'running']),
        sql`${jobSchema.payload}->>'demoId' = ${demoId}`,
      ),
    );

/**
 * Writes, voices and illustrates version B of a demo again, in the background. A request still queued
 * is dropped, so only the newest one is built.
 * @param demoId The demo.
 */
export const requestDemoVsl = async (demoId: string) => {
  const jobs = await findVslJobs(demoId);
  const queued = jobs.filter((job) => job.status === 'queued');

  if (queued.length > 0) {
    await db
      .update(jobSchema)
      .set({ status: 'done' })
      .where(
        inArray(
          jobSchema.id,
          queued.map((job) => job.id),
        ),
      );
  }

  await enqueue([
    {
      type: 'demo_vsl',
      payload: { demoId, generatedAt: new Date().toISOString(), phase: 'script' },
    },
  ]);
};

/**
 * Tells where a demo's version B stands, for the dashboard.
 * @param demo The demo.
 * @returns `building` while a job runs, else the state of its voice, or `none` before any.
 */
export const demoVslStatus = async (demo: Demo) => {
  const jobs = await findVslJobs(demo.id);

  if (jobs.length > 0) {
    return 'building' as const;
  }

  if (!demo.vsl) {
    return 'none' as const;
  }

  return demo.vsl.voice === 'failed' ? ('unvoiced' as const) : ('ready' as const);
};

/**
 * Lists the voices of a demo's version B, without their files.
 * @param demoId The demo.
 * @returns Each line's voice: its id, what it says and its length.
 */
export const getDemoVoices = async (demoId: string) =>
  await db
    .select({
      id: demoVoiceSchema.id,
      line: demoVoiceSchema.line,
      text: demoVoiceSchema.text,
      seconds: demoVoiceSchema.seconds,
    })
    .from(demoVoiceSchema)
    .where(eq(demoVoiceSchema.demoId, demoId));

/**
 * Lists the photos of a demo's version B, without their files.
 * @param demoId The demo.
 * @returns Each photo: its id, the line it goes behind and its prompt.
 */
export const getDemoPhotos = async (demoId: string) =>
  await db
    .select({ id: demoPhotoSchema.id, line: demoPhotoSchema.line, prompt: demoPhotoSchema.prompt })
    .from(demoPhotoSchema)
    .where(eq(demoPhotoSchema.demoId, demoId));
