import { setTimeout as sleep } from 'node:timers/promises';
import * as z from 'zod';
import { Env } from '@/libs/Env';
import { requireEnv } from '@/utils/Helpers';

const KIE_API_URL = 'https://api.kie.ai';

/** Uploads live on a host of their own, whatever the docs say. */
const KIE_UPLOAD_URL = 'https://kieai.redpandaai.co';

const POLL_INTERVAL_MS = 5000;

const MAX_POLLS = 240;

const DOWNLOAD_ATTEMPTS = 6;

const DOWNLOAD_RETRY_MS = 30_000;

const envelopeSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z.unknown(),
});

const taskSchema = z.object({ taskId: z.string() });

const recordSchema = z.object({
  state: z.string(),
  resultJson: z.string().nullish(),
  failMsg: z.string().nullish(),
});

const resultSchema = z.object({ resultUrls: z.array(z.string()).min(1) });

const uploadSchema = z.object({ downloadUrl: z.string() });

/**
 * Calls Kie, which answers HTTP 200 even on errors and reports them in `code`.
 * @param url The endpoint URL.
 * @param body The JSON body, sent as a POST when present.
 * @returns The `data` of the response.
 * @throws {Error} When Kie reports an error.
 */
const kie = async (url: string, body?: Record<string, unknown>) => {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${requireEnv('KIE_API_KEY', Env.KIE_API_KEY)}`,
      'Content-Type': 'application/json',
    },
    body: body && JSON.stringify(body),
  });
  const envelope = envelopeSchema.parse(await response.json());

  if (envelope.code !== 200) {
    throw new Error(`Kie ${url} failed with ${envelope.code}: ${envelope.msg ?? ''}`);
  }

  return envelope.data;
};

/**
 * Starts a Kie generation task without waiting for it.
 * @param model The model id.
 * @param input The model input.
 * @returns The task id, to read with `readKieTask`.
 */
export const createKieTask = async (model: string, input: Record<string, unknown>) =>
  taskSchema.parse(await kie(`${KIE_API_URL}/api/v1/jobs/createTask`, { model, input })).taskId;

/**
 * Reads where a Kie task stands.
 * @param taskId The task.
 * @returns The URL of the generated file, or null while the task is still running.
 * @throws {Error} When the task failed.
 */
export const readKieTask = async (taskId: string) => {
  const record = recordSchema.parse(
    await kie(`${KIE_API_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`),
  );

  if (record.state === 'success' && record.resultJson) {
    return resultSchema.parse(JSON.parse(record.resultJson)).resultUrls[0] ?? '';
  }

  if (record.state === 'fail') {
    throw new Error(`Kie task ${taskId} failed: ${record.failMsg ?? 'no reason given'}`);
  }

  return null;
};

/**
 * Runs a Kie generation task to the end, waiting in-process: for scripts, not requests.
 * @param model The model id.
 * @param input The model input.
 * @returns The URL of the generated file, which Kie keeps for 14 days.
 * @throws {Error} When the task fails or takes too long.
 */
export const runKieTask = async (model: string, input: Record<string, unknown>) => {
  const taskId = await createKieTask(model, input);

  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const url = await readKieTask(taskId);

    if (url !== null) {
      return url;
    }

    // oxlint-disable-next-line no-await-in-loop
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Kie task ${taskId} did not finish in time`);
};

/**
 * Uploads a file to Kie, which keeps it for 24 hours.
 * @param options The upload.
 * @param options.data The file content.
 * @param options.mimeType Its media type.
 * @param options.fileName The name to store it under.
 * @returns The public URL of the file.
 */
export const uploadToKie = async (options: { data: Buffer; mimeType: string; fileName: string }) =>
  uploadSchema.parse(
    await kie(`${KIE_UPLOAD_URL}/api/file-base64-upload`, {
      base64Data: `data:${options.mimeType};base64,${options.data.toString('base64')}`,
      uploadPath: 'girhouse/gigi',
      fileName: options.fileName,
    }),
  ).downloadUrl;

/**
 * Downloads a file Kie generated. Its file host sometimes drops connections for a few
 * minutes, so a failed download is tried again after a pause.
 * @param url The file URL.
 * @returns The file content.
 * @throws {Error} When every attempt fails.
 */
export const downloadFromKie = async (url: string) => {
  for (let attempt = 1; attempt < DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_RETRY_MS) });

      if (response.ok) {
        // oxlint-disable-next-line no-await-in-loop
        return Buffer.from(await response.arrayBuffer());
      }
    } catch {
      // Dropped or timed out: wait and try again
    }

    // oxlint-disable-next-line no-await-in-loop
    await sleep(DOWNLOAD_RETRY_MS);
  }

  const response = await fetch(url);

  return Buffer.from(await response.arrayBuffer());
};
