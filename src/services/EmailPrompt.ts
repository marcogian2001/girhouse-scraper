import * as z from 'zod';
import type { campaignSchema, contactSchema, knowledgeAssetSchema } from '@/models/Schema';
import type {
  CopywritingModel,
  CopywritingProvider,
  CopywritingTokens,
} from '@/utils/CopywritingModels';
import { extractMentionNames } from '@/utils/KnowledgeMentions';
import type { EnrichmentContent, WebsiteCheck } from '@/validations/EnrichmentValidation';

const sequenceAngleSchema = z.object({
  pain: z
    .string()
    .describe('The main problem of the business this sequence addresses, in a few words.'),
  reason: z.string().describe('Why this problem, citing the research detail that shows it.'),
});

export const emailSequenceSchema = z.object({
  angle: sequenceAngleSchema,
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
  websiteCheck: WebsiteCheck | null;
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
  // The pain the sequence was written around, null when the response did not carry one
  angle: z.infer<typeof sequenceAngleSchema> | null;
};

/** One contact's request in a batch, keyed so its result can be matched back. */
export type SequenceBatchRequest = {
  customId: string;
  options: WriteSequenceOptions;
};

/** One contact's outcome in a finished batch: a billed sequence, or why no call was made. */
export type SequenceBatchResult =
  | { customId: string; sequence: WrittenSequence }
  | { customId: string; error: string };

/** Where a submitted batch stands. */
export type SequenceBatchOutcome =
  | { state: 'pending' }
  | { state: 'ended'; results: SequenceBatchResult[] };

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

const yesNo = (found: boolean) => (found ? 'yes' : 'no');

/**
 * Renders what reading the business's website showed, so the email only calls
 * missing a contact channel the site really lacks.
 * @param check The website check, null when the business has no website of its own.
 * @returns The prompt section, or an empty string without a check.
 */
const renderWebsiteCheck = (check: WebsiteCheck | null) => {
  if (!check) {
    return '';
  }

  if (!check.read) {
    return [
      '## Website check',
      'The website could not be read reliably. Never say a contact form, WhatsApp or online booking is missing from it.',
    ].join('\n');
  }

  return [
    '## Website check (read directly from the site, more reliable than the research)',
    `- Pages read: ${check.pages.join(', ')}`,
    `- Contact form: ${yesNo(check.contactForm)}`,
    `- WhatsApp link: ${yesNo(check.whatsapp)}`,
    `- Online booking: ${yesNo(check.booking)}`,
    `- Clickable phone link: ${yesNo(check.phone)}`,
    'Only call a contact channel missing when it reads "no" here.',
  ].join('\n');
};

/**
 * Renders the per-contact half of the prompt: what the CSV said, what the
 * research turned up, including how much to trust it, and what the website check found.
 * @param options The call options.
 * @param options.contact The contact being written to.
 * @param options.enrichment The research output, when it parsed cleanly.
 * @param options.websiteCheck What reading the business's website showed, when it was read.
 * @returns The prompt text for this contact.
 */
export const buildContactPrompt = (options: {
  contact: Contact;
  enrichment: EnrichmentContent | null;
  websiteCheck?: WebsiteCheck | null;
}) => {
  const websiteCheck = renderWebsiteCheck(options.websiteCheck ?? null);
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
      ...(websiteCheck ? ['', websiteCheck] : []),
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
    ['Positioning', options.enrichment.business_positioning],
    ['Website', options.enrichment.website_assessment],
    ['What customers say', options.enrichment.customer_signals],
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
    ...(websiteCheck ? ['', websiteCheck] : []),
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

/**
 * Parses JSON that may be malformed, e.g. a reply cut off by `max_tokens`.
 * @param text The text to parse.
 * @returns The parsed value, or null when the text is not valid JSON.
 */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// Batches submitted before the angle was asked for come back without it
const batchSequenceSchema = emailSequenceSchema.extend({ angle: sequenceAngleSchema.nullish() });

/**
 * Reads the sequence out of a structured-output reply that the SDK did not parse,
 * as batch results come back as raw text.
 * @param text The model's JSON reply.
 * @returns The emails and angle, or undefined when the reply is missing or malformed.
 */
export const parseSequenceText = (text: string | undefined) =>
  batchSequenceSchema.safeParse(text ? parseJson(text) : null).data;
