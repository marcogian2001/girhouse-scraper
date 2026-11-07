import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import sharp from 'sharp';
import * as z from 'zod';
import {
  buildVideoScenes,
  isPortraitLine,
  VIDEO_CLOSING,
  portraitLine,
  videoLineMarkup,
  videoLinesToVoice,
} from '@/components/demo/vsl/VideoScript';
import { vslLineValues, withVslChat } from '@/components/demo/vsl/VslScript';
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
import { speakAsHost } from '@/services/ElevenLabs';
import { createKieTask, downloadFromKie, readKieTask } from '@/services/Kie';
import { GIGI_VOICE_NAME, GIGI_VOICE_STYLE, toSpokenText } from '@/utils/GigiVoice';
import type { Narrator } from '@/utils/HostVoice';
import { HOST_VOICE_SAMPLE_RATE } from '@/utils/HostVoice';
import { pcmToMp3, wavToMp3 } from '@/utils/Mp3';
import { getAutomationSettings } from './AutomationSettings';
import { db } from './DB';
import { loadDemoReviews } from './DemoReviews';
import { completeJob, enqueue, pollDelaySeconds, rescheduleJob } from './JobQueue';
import { logger } from './Logger';
import { recordCopywritingUsage, recordKieUsage } from './Usage';

type Job = typeof jobSchema.$inferSelect;

type Demo = typeof demoSchema.$inferSelect;

const TTS_MODEL = 'google/gemini-3-8-flash-tts';

const PHOTO_MODEL = 'nano-banana-2-1';

/** Added to every prompt the AI writes, so the photos look alike. */
const PHOTO_STYLE =
  'Candid documentary photograph, natural light, shallow depth of field, realistic, 35mm. No text, no logos, no captions, no readable words on screens or paper.';

/** Wide enough for the frame on a large screen. */
const PHOTO_WIDTH = 1920;

/** The tall photos for phones: sharp on a phone held upright. */
const PORTRAIT_WIDTH = 1080;

const PHOTO_QUALITY = 86;

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
  // What Kie charged once it is made
  credits: z.number().default(0),
  // Kie gave up on it for good
  isFailed: z.boolean(),
});

