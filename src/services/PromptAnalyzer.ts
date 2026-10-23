import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import { logger } from '@/libs/Logger';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { getClient, reasoningFor } from './Claude';
import { toBilledCall } from './ReplyPrompt';

const MAX_TOKENS = 6000;

const analysisOutputSchema = z.object({
  sintesi: z.string(),
  punti: z.array(z.string()),
});

const ANALYSIS_RULES = [
  'You read the instructions a cold email campaign was written from, plus a few emails it produced, and describe the structure of its emails so campaigns can be compared as A/B tests. Write in Italian.',
  '',
  '- `sintesi`: one line, at most 15 words, naming the angle of the campaign.',
  '- `punti`: 4 to 7 short points, at most 15 words each, in the order they appear in the email: opening hook, personalisation, problem, offer and price, proof, call to action, length and tone, how the follow-ups change.',
  '- Describe what the emails do, not what a single email says: no names of businesses or people.',
  '- When the instructions and the emails disagree, describe the emails.',
].join('\n');

/** One email a campaign wrote, as the analysis reads it. */
type SampleEmail = { step: number; subject: string; body: string };

/** What the analysis reads about a campaign. */
export type AnalyzePromptOptions = {
  model: string;
  // The prompts the campaign was written from, the brief included
  prompts: string[];
  // Documents the writer read, by name only
  documentNames: string[];
  // Each entry is one lead's sequence
  samples: SampleEmail[][];
};

/**
 * Renders what the analysis reads.
 * @param options The campaign's prompts and sample emails.
 * @returns The prompt text.
 */
const buildAnalysisPrompt = (options: AnalyzePromptOptions) =>
  [
    `## Instructions\n${options.prompts.join('\n\n---\n\n') || '(none)'}`,
    options.documentNames.length > 0
      ? `## Documents the writer read\n${options.documentNames.join(', ')}`
      : '',
    ...options.samples.map(
      (sequence, index) =>
        `## Sequence ${index + 1}\n${sequence
          .map((email) => `### Email ${email.step}: ${email.subject}\n${email.body.trim()}`)
          .join('\n\n')}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

/**
 * Sums up the structure of a campaign's emails with Claude.
 * @param options The campaign's prompts and sample emails.
 * @returns The summary and its points, or null when the answer did not parse, plus the billed call.
 * @throws {Error} When the API key is missing or the model is not a Claude model.
 */
export const analyzePrompt = async (options: AnalyzePromptOptions) => {
  const model = requireCopywritingModel({ id: options.model, provider: 'anthropic' });
  const reasoning = reasoningFor(model.id, 'low');

  const response = await getClient().messages.parse({
    model: model.id,
    max_tokens: MAX_TOKENS,
    thinking: reasoning.thinking,
    output_config: { effort: reasoning.effort, format: zodOutputFormat(analysisOutputSchema) },
    system: ANALYSIS_RULES,
    messages: [{ role: 'user', content: buildAnalysisPrompt(options) }],
  });

  logger.info(`Analyzed a campaign prompt with ${model.id}`);

  return { output: response.parsed_output ?? null, call: toBilledCall(response, model) };
};
