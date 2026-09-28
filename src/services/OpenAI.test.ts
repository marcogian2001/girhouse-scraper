import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { estimateCostMicros, splitUsage } from './OpenAI';

const usage = (overrides: {
  input?: number;
  cached?: number;
  cacheWrite?: number;
  output?: number;
  reasoning?: number;
}): OpenAI.Responses.ResponseUsage => ({
  input_tokens: overrides.input ?? 0,
  input_tokens_details: {
    cached_tokens: overrides.cached ?? 0,
    cache_write_tokens: overrides.cacheWrite ?? 0,
  },
  output_tokens: overrides.output ?? 0,
  output_tokens_details: { reasoning_tokens: overrides.reasoning ?? 0 },
  total_tokens: (overrides.input ?? 0) + (overrides.output ?? 0),
});

const sol = requireCopywritingModel({ id: 'gpt-6-sol', provider: 'openai' });

describe('OpenAI copywriting', () => {
  describe('Usage', () => {
    it('separates cached and cache-written tokens from uncached input', () => {
      expect(
        splitUsage(usage({ input: 1000, cached: 600, cacheWrite: 100, output: 50 })),
      ).toStrictEqual({
        inputTokens: 300,
        outputTokens: 50,
        cacheWriteTokens: 100,
        cacheReadTokens: 600,
      });
    });
  });

  describe('Cost estimate', () => {
    it('prices input and output tokens at GPT-6 Sol list rates', () => {
      // $2 and $10 per million tokens
      expect(estimateCostMicros(usage({ input: 1000, output: 1000 }), sol)).toBe(12_000);
    });

    it('prices cached input at the cache read rate', () => {
      // 400 uncached at $2, 600 cached at $0.20 per million tokens
      expect(estimateCostMicros(usage({ input: 1000, cached: 600 }), sol)).toBe(920);
    });

    it('bills cache writes as plain input', () => {
      expect(estimateCostMicros(usage({ input: 1000, cacheWrite: 1000 }), sol)).toBe(2000);
    });

    it('bills reasoning tokens as output', () => {
      expect(estimateCostMicros(usage({ output: 1000, reasoning: 800 }), sol)).toBe(10_000);
    });
  });
});
