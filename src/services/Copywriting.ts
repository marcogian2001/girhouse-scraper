import { findCopywritingModel } from '@/utils/CopywritingModels';
import {
  fetchSequenceBatch as fetchClaudeBatch,
  submitSequenceBatch as submitClaudeBatch,
  writeEmailSequence as writeWithClaude,
} from './Claude';
import type { Campaign, SequenceBatchRequest, WriteSequenceOptions } from './EmailPrompt';
import {
  fetchSequenceBatch as fetchOpenAIBatch,
  submitSequenceBatch as submitOpenAIBatch,
  writeEmailSequence as writeWithOpenAI,
} from './OpenAI';

const PROVIDERS = {
  anthropic: { write: writeWithClaude, submit: submitClaudeBatch, fetch: fetchClaudeBatch },
  openai: { write: writeWithOpenAI, submit: submitOpenAIBatch, fetch: fetchOpenAIBatch },
};

/**
 * Picks the functions of the provider that serves a campaign's model.
 * @param campaign The campaign being written.
 * @returns The provider's write, batch submit and batch fetch functions.
 * @throws {Error} When the campaign names a model that is no longer offered.
 */
const providerFor = (campaign: Campaign) => {
  const model = findCopywritingModel(campaign.copywritingModel);

  if (!model) {
    throw new Error(`Unknown copywriting model: ${campaign.copywritingModel}`);
  }

  return PROVIDERS[model.provider];
};

/**
 * Writes one contact's sequence with the model the campaign was set up with.
 * @param options The call options.
 * @returns The provider-neutral result, billed tokens included.
 * @throws {Error} When the campaign names a model that is no longer offered.
 */
export const writeEmailSequence = async (options: WriteSequenceOptions) =>
  await providerFor(options.campaign).write(options);

/**
 * Submits several contacts of one campaign as a single discounted batch.
 * @param options The batch options.
 * @param options.campaign The campaign every request belongs to.
 * @param options.requests One request per contact, keyed by contact id.
 * @returns The provider's batch id.
 * @throws {Error} When the campaign names a model that is no longer offered.
 */
export const submitSequenceBatch = async (options: {
  campaign: Campaign;
  requests: SequenceBatchRequest[];
}) => await providerFor(options.campaign).submit(options.requests);

/**
 * Checks a submitted batch and reads its results once it has finished.
 * @param options The poll options.
 * @param options.campaign The campaign the batch writes for.
 * @param options.batchId The provider's batch id.
 * @returns Pending, or one result per answered request.
 * @throws {Error} When the campaign names a model that is no longer offered.
 */
export const fetchSequenceBatch = async (options: { campaign: Campaign; batchId: string }) =>
  await providerFor(options.campaign).fetch(options);
