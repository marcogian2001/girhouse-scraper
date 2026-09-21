import { describe, expect, it } from 'vitest';
import type { contactSchema } from '@/models/Schema';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';
import { buildContactPrompt } from './Claude';

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
});
