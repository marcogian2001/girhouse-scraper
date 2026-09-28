import { findCopywritingModel } from '@/utils/CopywritingModels';
import { writeEmailSequence as writeWithClaude } from './Claude';
import type { WriteSequenceOptions } from './EmailPrompt';
import { writeEmailSequence as writeWithOpenAI } from './OpenAI';

/**
 * Writes one contact's sequence with the model the campaign was set up with.
 * @param options The call options.
 * @returns The provider-neutral result, billed tokens included.
 * @throws {Error} When the campaign names a model that is no longer offered.
 */
export const writeEmailSequence = async (options: WriteSequenceOptions) => {
  const model = findCopywritingModel(options.campaign.copywritingModel);

  if (!model) {
    throw new Error(`Unknown copywriting model: ${options.campaign.copywritingModel}`);
  }

  return model.provider === 'openai'
    ? await writeWithOpenAI(options)
    : await writeWithClaude(options);
};
