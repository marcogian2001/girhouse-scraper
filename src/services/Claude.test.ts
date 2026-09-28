import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { estimateCostMicros } from './Claude';

const usage = (overrides: Partial<Anthropic.Usage> = {}): Anthropic.Usage => ({
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  input_tokens: 0,
  output_tokens: 0,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: null,
  ...overrides,
});

const opus5 = requireCopywritingModel({ id: 'claude-opus-5', provider: 'anthropic' });

describe('Claude', () => {
  describe('Cost estimate', () => {
    it('prices input and output tokens at Opus 5 list rates', () => {
      // $5 and $25 per million tokens
      expect(estimateCostMicros(usage({ input_tokens: 1000, output_tokens: 1000 }), opus5)).toBe(
        30_000,
      );
    });

    it('prices one-hour cache writes above five-minute ones', () => {
      const cost = estimateCostMicros(
        usage({
          cache_creation_input_tokens: 2000,
          cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 1000 },
        }),
        opus5,
      );

      // $6.25 and $10 per million tokens
      expect(cost).toBe(16_250);
    });

    it('prices cache reads at a tenth of input', () => {
      expect(estimateCostMicros(usage({ cache_read_input_tokens: 1000 }), opus5)).toBe(500);
    });

    it('bills writes without a breakdown at the five-minute rate', () => {
      expect(estimateCostMicros(usage({ cache_creation_input_tokens: 1000 }), opus5)).toBe(6250);
    });

    it('prices cache reads at a twentieth of input on Opus 5.5', () => {
      const opus55 = requireCopywritingModel({ id: 'claude-opus-5-5', provider: 'anthropic' });

      // $0.20 per million tokens
      expect(estimateCostMicros(usage({ cache_read_input_tokens: 1000 }), opus55)).toBe(200);
    });

    it('prices input and output tokens at Haiku 4.5 list rates', () => {
      const haiku = requireCopywritingModel({ id: 'claude-haiku-4-5', provider: 'anthropic' });

      // $1 and $5 per million tokens
      expect(estimateCostMicros(usage({ input_tokens: 1000, output_tokens: 1000 }), haiku)).toBe(
        6000,
      );
    });
  });
});
