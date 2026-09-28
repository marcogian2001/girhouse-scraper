import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { requireEnv } from '@/utils/Helpers';
import type { WriteSequenceOptions, WrittenSequence } from './EmailPrompt';
import {
  buildCampaignBrief,
  buildContactPrompt,
  emailSequenceSchema,
  normalizeSequence,
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

/**
 * Splits OpenAI's usage into the columns the usage table stores. OpenAI counts
 * cached and cache-written tokens inside `input_tokens`; reasoning tokens are
 * already part of `output_tokens`.
 * @param usage The token counts OpenAI reported for the call.
 * @returns Uncached input, output, cache writes and cache reads.
 */
export const splitUsage = (usage: OpenAI.Responses.ResponseUsage) => {
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
 * Prices one copywriting call at list rates. Cache writes bill as plain input.
 * Dollars per million tokens times tokens is exactly millionths of a dollar.
 * @param usage The token counts OpenAI reported for the call.
 * @param model The model that served the call.
 * @returns The cost in millionths of a US dollar.
 */
export const estimateCostMicros = (usage: OpenAI.Responses.ResponseUsage, model: GptModel) => {
  const tokens = splitUsage(usage);

  return Math.round(
    (tokens.inputTokens + tokens.cacheWriteTokens) * model.pricing.input +
      tokens.cacheReadTokens * model.pricing.cacheRead +
      tokens.outputTokens * model.pricing.output,
  );
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

  const response = await getClient().responses.parse({
    model: model.id,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: 'high' },
    text: { format: zodTextFormat(emailSequenceSchema, 'email_sequence') },
    // The instructions and files are identical for every contact, so they lead
    // the prompt and share one cache key per campaign
    prompt_cache_key: options.campaign.id,
    instructions: `${SYSTEM_INSTRUCTIONS}\n\n${buildCampaignBrief(options)}`,
    input: [
      {
        role: 'user',
        content: [...fileInputs, { type: 'input_text', text: buildContactPrompt(options) }],
      },
    ],
  });

  if (!response.usage) {
    throw new Error(`OpenAI response ${response.id} reported no usage`);
  }

  logger.info(
    `Wrote sequence for contact ${options.contact.id} with ${model.id} (cache read: ${response.usage.input_tokens_details.cached_tokens} tokens)`,
  );

  return {
    provider: 'openai',
    model: model.id,
    externalId: response.id,
    usage: splitUsage(response.usage),
    costMicros: estimateCostMicros(response.usage, model),
    emails: normalizeSequence({
      emails: response.output_parsed?.emails,
      emailCount: options.campaign.emailCount,
    }),
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
