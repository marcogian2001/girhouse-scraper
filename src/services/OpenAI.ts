import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import * as z from 'zod';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import {
  BATCH_PRICE_FACTOR,
  requireCopywritingModel,
  toCopywritingEffort,
} from '@/utils/CopywritingModels';
import { requireEnv } from '@/utils/Helpers';
import type {
  Campaign,
  SequenceBatchOutcome,
  SequenceBatchRequest,
  SequenceBatchResult,
  WriteSequenceOptions,
  WrittenSequence,
} from './EmailPrompt';
import {
  buildCampaignBrief,
  buildContactPrompt,
  emailSequenceSchema,
  normalizeSequence,
  parseSequenceText,
  SYSTEM_INSTRUCTIONS,
} from './EmailPrompt';

const MAX_OUTPUT_TOKENS = 16_000;

let client: OpenAI | undefined;

/**
 * Returns the shared OpenAI client, created on first use.
 * @returns The configured OpenAI client.
 * @throws {Error} When `OPENAI_API_KEY` is not configured.
 */
const getClient = () => {
  client ??= new OpenAI({
    apiKey: requireEnv('OPENAI_API_KEY', Env.OPENAI_API_KEY),
  });

  return client;
};

type GptModel = ReturnType<typeof requireCopywritingModel<'openai'>>;

/** The usage fields pricing reads, as both the SDK and raw batch results report them. */
type UsageCounts = {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details: { cached_tokens: number; cache_write_tokens: number };
};

/** One line of a batch output or error file. */
const batchLineSchema = z.object({
  custom_id: z.string(),
  response: z.object({ status_code: z.number(), body: z.unknown() }).nullish(),
  error: z.object({ message: z.string() }).nullish(),
});

/** The parts of a raw Responses body a batch result is read from. */
const responseBodySchema = z.object({
  id: z.string(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    input_tokens_details: z.object({
      cached_tokens: z.number().default(0),
      cache_write_tokens: z.number().default(0),
    }),
  }),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
});

const errorBodySchema = z.object({ error: z.object({ message: z.string() }) });

/**
 * Splits OpenAI's usage into the columns the usage table stores. OpenAI counts
 * cached and cache-written tokens inside `input_tokens`; reasoning tokens are
 * already part of `output_tokens`.
 * @param usage The token counts OpenAI reported for the call.
 * @returns Uncached input, output, cache writes and cache reads.
 */
export const splitUsage = (usage: UsageCounts) => {
  const cacheReadTokens = usage.input_tokens_details.cached_tokens;
  const cacheWriteTokens = usage.input_tokens_details.cache_write_tokens;

  return {
    inputTokens: usage.input_tokens - cacheReadTokens - cacheWriteTokens,
    outputTokens: usage.output_tokens,
    cacheWriteTokens,
    cacheReadTokens,
  };
};

/**
 * Prices one copywriting call at list rates, halved for batch calls. Cache
 * writes bill as plain input.
 * Dollars per million tokens times tokens is exactly millionths of a dollar.
 * @param options The pricing options.
 * @param options.usage The token counts OpenAI reported for the call.
 * @param options.model The model that served the call.
 * @param options.batch Whether the call went through the batch API.
 * @returns The cost in millionths of a US dollar.
 */
export const estimateCostMicros = (options: {
  usage: UsageCounts;
  model: GptModel;
  batch: boolean;
}) => {
  const tokens = splitUsage(options.usage);
  const price = options.model.pricing;

  return Math.round(
    ((tokens.inputTokens + tokens.cacheWriteTokens) * price.input +
      tokens.cacheReadTokens * price.cacheRead +
      tokens.outputTokens * price.output) *
      (options.batch ? BATCH_PRICE_FACTOR : 1),
  );
};

/**
 * Builds the request that writes one contact's sequence, shared by direct and batch calls.
 * @param options The call options.
 * @returns The OpenAI model and the request parameters.
 * @throws {Error} When the campaign's model is not an OpenAI model.
 */
const buildSequenceRequest = (options: WriteSequenceOptions) => {
  const model = requireCopywritingModel({
    id: options.campaign.copywritingModel,
    provider: 'openai',
  });

  const skipped = options.knowledgeAssets.filter(
    (asset) => asset.anthropicFileId && !asset.openaiFileId,
  );

  if (skipped.length > 0) {
    logger.warn(
      `Campaign ${options.campaign.id} skips ${skipped.length} PDF(s) never uploaded to OpenAI`,
    );
  }

  const fileInputs = options.knowledgeAssets.flatMap<OpenAI.Responses.ResponseInputFile>((asset) =>
    asset.openaiFileId ? [{ type: 'input_file', file_id: asset.openaiFileId }] : [],
  );

  return {
    model,
    params: {
      model: model.id,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: toCopywritingEffort(options.campaign.copywritingEffort) },
      text: { format: zodTextFormat(emailSequenceSchema, 'email_sequence') },
      // The instructions and files are identical for every contact, so they lead
      // the prompt and share one cache key per campaign
      prompt_cache_key: options.campaign.id,
      instructions: `${SYSTEM_INSTRUCTIONS}\n\n${buildCampaignBrief(options)}`,
      input: [
        {
          role: 'user' as const,
          content: [
            ...fileInputs,
            { type: 'input_text' as const, text: buildContactPrompt(options) },
          ],
        },
      ],
    },
  };
};

/**
 * Writes the full email sequence for one contact.
 * @param options The call options.
 * @param options.campaign The campaign settings, including the OpenAI model to use.
 * @param options.contact The contact being written to.
 * @param options.enrichment The research output, when it parsed cleanly.
 * @param options.knowledgeAssets The assets selected for the campaign.
 * @returns The generated emails, or null when the model returned an unparsable
 *   response, plus the response id, token usage and cost the call is billed on.
 * @throws {Error} When the API key is missing or the model is not an OpenAI model.
 */
