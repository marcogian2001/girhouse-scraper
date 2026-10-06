import { describe, expect, it } from 'vitest';
import {
  estimateCallCostMicros,
  findCopywritingModel,
  toCopywritingEffort,
} from './CopywritingModels';

const tokens = {
  inputTokens: 1000,
  outputTokens: 1000,
  cacheWriteTokens: 1000,
  cacheReadTokens: 1000,
};

describe('Copywriting models', () => {
  describe('Call cost estimate', () => {
    it('prices cache writes at the one-hour rate for Claude models', () => {
      const model = findCopywritingModel('claude-opus-5');

      // $5 input, $25 output, $10 one-hour write, $0.50 read per million tokens
      expect(model && estimateCallCostMicros({ model, tokens })).toBe(40_500);
    });

    it('prices cache writes as plain input for OpenAI models', () => {
      const model = findCopywritingModel('gpt-6-sol');

      // $2 input twice, $10 output, $0.20 read per million tokens
      expect(model && estimateCallCostMicros({ model, tokens })).toBe(14_200);
    });

    it('halves the estimate for batch calls', () => {
      const model = findCopywritingModel('claude-opus-5');

      expect(model && estimateCallCostMicros({ model, tokens, batch: true })).toBe(20_250);
    });
  });

  describe('Effort', () => {
    it('keeps an offered level', () => {
      expect(toCopywritingEffort('medium')).toBe('medium');
    });

    it('falls back to high for a level no longer offered', () => {
      expect(toCopywritingEffort('max')).toBe('high');
    });
  });
});
