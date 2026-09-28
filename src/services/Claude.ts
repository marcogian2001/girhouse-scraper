import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
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

const MAX_TOKENS = 16_000;

let client: Anthropic | undefined;

/**
 * Returns the shared Anthropic client, created on first use.
 * @returns The configured Anthropic client.
 * @throws {Error} When `ANTHROPIC_API_KEY` is not configured.
 */
const getClient = () => {
  client ??= new Anthropic({
    apiKey: requireEnv('ANTHROPIC_API_KEY', Env.ANTHROPIC_API_KEY),
  });

  return client;
};

type ClaudeModel = ReturnType<typeof requireCopywritingModel<'anthropic'>>;

/**
 * Prices one copywriting call at list rates.
 * Dollars per million tokens times tokens is exactly millionths of a dollar.
 * @param usage The token counts Claude reported for the call.
 * @param model The model that served the call.
 * @returns The cost in millionths of a US dollar.
 */
export const estimateCostMicros = (usage: Anthropic.Usage, model: ClaudeModel) => {
  const price = model.pricing;
  const oneHourWrites = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // Without the breakdown every write is billed at the default five-minute rate
  const fiveMinuteWrites =
    usage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0;

  return Math.round(
    usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      fiveMinuteWrites * price.cacheWrite5m +
      oneHourWrites * price.cacheWrite1h +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead,
  );
};

/**
 * Picks the reasoning settings a model accepts. Haiku 4.5 predates adaptive
 * thinking and effort; every newer model takes both, and Opus 5.5 would
 * otherwise default to medium effort.
 * @param model The model id.
 * @returns The `thinking` and `effort` request fields.
 */
const reasoningFor = (model: ClaudeModel['id']) =>
  model === 'claude-haiku-4-5'
    ? { thinking: { type: 'enabled', budget_tokens: 4000 } as const, effort: undefined }
    : { thinking: { type: 'adaptive' } as const, effort: 'high' as const };

/**
 * Writes the full email sequence for one contact.
 * @param options The call options.
 * @param options.campaign The campaign settings, including the Claude model to use.
 * @param options.contact The contact being written to.
 * @param options.enrichment The research output, when it parsed cleanly.
 * @param options.knowledgeAssets The assets selected for the campaign.
 * @returns The generated emails, or null when Claude returned an unparsable
 *   response, plus the message id, token usage and cost the call is billed on.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const writeEmailSequence = async (
  options: WriteSequenceOptions,
): Promise<WrittenSequence> => {
  const model = requireCopywritingModel({
    id: options.campaign.copywritingModel,
    provider: 'anthropic',
  });

  const documentBlocks = options.knowledgeAssets.flatMap<Anthropic.DocumentBlockParam>((asset) =>
    asset.anthropicFileId
      ? [
          {
            type: 'document',
            // Citations stay off: they are incompatible with `output_config.format`
            source: { type: 'file', file_id: asset.anthropicFileId },
            title: asset.name,
          },
        ]
      : [],
  );

  const lastDocument = documentBlocks.at(-1);

  if (lastDocument) {
    lastDocument.cache_control = { type: 'ephemeral', ttl: '1h' };
  }

  const reasoning = reasoningFor(model.id);

  const response = await getClient().messages.parse({
    model: model.id,
    max_tokens: MAX_TOKENS,
    thinking: reasoning.thinking,
    output_config: {
      effort: reasoning.effort,
      format: zodOutputFormat(emailSequenceSchema),
    },
    // The brief is identical for every contact, so the whole block is served from cache
    system: [
      { type: 'text', text: SYSTEM_INSTRUCTIONS },
      {
        type: 'text',
        text: buildCampaignBrief(options),
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [...documentBlocks, { type: 'text', text: buildContactPrompt(options) }],
      },
    ],
  });

  logger.info(
    `Wrote sequence for contact ${options.contact.id} with ${model.id} (cache read: ${response.usage.cache_read_input_tokens ?? 0} tokens)`,
  );

  return {
    provider: 'anthropic',
    model: model.id,
    externalId: response.id,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    costMicros: estimateCostMicros(response.usage, model),
    emails: normalizeSequence({
      emails: response.parsed_output?.emails,
      emailCount: options.campaign.emailCount,
    }),
  };
};

/**
 * Uploads a knowledge document to the Anthropic Files API.
 * @param file The file to upload.
 * @returns The stored file identifier.
 * @throws {Error} When the API key is missing or the upload is rejected.
 */
export const uploadKnowledgeFile = async (file: File) => {
  const uploaded = await getClient().files.upload({ file });

  return uploaded.id;
};

/**
 * Removes a knowledge document from the Anthropic Files API.
 * @param fileId The file to delete.
 * @throws {Error} When the API key is missing.
 */
export const deleteKnowledgeFile = async (fileId: string) => {
  await getClient().files.delete(fileId);
};
