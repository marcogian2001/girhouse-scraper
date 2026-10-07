import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import type { CopywritingEffort } from '@/utils/CopywritingModels';
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
 * Prices one copywriting call at list rates, halved for batch calls.
 * Dollars per million tokens times tokens is exactly millionths of a dollar.
 * @param options The pricing options.
 * @param options.usage The token counts Claude reported for the call.
 * @param options.model The model that served the call.
 * @param options.batch Whether the call went through the batch API.
 * @returns The cost in millionths of a US dollar.
 */
export const estimateCostMicros = (options: {
  usage: Anthropic.Usage;
  model: ClaudeModel;
  batch: boolean;
}) => {
  const { usage } = options;
  const price = options.model.pricing;
  const oneHourWrites = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // Without the breakdown every write is billed at the default five-minute rate
  const fiveMinuteWrites =
    usage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0;

  return Math.round(
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      fiveMinuteWrites * price.cacheWrite5m +
      oneHourWrites * price.cacheWrite1h +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead) *
      (options.batch ? BATCH_PRICE_FACTOR : 1),
  );
};

/**
 * Picks the reasoning settings a model accepts. Haiku 4.5 predates adaptive
 * thinking and effort; every newer model takes both, and Opus 5.5 would
 * otherwise default to medium effort.
 * @param model The model id.
 * @param effort The effort the campaign asked for.
 * @returns The `thinking` and `effort` request fields.
 */
const reasoningFor = (model: ClaudeModel['id'], effort: CopywritingEffort) =>
  model === 'claude-haiku-4-5'
    ? { thinking: { type: 'enabled', budget_tokens: 4000 } as const, effort: undefined }
    : { thinking: { type: 'adaptive' } as const, effort };

/**
 * Builds the request that writes one contact's sequence, shared by direct and batch calls.
 * @param options The call options.
 * @returns The Claude model and the request parameters.
 * @throws {Error} When the campaign's model is not a Claude model.
 */
const buildSequenceRequest = (options: WriteSequenceOptions) => {
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

  const reasoning = reasoningFor(model.id, toCopywritingEffort(options.campaign.copywritingEffort));

  return {
    model,
    params: {
      model: model.id,
      max_tokens: MAX_TOKENS,
      thinking: reasoning.thinking,
      output_config: {
        effort: reasoning.effort,
        format: zodOutputFormat(emailSequenceSchema),
      },
      // The brief is identical for every contact, so the whole block is served from cache
      system: [
        { type: 'text' as const, text: SYSTEM_INSTRUCTIONS },
        {
          type: 'text' as const,
          text: buildCampaignBrief(options),
          cache_control: { type: 'ephemeral' as const, ttl: '1h' as const },
        },
      ],
      messages: [
        {
          role: 'user' as const,
          content: [
            ...documentBlocks,
            { type: 'text' as const, text: buildContactPrompt(options) },
          ],
        },
      ],
    },
  };
};

/**
 * Turns a finished message into the provider-neutral record the job stores.
 * @param options The conversion options.
 * @param options.message The message Claude returned.
 * @param options.model The model that served the call.
 * @param options.emails The emails parsed from the reply, when they parsed.
 * @param options.emailCount How many emails the campaign asked for.
 * @param options.batch Whether the call went through the batch API.
 * @returns The written sequence with its usage and cost.
 */
const toWrittenSequence = (options: {
  message: Anthropic.Message;
  model: ClaudeModel;
  emails: WrittenSequence['emails'] | undefined;
  emailCount: number;
  batch: boolean;
}): WrittenSequence => ({
  provider: 'anthropic',
  model: options.model.id,
  externalId: options.message.id,
  usage: {
    inputTokens: options.message.usage.input_tokens,
    outputTokens: options.message.usage.output_tokens,
    cacheWriteTokens: options.message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: options.message.usage.cache_read_input_tokens ?? 0,
  },
  costMicros: estimateCostMicros({
    usage: options.message.usage,
    model: options.model,
    batch: options.batch,
  }),
  emails: normalizeSequence({ emails: options.emails, emailCount: options.emailCount }),
});

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
  const request = buildSequenceRequest(options);
  const response = await getClient().messages.parse(
    request.params,
    typeof options.campaign.budgetMicros === 'number' ? { maxRetries: 0 } : undefined,
  );

  logger.info(
    `Wrote sequence for contact ${options.contact.id} with ${request.model.id} (cache read: ${response.usage.cache_read_input_tokens ?? 0} tokens)`,
  );

  return toWrittenSequence({
    message: response,
    model: request.model,
    emails: response.parsed_output?.emails,
    emailCount: options.campaign.emailCount,
    batch: false,
  });
};

/**
 * Submits one campaign's sequences as a single Message Batch.
 * @param requests One request per contact, keyed by contact id.
 * @returns The batch id to poll.
 * @throws {Error} When the API key is missing or a model is not a Claude model.
 */
export const submitSequenceBatch = async (requests: SequenceBatchRequest[]) => {
  const batch = await getClient().messages.batches.create(
    {
      requests: requests.map((request) => ({
        custom_id: request.customId,
        params: buildSequenceRequest(request.options).params,
      })),
    },
    requests.some((request) => typeof request.options.campaign.budgetMicros === 'number')
      ? { maxRetries: 0 }
      : undefined,
  );

  logger.info(`Submitted Claude batch ${batch.id} with ${requests.length} sequence(s)`);

  return batch.id;
};

/**
 * Checks a Message Batch and, once it has ended, reads every result.
 * @param options The poll options.
 * @param options.batchId The batch to check.
 * @param options.campaign The campaign the batch writes for.
 * @returns Pending while Claude is still working, otherwise one result per request.
 * @throws {Error} When the API key is missing or the campaign's model is not a Claude model.
 */
export const fetchSequenceBatch = async (options: {
  batchId: string;
  campaign: Campaign;
}): Promise<SequenceBatchOutcome> => {
  const batch = await getClient().messages.batches.retrieve(options.batchId);

  if (batch.processing_status !== 'ended') {
    return { state: 'pending' };
  }

  const model = requireCopywritingModel({
    id: options.campaign.copywritingModel,
    provider: 'anthropic',
  });

  const results: SequenceBatchResult[] = [];

  for await (const entry of await getClient().messages.batches.results(options.batchId)) {
    if (entry.result.type !== 'succeeded') {
      results.push({
        customId: entry.custom_id,
        error:
          entry.result.type === 'errored'
            ? entry.result.error.error.message
            : `Batch request ${entry.result.type}`,
      });
      continue;
    }

    const { message } = entry.result;
    const text = message.content.find((block) => block.type === 'text')?.text;

    results.push({
      customId: entry.custom_id,
      sequence: toWrittenSequence({
        message,
        model,
        emails: parseSequenceText(text),
        emailCount: options.campaign.emailCount,
        batch: true,
      }),
    });
  }

  return { state: 'ended', results };
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
