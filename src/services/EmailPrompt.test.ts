import { describe, expect, it } from 'vitest';
import type { campaignSchema, contactSchema, knowledgeAssetSchema } from '@/models/Schema';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';
import { buildCampaignBrief, buildContactPrompt, normalizeSequence } from './EmailPrompt';

const campaign = (
  overrides: Partial<typeof campaignSchema.$inferSelect> = {},
): typeof campaignSchema.$inferSelect => ({
  id: 'campaign-1',
  userId: 'user-1',
  organizationId: 'organization-1',
  name: 'Q4 outreach',
  status: 'review',
  processor: 'core',
  copywritingModel: 'claude-opus-5',
  emailCount: 3,
  delaysDays: [2, 4, 0],
  knowledgeAssetIds: [],
  extraPrompt: null,
  instantlyCampaignId: null,
  errorMessage: null,
  updatedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

const asset = (
  overrides: Partial<typeof knowledgeAssetSchema.$inferSelect>,
): typeof knowledgeAssetSchema.$inferSelect => ({
  id: 'asset-1',
  organizationId: 'organization-1',
  userId: 'user-1',
  name: 'Tone of voice',
  kind: 'prompt',
  content: 'Friendly and direct.',
  anthropicFileId: null,
  openaiFileId: null,
  mimeType: null,
  sizeBytes: null,
  updatedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

const priceList = asset({
  id: 'asset-2',
  name: 'Price list.pdf',
  kind: 'document',
  content: null,
  anthropicFileId: 'file-1',
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

describe('Email prompt', () => {
  describe('Campaign brief', () => {
    it('lists a document mentioned in a prompt as required reading', () => {
      const brief = buildCampaignBrief({
        campaign: campaign(),
        knowledgeAssets: [asset({ content: 'Quote prices from @[Price list.pdf].' }), priceList],
      });

      expect(brief).toContain('## Required documents');
      expect(brief).toContain('- Price list.pdf');
    });

    it('lists a document mentioned in the campaign brief', () => {
      const brief = buildCampaignBrief({
        campaign: campaign({ extraPrompt: 'Read @[Price list.pdf] first.' }),
        knowledgeAssets: [priceList],
      });

      expect(brief).toContain('- Price list.pdf');
    });

    it('omits the section when nothing is mentioned', () => {
      const brief = buildCampaignBrief({
        campaign: campaign(),
        knowledgeAssets: [asset({}), priceList],
      });

      expect(brief).not.toContain('## Required documents');
    });
  });

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

  describe('Sequence', () => {
    it('keeps the requested number of emails and renumbers them from 1', () => {
      const emails = normalizeSequence({
        emails: [
          { step: 2, subject: 'a', body: 'a' },
          { step: 5, subject: 'b', body: 'b' },
          { step: 9, subject: 'c', body: 'c' },
        ],
        emailCount: 2,
      });

      expect(emails?.map((email) => email.step)).toStrictEqual([1, 2]);
    });

    it('returns null when nothing parsed', () => {
      expect(normalizeSequence({ emails: undefined, emailCount: 3 })).toBeNull();
    });
  });
});