export const writeEmailSequence = async (
  options: WriteSequenceOptions,
): Promise<WrittenSequence> => {
  const request = buildSequenceRequest(options);
  const response = await getClient().responses.parse(request.params);

  if (!response.usage) {
    throw new Error(`OpenAI response ${response.id} reported no usage`);
  }

  logger.info(
    `Wrote sequence for contact ${options.contact.id} with ${request.model.id} (cache read: ${response.usage.input_tokens_details.cached_tokens} tokens)`,
  );

  return {
    provider: 'openai',
    model: request.model.id,
    externalId: response.id,
    usage: splitUsage(response.usage),
    costMicros: estimateCostMicros({ usage: response.usage, model: request.model, batch: false }),
    emails: normalizeSequence({
      emails: response.output_parsed?.emails,
      emailCount: options.campaign.emailCount,
    }),
  };
};

/**
 * Reads one line of a batch output or error file.
 * @param options The parsing options.
 * @param options.line One JSONL line.
 * @param options.model The model the batch ran on.
 * @param options.emailCount How many emails the campaign asked for.
 * @returns The contact's billed sequence, or why no response came back.
 */
export const parseBatchLine = (options: {
  line: string;
  model: GptModel;
  emailCount: number;
}): SequenceBatchResult => {
  const entry = batchLineSchema.parse(JSON.parse(options.line));
  const body = responseBodySchema.safeParse(entry.response?.body);

  if (entry.response?.status_code !== 200 || !body.success) {
    return {
      customId: entry.custom_id,
      error:
        errorBodySchema.safeParse(entry.response?.body).data?.error.message ??
        entry.error?.message ??
        `Batch request returned HTTP ${entry.response?.status_code ?? 'nothing'}`,
    };
  }

  const text = body.data.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('');

  return {
    customId: entry.custom_id,
    sequence: {
      provider: 'openai',
      model: options.model.id,
      externalId: body.data.id,
      usage: splitUsage(body.data.usage),
      costMicros: estimateCostMicros({ usage: body.data.usage, model: options.model, batch: true }),
      emails: normalizeSequence({
        emails: parseSequenceText(text),
        emailCount: options.emailCount,
      }),
    },
  };
};

/**
 * Downloads a batch result file and splits it into lines.
 * @param fileId The output or error file, when the batch produced one.
 * @returns The non-empty JSONL lines.
 */
const readBatchFile = async (fileId: string | null | undefined) => {
  if (!fileId) {
    return [];
  }

  const content = await getClient().files.content(fileId);
  const text = await content.text();

  return text.split('\n').filter((line) => line.trim());
};

/**
 * Submits one campaign's sequences as a single OpenAI batch.
 * @param requests One request per contact, keyed by contact id.
 * @returns The batch id to poll.
 * @throws {Error} When the API key is missing or a model is not an OpenAI model.
 */
export const submitSequenceBatch = async (requests: SequenceBatchRequest[]) => {
  const jsonl = requests
    .map((request) =>
      JSON.stringify({
        custom_id: request.customId,
        method: 'POST',
        url: '/v1/responses',
        body: buildSequenceRequest(request.options).params,
      }),
    )
    .join('\n');

  const inputFile = await getClient().files.create({
    file: new File([jsonl], 'sequences.jsonl', { type: 'application/jsonl' }),
    purpose: 'batch',
  });

  const batch = await getClient().batches.create({
    input_file_id: inputFile.id,
    endpoint: '/v1/responses',
    completion_window: '24h',
  });

  logger.info(`Submitted OpenAI batch ${batch.id} with ${requests.length} sequence(s)`);

  return batch.id;
};

/**
 * Checks an OpenAI batch and, once it has stopped, reads every result.
 * @param options The poll options.
 * @param options.batchId The batch to check.
 * @param options.campaign The campaign the batch writes for.
 * @returns Pending while OpenAI is still working, otherwise one result per answered request.
 * @throws {Error} When the API key is missing or the campaign's model is not an OpenAI model.
 */
export const fetchSequenceBatch = async (options: {
  batchId: string;
  campaign: Campaign;
}): Promise<SequenceBatchOutcome> => {
  const batch = await getClient().batches.retrieve(options.batchId);

  if (['validating', 'in_progress', 'finalizing', 'cancelling'].includes(batch.status)) {
    return { state: 'pending' };
  }

  const model = requireCopywritingModel({
    id: options.campaign.copywritingModel,
    provider: 'openai',
  });

  // A failed batch has neither file: every request is left without a result
  const lines = [
    ...(await readBatchFile(batch.output_file_id)),
    ...(await readBatchFile(batch.error_file_id)),
  ];

  return {
    state: 'ended',
    results: lines.map((line) =>
      parseBatchLine({ line, model, emailCount: options.campaign.emailCount }),
    ),
  };
};

/**
 * Uploads a knowledge document to the OpenAI Files API.
 * @param file The file to upload.
 * @returns The stored file identifier.
 * @throws {Error} When the API key is missing or the upload is rejected.
 */
export const uploadKnowledgeFile = async (file: File) => {
  const uploaded = await getClient().files.create({ file, purpose: 'user_data' });

  return uploaded.id;
};

/**
 * Removes a knowledge document from the OpenAI Files API.
 * @param fileId The file to delete.
 * @throws {Error} When the API key is missing.
 */
export const deleteKnowledgeFile = async (fileId: string) => {
  await getClient().files.delete(fileId);
};
