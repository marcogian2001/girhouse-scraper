import * as z from 'zod';
import type { campaignSchema, contactSchema, knowledgeAssetSchema } from '@/models/Schema';
import type {
  CopywritingModel,
  CopywritingProvider,
  CopywritingTokens,
} from '@/utils/CopywritingModels';
import { extractMentionNames } from '@/utils/KnowledgeMentions';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';

export const emailSequenceSchema = z.object({
  emails: z.array(
    z.object({
      step: z.number(),
      subject: z.string(),
      body: z.string(),
    }),
  ),
});

export type KnowledgeAsset = typeof knowledgeAssetSchema.$inferSelect;

export type Campaign = typeof campaignSchema.$inferSelect;

export type Contact = typeof contactSchema.$inferSelect;

/** What every provider needs to write one contact's sequence. */
export type WriteSequenceOptions = {
  campaign: Campaign;
  contact: Contact;
  enrichment: EnrichmentContent | null;
  knowledgeAssets: KnowledgeAsset[];
};

/** One copywriting call, in the same shape whichever provider served it. */
export type WrittenSequence = {
  provider: CopywritingProvider;
  model: CopywritingModel;
  // Provider call id, so a retried job is only billed once
  externalId: string;
  usage: CopywritingTokens;
  costMicros: number;
  // Null when the response did not parse; left to the caller to reject, so the billed tokens are recorded first
  emails: z.infer<typeof emailSequenceSchema>['emails'] | null;
};

export const SYSTEM_INSTRUCTIONS = [
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
 * Composes the campaign half of the system prompt: the brief, the text
 * knowledge assets and the documents mentioned as `@[name]`. Identical for
 * every contact in a campaign, so providers
 * serve it from cache after the first call.
 * @param options The call options.
 * @param options.campaign The campaign being written.
 * @param options.knowledgeAssets The assets selected for the campaign.
 * @returns The brief text.
 */
export const buildCampaignBrief = (options: {
  campaign: Campaign;
  knowledgeAssets: KnowledgeAsset[];
}) => {
  const textAssets = options.knowledgeAssets
    .filter((asset) => asset.content)
    .map((asset) => `### ${asset.name}\n${asset.content}`)
    .join('\n\n');

  const mentionedNames = extractMentionNames(
    [
      options.campaign.extraPrompt ?? '',
      ...options.knowledgeAssets.map((asset) => (asset.kind === 'prompt' ? asset.content : '')),
    ].join('\n'),
  );

  const requiredDocuments = options.knowledgeAssets
    .filter((asset) => asset.kind === 'document' && mentionedNames.includes(asset.name))
    .map((asset) => `- ${asset.name}`)
    .join('\n');

  return [
    options.campaign.extraPrompt ? `## Campaign brief\n${options.campaign.extraPrompt}` : '',
    textAssets ? `## Reference material\n${textAssets}` : '',
    requiredDocuments
      ? `## Required documents\nThe brief mentions these documents as @[name]. Read each one in full before writing and ground the emails in it.\n${requiredDocuments}`
      : '',
    `## Sequence\nWrite exactly ${options.campaign.emailCount} email(s), numbered from 1.`,
  ]
    .filter(Boolean)
    .join('\n\n');
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
 * Keeps the requested number of emails and renumbers them from 1.
 * @param options The call options.
 * @param options.emails The emails the model returned, when they parsed.
 * @param options.emailCount How many emails the campaign asked for.
 * @returns The trimmed sequence, or null when nothing parsed.
 */
export const normalizeSequence = (options: {
  emails: WrittenSequence['emails'] | undefined;
  emailCount: number;
}) =>
  options.emails
    ?.slice(0, options.emailCount)
    .map((email, index) => ({ ...email, step: index + 1 })) ?? null;
