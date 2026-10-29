import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
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
import { conversationSchema, demoSchema, demoVoiceSchema, jobSchema } from '@/models/Schema';
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

/** Past this, the lines Kie has voiced are kept and the others are only typed. */
const VOICE_TIMEOUT_MS = 15 * 60 * 1000;

/** A line Kie fails to voice is asked again this many times. */
const VOICE_RETRIES = 1;

const taskSchema = z.object({
  line: z.string(),
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

type VoiceTask = z.infer<typeof taskSchema>;

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
 * Asks Kie to voice one of Gigi's lines.
 * @param text What he says.
 * @returns The Kie task.
 */
const startVoice = async (text: string) =>
  await createKieTask(TTS_MODEL, {
    speakers: [{ speaker_id: 'Speaker 1', voice_name: GIGI_VOICE_NAME }],
    dialogue_turns: [{ speaker_id: 'Speaker 1', style: GIGI_VOICE_STYLE, text }],
  });

/**
 * Reads where one voice stands, asking again once when Kie failed it.
 * @param task The voice task.
 * @returns The task, updated.
 */
const pollVoice = async (task: VoiceTask): Promise<VoiceTask> => {
  if (task.url || task.isFailed) {
    return task;
  }

  try {
    return { ...task, url: await readKieTask(task.taskId) };
  } catch (error) {
    if (task.retries >= VOICE_RETRIES) {
      logger.warn('Kie could not voice {line}: {error}', {
        line: task.line,
        error: error instanceof Error ? error.message : String(error),
      });

      return { ...task, isFailed: true };
    }

    return { ...task, taskId: await startVoice(task.text), retries: task.retries + 1 };
  }
};

/**
 * Downloads one voice Kie made, as MP3.
 * @param task The voice task, done.
 * @returns The line, what it says and the MP3.
 */
const downloadVoice = async (task: VoiceTask & { url: string }) => ({
  line: task.line,
  text: task.text,
  ...wavToMp3(await downloadFromKie(task.url)),
});

/**
 * Downloads the voices Kie made, stores them as MP3 in place of the demo's old ones and
 * marks version B as voiced.
 * @param demo The demo.
 * @param tasks The voice tasks.
 */
const storeVoices = async (demo: Demo, tasks: VoiceTask[]) => {
  const voiced: Awaited<ReturnType<typeof downloadVoice>>[] = [];

  // One at a time: Kie's file host drops connections when many come at once
  for (const task of tasks) {
    if (task.url) {
      // oxlint-disable-next-line no-await-in-loop
      voiced.push(await downloadVoice({ ...task, url: task.url }));
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(demoVoiceSchema).where(eq(demoVoiceSchema.demoId, demo.id));

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

    await tx
      .update(demoSchema)
      .set({
        vsl: sql`jsonb_set(${demoSchema.vsl}, '{voice}', ${JSON.stringify(voiced.length > 0 ? 'ready' : 'failed')}::jsonb)`,
      })
      .where(eq(demoSchema.id, demo.id));
  });
};

/**
 * Moves version B on by one phase: the script, then the voice tasks, then their results.
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
    const tasks: VoiceTask[] = [];

    // One at a time: Kie refuses calls that come too fast
    for (const entry of await renderVoiceLines(demo, demo.vsl)) {
      // oxlint-disable-next-line no-await-in-loop
      const taskId = await startVoice(entry.text);

      tasks.push({ ...entry, taskId, retries: 0, url: null, isFailed: false });
    }

    return {
      payload: { ...payload, phase: 'voice_poll', tasks, voiceStartedAt: Date.now() },
      delaySeconds: pollDelaySeconds(0),
    };
  }

  const tasks: VoiceTask[] = [];

  for (const task of payload.tasks) {
    // oxlint-disable-next-line no-await-in-loop
    tasks.push(await pollVoice(task));
  }

  const elapsed = Date.now() - (payload.voiceStartedAt ?? Date.now());
  const isWaiting = tasks.some((task) => !task.url && !task.isFailed);

  if (isWaiting && elapsed < VOICE_TIMEOUT_MS) {
    return { payload: { ...payload, tasks }, delaySeconds: pollDelaySeconds(elapsed) };
  }

  await storeVoices(demo, tasks);

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
 * Writes and voices version B of a demo again, in the background. A request still queued
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
