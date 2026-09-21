import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import type { campaignSchema, contactSchema, knowledgeAssetSchema } from '@/models/Schema';
import { requireEnv } from '@/utils/Helpers';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';

export const COPYWRITING_MODEL = 'claude-opus-5';

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

const emailSequenceSchema = z.object({
  emails: z.array(
    z.object({
      step: z.number(),
      subject: z.string(),
      body: z.string(),
    }),
  ),
});

type KnowledgeAsset = typeof knowledgeAssetSchema.$inferSelect;

type Campaign = typeof campaignSchema.$inferSelect;

type Contact = typeof contactSchema.$inferSelect;

const SYSTEM_INSTRUCTIONS = [
  'You write cold outreach emails that a busy professional would actually reply to.',
  '',
  'Hard rules:',
  '- Never state a fact about the recipient that is not in the research below. No invented mutual connections, no invented metrics, no flattery you cannot back up.',
  '- When the research confidence is low, write from the company or the industry instead of the person, and keep the email shorter.',
  '- Plain text only. No markdown, no HTML, no bullet lists, no links unless one was supplied.',
  '- Subject lines under 60 characters, lowercase or sentence case, never clickbait and never all caps.',
  '- Each email under 120 words. One clear ask at the end, low friction.',
  '- Write the way a person types: contractions, short sentences, no corporate filler.',
  '',
  'Sequence rules:',
  '- Email 1 earns attention with the most specific true detail available.',
  '- Every follow-up adds a new angle. Never send "just bumping this to the top of your inbox" with nothing else.',
  '- The last email is a short, graceful close that makes it easy to say no.',
  '- Follow-ups are replies in the same thread: do not reintroduce yourself from scratch.',
].join('\n');

/**
 * Composes the cacheable system prompt: fixed instructions, then the campaign
 * brief and the text knowledge assets. Identical for every contact in a
 * campaign, so the whole block is served from cache after the first call.
 * @param options The call options.
 * @param options.campaign The campaign being written.
 * @param options.knowledgeAssets The assets selected for the campaign.
 * @returns System blocks with a cache breakpoint on the last one.
 */
const buildSystemBlocks = (options: {
  campaign: Campaign;
  knowledgeAssets: KnowledgeAsset[];
}): Anthropic.TextBlockParam[] => {
  const textAssets = options.knowledgeAssets
    .filter((asset) => asset.content)
    .map((asset) => `### ${asset.name}\n${asset.content}`)
    .join('\n\n');

  const brief = [
    options.campaign.extraPrompt ? `## Campaign brief\n${options.campaign.extraPrompt}` : '',
    textAssets ? `## Reference material\n${textAssets}` : '',
    `## Sequence\nWrite exactly ${options.campaign.emailCount} email(s), numbered from 1.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    { type: 'text', text: SYSTEM_INSTRUCTIONS },
    { type: 'text', text: brief, cache_control: { type: 'ephemeral', ttl: '1h' } },
  ];
};

/**
 * Renders the per-contact half of the prompt: what the CSV said and what the
 * research turned up, including how much to trust it.
 * @param options The call options.
 * @param options.contact The contact being written to.
 * @param options.enrichment The research output, when it parsed cleanly.
 * @returns The prompt text for this contact.
 */
export const buildContactPrompt = (options: {
  contact: Contact;
  enrichment: EnrichmentContent | null;
}) => {
  const fromCsv = [
    ['Email', options.contact.email],
    ['First name', options.contact.firstName],
    ['Last name', options.contact.lastName],
    ['Company', options.contact.company],
    ['Website', options.contact.website],
    ['LinkedIn', options.contact.linkedinUrl],
    ...Object.entries(options.contact.extra),
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `- ${label}: ${value}`)
    .join('\n');

  if (!options.enrichment) {
    return [
      '## Contact (from the uploaded list)',
      fromCsv,
      '',
      '## Research',
      'No research is available for this contact. Write from the company and the industry only, and keep it short.',
    ].join('\n');
  }

  const research = [
    ['Confidence this is the right person', options.enrichment.identity_match_confidence],
    ['Why', options.enrichment.identity_match_reasoning],
    ['Name', options.enrichment.full_name],
    ['Role', options.enrichment.current_role],
    ['Company', options.enrichment.current_company],
    ['What the company does', options.enrichment.company_description],
    ['Industry', options.enrichment.company_industry],
    ['Location', options.enrichment.location],
    ['Recent activity', options.enrichment.recent_activity],
    ['Hooks worth referencing', options.enrichment.personalization_hooks],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `- ${label}: ${value}`)
    .join('\n');

  return [
    '## Contact (from the uploaded list)',
    fromCsv,
    '',
    '## Research',
    research,
    '',
    options.enrichment.identity_match_confidence === 'low'
      ? 'The research may describe a different person with the same name. Do not reference anything personal from it.'
      : 'Use at most two of these details, and only the ones a stranger could verify.',
  ].join('\n');
};

/**
 * Writes the full email sequence for one contact.
 * @param options The call options.
 * @param options.campaign The campaign settings.
 * @param options.contact The contact being written to.
 * @param options.enrichment The research output, when it parsed cleanly.
 * @param options.knowledgeAssets The assets selected for the campaign.
 * @returns The generated emails, one per step.
 * @throws {Error} When the API key is missing or Claude returns an unparsable response.
 */
export const writeEmailSequence = async (options: {
  campaign: Campaign;
  contact: Contact;
  enrichment: EnrichmentContent | null;
  knowledgeAssets: KnowledgeAsset[];
}) => {
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

  const response = await getClient().messages.parse({
    model: COPYWRITING_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: zodOutputFormat(emailSequenceSchema),
    },
    system: buildSystemBlocks(options),
    messages: [
      {
        role: 'user',
        content: [...documentBlocks, { type: 'text', text: buildContactPrompt(options) }],
      },
    ],
  });

  logger.info(
    `Wrote sequence for contact ${options.contact.id} (cache read: ${response.usage.cache_read_input_tokens ?? 0} tokens)`,
  );

  if (!response.parsed_output) {
    throw new Error(`Claude returned no parsable sequence for contact ${options.contact.id}`);
  }

  return response.parsed_output.emails
    .slice(0, options.campaign.emailCount)
    .map((email, index) => ({ ...email, step: index + 1 }));
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
