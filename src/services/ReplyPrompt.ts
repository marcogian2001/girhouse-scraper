import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeModel } from './Claude';
import { estimateCostMicros } from './Claude';
import type { WrittenSequence } from './EmailPrompt';

/** One AI call, billed like a copywriting call. */
export type BilledCall = Omit<WrittenSequence, 'emails'>;

/** One email of the thread, as the AI reads it. */
export type ThreadMessage = {
  direction: 'outbound' | 'inbound';
  sentAt: Date | null;
  text: string;
};

/** What the platform knows about the business that replied. */
export type LeadContext = {
  company: string | null;
  contactName: string | null;
  city: string | null;
  category: string | null;
  description: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number | null;
};

/**
 * Lists what is known about the business, one fact per line.
 * @param lead The lead context.
 * @returns The known facts, empty when nothing is known.
 */
export const renderLeadFacts = (lead: LeadContext) =>
  [
    ['Business', lead.company],
    ['Contact', lead.contactName],
    ['City', lead.city],
    ['Category', lead.category],
    ['Website', lead.website],
    ['Description', lead.description],
    [
      'Google rating',
      lead.rating === null ? null : `${lead.rating} (${lead.reviewsCount ?? 0} reviews)`,
    ],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');

/**
 * Renders the earlier emails of a thread, oldest first.
 * @param thread The thread.
 * @returns Each email under a heading naming its sender and date.
 */
export const renderThread = (thread: ThreadMessage[]) =>
  thread
    .map(
      (message) =>
        `### ${message.direction === 'outbound' ? 'Girhouse' : 'Lead'}${message.sentAt ? ` (${message.sentAt.toISOString().slice(0, 10)})` : ''}\n${message.text.trim()}`,
    )
    .join('\n\n');

/**
 * Turns a finished Claude message into the record its cost is billed on.
 * @param message The message Claude returned.
 * @param model The model that served it.
 * @returns The billed call.
 */
export const toBilledCall = (message: Anthropic.Message, model: ClaudeModel): BilledCall => ({
  provider: 'anthropic',
  model: model.id,
  externalId: message.id,
  usage: {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  },
  costMicros: estimateCostMicros({ usage: message.usage, model, batch: false }),
});
