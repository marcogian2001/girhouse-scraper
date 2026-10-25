import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { requireCopywritingModel } from '@/utils/CopywritingModels';
import { estimateCostMicros, parseBatchLine, splitUsage } from './OpenAI';

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

/**
 * Prices a GPT-6 Sol call, direct unless told otherwise.
 * @param tokens The usage OpenAI reported.
 * @param batch Whether it went through the batch API.
 * @returns The cost in millionths of a US dollar.
 */
const cost = (tokens: OpenAI.Responses.ResponseUsage, batch = false) =>
  estimateCostMicros({ usage: tokens, model: sol, batch });

/**
 * Builds a raw Responses body that replied with the given text.
 * @param text The model's reply.
 * @returns The body as a batch output line carries it.
 */
const body = (text: string) => ({
  id: 'resp_1',
  usage: {
    input_tokens: 1000,
    output_tokens: 1000,
    input_tokens_details: { cached_tokens: 600 },
  },
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text }] },
  ],
});

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
      expect(cost(usage({ input: 1000, output: 1000 }))).toBe(12_000);
    });

    it('prices cached input at the cache read rate', () => {
      // 400 uncached at $2, 600 cached at $0.20 per million tokens
      expect(cost(usage({ input: 1000, cached: 600 }))).toBe(920);
    });

    it('bills cache writes as plain input', () => {
      expect(cost(usage({ input: 1000, cacheWrite: 1000 }))).toBe(2000);
    });

    it('bills reasoning tokens as output', () => {
      expect(cost(usage({ output: 1000, reasoning: 800 }))).toBe(10_000);
    });

    it('halves every rate for batch calls', () => {
      expect(cost(usage({ input: 1000, cached: 600, output: 1000 }), true)).toBe(
        (920 + 10_000) / 2,
      );
    });
  });

  describe('Batch line', () => {
    const line = (entry: Record<string, unknown>) =>
      parseBatchLine({ line: JSON.stringify(entry), model: sol, emailCount: 2 });

    it('reads the sequence and the batch price from a successful response', () => {
      const result = line({
        custom_id: 'contact-1',
        response: {
          status_code: 200,
          body: body(
            JSON.stringify({
              angle: { pain: 'Missed enquiries', reason: 'Only a phone number.' },
              emails: [
                { step: 4, subject: 'a', body: 'one' },
                { step: 7, subject: 'b', body: 'two' },
                { step: 9, subject: 'c', body: 'three' },
              ],
            }),
          ),
        },
      });

      expect(result).toStrictEqual({
        customId: 'contact-1',
        sequence: {
          provider: 'openai',
          model: 'gpt-6-sol',
          externalId: 'resp_1',
          usage: {
            inputTokens: 400,
            outputTokens: 1000,
            cacheWriteTokens: 0,
            cacheReadTokens: 600,
          },
          costMicros: (920 + 10_000) / 2,
          emails: [
            { step: 1, subject: 'a', body: 'one' },
            { step: 2, subject: 'b', body: 'two' },
          ],
          angle: { pain: 'Missed enquiries', reason: 'Only a phone number.' },
        },
      });
    });

    it('keeps the billed usage of an unparsable reply', () => {
      const result = line({
        custom_id: 'contact-1',
        response: { status_code: 200, body: body('{"emails": [') },
      });

      expect('sequence' in result && result.sequence.emails).toBeNull();
    });

    it('reports the error of a failed request', () => {
      expect(
        line({
          custom_id: 'contact-1',
          response: { status_code: 400, body: { error: { message: 'Bad schema' } } },
        }),
      ).toStrictEqual({ customId: 'contact-1', error: 'Bad schema' });
    });

    it('reports an expired request from the error file', () => {
      expect(
        line({ custom_id: 'contact-1', response: null, error: { message: 'Batch expired' } }),
      ).toStrictEqual({ customId: 'contact-1', error: 'Batch expired' });
    });
  });
});
