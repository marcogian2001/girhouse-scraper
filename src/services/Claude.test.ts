import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { contactSchema } from '@/models/Schema';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';
import { buildContactPrompt, estimateCostMicros } from './Claude';

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

const contact = (): typeof contactSchema.$inferSelect => ({
  id: 'contact-1',
  campaignId: 'campaign-1',
  rowIndex: 0,
  email: 'ada@analytical.com',
  firstName: 'Ada',
  lastName: null,
  phone: null,
  company: null,
  website: null,
  linkedinUrl: null,
  extra: { Segment: 'SMB' },
  status: 'enriched',
  errorMessage: null,
  updatedAt: new Date(),
  createdAt: new Date(),
});

const enrichment = (
  confidence: EnrichmentContent['identity_match_confidence'],
): EnrichmentContent => ({
  person_found: true,
  identity_match_confidence: confidence,
  identity_match_reasoning: 'The email domain matches the company website.',
  full_name: 'Ada Lovelace',
  current_role: 'Head of Growth',
  current_company: 'Analytical',
  company_description: 'Analytics for logistics teams.',
  company_industry: 'Software',
  location: 'London, UK',
  linkedin_url: '',
  recent_activity: 'Announced a Series A in March.',
  personalization_hooks: 'Hiring two SDRs.',
});

describe('Claude', () => {
  describe('Contact prompt', () => {
    it('forbids personal references when confidence is low', () => {
      const prompt = buildContactPrompt({ contact: contact(), enrichment: enrichment('low') });

      expect(prompt).toContain('Do not reference anything personal');
    });

    it('allows a couple of verifiable details when confidence is high', () => {
      const prompt = buildContactPrompt({ contact: contact(), enrichment: enrichment('high') });

      expect(prompt).toContain('at most two of these details');
      expect(prompt).not.toContain('Do not reference anything personal');
    });

    it('falls back to the company angle when research is missing', () => {
      const prompt = buildContactPrompt({ contact: contact(), enrichment: null });

      expect(prompt).toContain('No research is available');
    });

    it('passes unmapped CSV columns through to the model', () => {
      const prompt = buildContactPrompt({ contact: contact(), enrichment: null });

      expect(prompt).toContain('- Segment: SMB');
    });

    it('omits blank research fields', () => {
      const prompt = buildContactPrompt({ contact: contact(), enrichment: enrichment('high') });

      expect(prompt).not.toContain('Linkedin');
    });
  });

  describe('Cost estimate', () => {
    it('prices input and output tokens at Opus 5 list rates', () => {
      // $5 and $25 per million tokens
      expect(estimateCostMicros(usage({ input_tokens: 1000, output_tokens: 1000 }))).toBe(30_000);
    });

    it('prices one-hour cache writes above five-minute ones', () => {
      const cost = estimateCostMicros(
        usage({
          cache_creation_input_tokens: 2000,
          cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 1000 },
        }),
      );

      // $6.25 and $10 per million tokens
      expect(cost).toBe(16_250);
    });

    it('prices cache reads at a tenth of input', () => {
      expect(estimateCostMicros(usage({ cache_read_input_tokens: 1000 }))).toBe(500);
    });

    it('bills writes without a breakdown at the five-minute rate', () => {
      expect(estimateCostMicros(usage({ cache_creation_input_tokens: 1000 }))).toBe(6250);
    });
  });
});