const payloadSchema = z.object({
  demoId: z.uuid(),
  // Stamps the version B this job writes, so a newer request makes it stop
  generatedAt: z.string(),
  phase: z.enum(['script', 'voice_start', 'voice_poll']),
  // Who tells the video the script phase writes
  narrator: z.enum(['gigi', 'gianmarco']).default('gigi'),
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

  return { data, values };
};

/**
 * Finds who a demo's spend is billed to: the conversation it was made for.
 * @param demo The demo.
 * @returns The conversation's owner and campaign, or undefined once it is gone.
 */
const findDemoOwner = async (demo: Demo) =>
  await db.query.conversationSchema.findFirst({
    columns: { userId: true, organizationId: true, campaignId: true },
    where: eq(conversationSchema.id, demo.conversationId),
  });

/**
 * Writes version B's script from the demo already built, and stores it waiting for its voice.
 * @param demo The demo.
 * @param generatedAt The stamp of this version B.
 * @param narrator Who tells the video.
 * @throws {Error} When the AI answer does not parse, so the job retries.
 */
const writeScript = async (demo: Demo, generatedAt: string, narrator: Narrator) => {
  const settings = await getAutomationSettings(demo.organizationId);

  const { texts, call } = await writeDemoVsl({
    model: settings.classificationModel,
    data: demo.data,
    notes: demo.guidance,
    narrator,
  });

  const conversation = await findDemoOwner(demo);

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
    throw new Error(`${call.model} returned no parsable video for demo ${demo.id}`);
  }

  const vsl: DemoVsl = {
    ...toDemoVsl(texts),
    closing: VIDEO_CLOSING,
    narrator,
    generatedAt,
  };

  await db.update(demoSchema).set({ vsl, version: 'c' }).where(eq(demoSchema.id, demo.id));
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
  const closing = VIDEO_CLOSING;
  const scenes = buildVideoScenes({ data: context.data, closing });

  return videoLinesToVoice(scenes, closing)
    .map((line) => ({
      line,
      text: toSpokenText(
        videoLineMarkup({
          line,
          vsl,
          translate: (key) => t.markup(key, context.values),
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
 * Asks Kie for the photo behind one of Gigi's lines, wide or tall.
 * @param prompt What it shows, as the AI wrote it.
 * @param isPortrait Whether it is the tall one for phones.
 * @returns The Kie task.
 */
const startPhoto = async (prompt: string, isPortrait: boolean) =>
  await createKieTask(PHOTO_MODEL, {
    prompt: `${prompt} ${PHOTO_STYLE}`,
    aspect_ratio: isPortrait ? '9:16' : '16:9',
    resolution: '2K',
    output_format: 'jpg',
  });

/**
 * Asks Kie for a voice or a photo.
 * @param task What to make.
 * @returns The Kie task.
 */
const startTask = async (task: Pick<KieTask, 'kind' | 'line' | 'text'>) =>
  await (task.kind === 'photo'
    ? startPhoto(task.text, isPortraitLine(task.line))
    : startVoice(task.text));

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
    return { ...task, ...(await readKieTask(task.taskId)) };
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
 * Says every line in Gianmarco's cloned voice. ElevenLabs answers at once, so this runs
 * when the photos are in, right before everything is stored.
 * @param demo The demo.
 * @param vsl Its script.
 * @returns Each line, what it says and the MP3; lines ElevenLabs refused are left out.
 */
const voiceAsHost = async (demo: Demo, vsl: DemoVsl) => {
  const voiced: Awaited<ReturnType<typeof downloadVoice>>[] = [];

  for (const entry of await renderVoiceLines(demo, vsl)) {
    try {
      // One at a time, like the Kie voices
      // oxlint-disable-next-line no-await-in-loop
      const samples = await speakAsHost(entry.text);

      voiced.push({ ...entry, ...pcmToMp3(samples, HOST_VOICE_SAMPLE_RATE) });
    } catch (error) {
      // Only typed, like a voice Kie gave up on
      logger.warn('ElevenLabs could not voice {line}: {error}', {
        line: entry.line,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return voiced;
};

/**
 * Downloads one photo Kie made, shrunk to what the frame shows.
 * @param task The photo task, done.
 * @returns The line, its prompt and the JPEG.
 */
const downloadPhoto = async (task: KieTask & { url: string }) => ({
  line: task.line,
  prompt: task.text,
  data: await sharp(await downloadFromKie(task.url))
    .resize({
      width: isPortraitLine(task.line) ? PORTRAIT_WIDTH : PHOTO_WIDTH,
      withoutEnlargement: true,
    })
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
  const voiced = demo.vsl?.narrator === 'gianmarco' ? await voiceAsHost(demo, demo.vsl) : [];
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
    await writeScript(demo, payload.generatedAt, payload.narrator);

    return { payload: { ...payload, phase: 'voice_start' }, delaySeconds: 0 };
  }

  if (payload.phase === 'voice_start' && demo.vsl) {
    const tasks: KieTask[] = [];
    // Gianmarco's voice comes from ElevenLabs at the end, not from Kie
    const lines = demo.vsl.narrator === 'gianmarco' ? [] : await renderVoiceLines(demo, demo.vsl);
    const entries = [
      ...lines.map((entry) => ({
        ...entry,
        kind: 'voice' as const,
      })),
      // Version C has a tall photo for phones next to each wide one
      ...Object.entries(demo.vsl.images ?? {}).flatMap(([line, text]) =>
        (demo.version === 'c' ? [line, portraitLine(line)] : [line]).map((key) => ({
          line: key,
          text,
          kind: 'photo' as const,
        })),
      ),
    ];

    // One at a time: Kie refuses calls that come too fast
    for (const entry of entries) {
      // oxlint-disable-next-line no-await-in-loop
      const taskId = await startTask(entry);

      tasks.push({ ...entry, taskId, retries: 0, url: null, credits: 0, isFailed: false });
    }

    return {
      payload: { ...payload, phase: 'voice_poll', tasks, voiceStartedAt: Date.now() },
      delaySeconds: pollDelaySeconds(0),
    };
  }

  const tasks: KieTask[] = [];
  const owner = await findDemoOwner(demo);

  for (const task of payload.tasks) {
    // oxlint-disable-next-line no-await-in-loop
    const polled = await pollTask(task);

    // Recorded as soon as it is made: Kie charges for it even if storing it fails
    if (owner && polled.url && !task.url) {
      // oxlint-disable-next-line no-await-in-loop
      await recordKieUsage({
        userId: owner.userId,
        organizationId: owner.organizationId,
        campaignId: owner.campaignId ?? undefined,
        taskId: polled.taskId,
        model: polled.kind === 'photo' ? PHOTO_MODEL : TTS_MODEL,
        credits: polled.credits,
      });
    }

    tasks.push(polled);
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
