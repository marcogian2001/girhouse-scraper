/**
 * List prices in US dollars per million tokens. OpenAI bills cache writes as
 * plain input, so its models carry no write rates.
 */
type ModelPricing = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
};

/** Every model a campaign can write its emails with, most capable first per provider. */
export const COPYWRITING_MODELS = [
  {
    id: 'claude-fable-5-1',
    provider: 'anthropic',
    label: 'Claude Fable 5.1',
    pricing: { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 0.25 },
  },
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    label: 'Claude Opus 5.5',
    pricing: { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    label: 'Claude Opus 5',
    pricing: { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5',
    pricing: { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    pricing: { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    label: 'GPT-6 Astra',
    pricing: { input: 10, output: 50, cacheRead: 1 },
  },
  {
    id: 'gpt-6-sol',
    provider: 'openai',
    label: 'GPT-6 Sol',
    pricing: { input: 2, output: 10, cacheRead: 0.2 },
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    label: 'GPT-6 Luna',
    pricing: { input: 0.1, output: 0.5, cacheRead: 0.01 },
  },
  {
    id: 'gpt-5.6-sol',
    provider: 'openai',
    label: 'GPT-5.6 Sol',
    pricing: { input: 4, output: 20, cacheRead: 0.4 },
  },
  {
    id: 'gpt-5.6-terra',
    provider: 'openai',
    label: 'GPT-5.6 Terra',
    pricing: { input: 2, output: 12, cacheRead: 0.2 },
  },
  {
    id: 'gpt-5.6-luna',
    provider: 'openai',
    label: 'GPT-5.6 Luna',
    pricing: { input: 0.2, output: 1.2, cacheRead: 0.02 },
  },
  {
    id: 'gpt-5.5',
    provider: 'openai',
    label: 'GPT-5.5',
    pricing: { input: 5, output: 30, cacheRead: 0.5 },
  },
  {
    id: 'gpt-5.4',
    provider: 'openai',
    label: 'GPT-5.4',
    pricing: { input: 2.5, output: 15, cacheRead: 0.25 },
  },
] as const satisfies readonly {
  id: string;
  provider: 'anthropic' | 'openai';
  label: string;
  pricing: ModelPricing;
}[];

export type CopywritingModelInfo = (typeof COPYWRITING_MODELS)[number];

export type CopywritingModel = CopywritingModelInfo['id'];

export type CopywritingProvider = CopywritingModelInfo['provider'];

export const COPYWRITING_MODEL_IDS = COPYWRITING_MODELS.map((model) => model.id);

export const DEFAULT_COPYWRITING_MODEL: CopywritingModel = 'claude-opus-5';

/** Tokens of one copywriting call, with cached input split out as the usage table stores it. */
export type CopywritingTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

/**
 * A typical call, used for estimates until an organization has written a
 * campaign: the brief is read from cache, the contact prompt is not, and the
 * output includes the model's reasoning.
 */
export const TYPICAL_COPYWRITING_CALL: CopywritingTokens = {
  inputTokens: 600,
  outputTokens: 2500,
  cacheWriteTokens: 100,
  cacheReadTokens: 1500,
};

/**
 * Prices a call at a model's list rates. Cache writes use Anthropic's one-hour
 * rate, the TTL the brief is cached with; OpenAI bills them as plain input.
 * Dollars per million tokens times tokens is exactly millionths of a dollar.
 * @param options The estimate options.
 * @param options.model The model to price.
 * @param options.tokens The tokens of the call.
 * @returns The cost in millionths of a US dollar.
 */
export const estimateCallCostMicros = (options: {
  model: CopywritingModelInfo;
  tokens: CopywritingTokens;
}) => {
  const price = options.model.pricing;
  const cacheWrite = 'cacheWrite1h' in price ? price.cacheWrite1h : price.input;

  return Math.round(
    options.tokens.inputTokens * price.input +
      options.tokens.outputTokens * price.output +
      options.tokens.cacheWriteTokens * cacheWrite +
      options.tokens.cacheReadTokens * price.cacheRead,
  );
};

/**
 * Looks up a model of one provider, so callers get its narrowed pricing.
 * @param options The lookup options.
 * @param options.id The model id.
 * @param options.provider The provider the model must belong to.
 * @returns The catalogue entry.
 * @throws {Error} When the id is not a model of that provider.
 */
export const requireCopywritingModel = <Provider extends CopywritingProvider>(options: {
  id: string;
  provider: Provider;
}) => {
  const model = COPYWRITING_MODELS.find(
    (entry): entry is Extract<CopywritingModelInfo, { provider: Provider }> =>
      entry.id === options.id && entry.provider === options.provider,
  );

  if (!model) {
    throw new Error(`Unknown ${options.provider} copywriting model: ${options.id}`);
  }

  return model;
};

/**
 * Finds the catalogue entry for a stored model id.
 * @param id The model id, as saved on the campaign.
 * @returns The entry, or undefined for an id no longer offered.
 */
export const findCopywritingModel = (id: string) =>
  COPYWRITING_MODELS.find((model) => model.id === id);
