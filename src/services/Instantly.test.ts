import { describe, expect, it } from 'vitest';
import type { campaignSchema, contactSchema, emailDraftSchema } from '@/models/Schema';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';
import {
  buildCampaignPayload,
  buildLeadPayload,
  buildResearchVariables,
  chunkLeads,
  toHtmlBody,
} from './Instantly';

const campaign = (
  overrides: Partial<typeof campaignSchema.$inferSelect> = {},
): typeof campaignSchema.$inferSelect => ({
  id: 'campaign-1',
  userId: 'user-1',
  name: 'Q4 outreach',
  status: 'review',
  processor: 'core',
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

const contact = (): typeof contactSchema.$inferSelect => ({
  id: 'contact-1',
  campaignId: 'campaign-1',
  rowIndex: 0,
  email: 'ada@analytical.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: null,
  company: 'Analytical',
  website: null,
  linkedinUrl: null,
  extra: {},
  status: 'approved',
  errorMessage: null,
  updatedAt: new Date(),
  createdAt: new Date(),
});

const enrichment = (overrides: Partial<EnrichmentContent> = {}): EnrichmentContent => ({
  person_found: true,
  identity_match_confidence: 'high',
  identity_match_reasoning: 'Same employer and city as the list',
  full_name: 'Ada Lovelace',
  current_role: 'CTO',
  current_company: 'Analytical',
  company_description: 'Builds engines that compute',
  company_industry: 'Computing',
  location: 'London, UK',
  linkedin_url: 'https://linkedin.com/in/ada',
  recent_activity: 'Raised a seed round',
  personalization_hooks: 'Spoke at Engine Conf',
  ...overrides,
});

const draft = (stepIndex: number, subject: string, body: string) =>
  ({
    id: `draft-${stepIndex}`,
    contactId: 'contact-1',
    stepIndex,
    subject,
    body,
    edited: false,
    model: 'claude-opus-5',
    updatedAt: new Date(),
    createdAt: new Date(),
  }) satisfies typeof emailDraftSchema.$inferSelect;

describe('Instantly', () => {
  describe('Campaign payload', () => {
    it('creates one step per email with placeholder variants', () => {
      const payload = buildCampaignPayload({
        campaign: campaign(),
        emailList: ['sales@acme.com'],
        timezone: 'Europe/Rome',
      });

      const steps = payload.sequences.at(0)?.steps ?? [];

      expect(steps).toHaveLength(3);
      expect(steps.at(0)?.variants.at(0)).toStrictEqual({
        subject: '{{email_subject_1}}',
        body: '{{email_body_1}}',
      });
      expect(steps.at(2)?.variants.at(0)?.body).toBe('{{email_body_3}}');
    });

    it('applies the configured delay to every step but the last', () => {
      const payload = buildCampaignPayload({
        campaign: campaign({ emailCount: 3, delaysDays: [2, 4, 7] }),
        emailList: ['sales@acme.com'],
        timezone: 'Europe/Rome',
      });

      expect(payload.sequences.at(0)?.steps.map((step) => step.delay)).toStrictEqual([2, 4, 0]);
    });

    it('carries the selected mailboxes and timezone', () => {
      const payload = buildCampaignPayload({
        campaign: campaign(),
        emailList: ['a@acme.com', 'b@acme.com'],
        timezone: 'Europe/Rome',
      });

      expect(payload.email_list).toStrictEqual(['a@acme.com', 'b@acme.com']);
      expect(payload.campaign_schedule.schedules.at(0)?.timezone).toBe('Europe/Rome');
    });
  });

  describe('Lead payload', () => {
    it('carries one subject and body variable per step', () => {
      const lead = buildLeadPayload({
        contact: contact(),
        drafts: [draft(1, 'first', 'hello'), draft(2, 'second', 'again')],
        enrichment: null,
      });

      expect(lead.custom_variables).toStrictEqual({
        email_subject_1: 'first',
        email_body_1: 'hello',
        email_subject_2: 'second',
        email_body_2: 'again',
      });
    });

    it('sends undefined rather than null for missing contact fields', () => {
      const lead = buildLeadPayload({ contact: contact(), drafts: [], enrichment: null });

      expect(lead.phone).toBeUndefined();
      expect(lead.first_name).toBe('Ada');
    });

    it('carries the research next to the drafts', () => {
      const lead = buildLeadPayload({
        contact: contact(),
        drafts: [draft(1, 'first', 'hello')],
        enrichment: enrichment(),
      });

      expect(lead.custom_variables).toMatchObject({
        email_subject_1: 'first',
        research_role: 'CTO',
      });
    });
  });

  describe('Research variables', () => {
    it('maps every researched field to a research variable', () => {
      expect(buildResearchVariables(enrichment())).toStrictEqual({
        research_confidence: 'high',
        research_identity_reasoning: 'Same employer and city as the list',
        research_role: 'CTO',
        research_company: 'Analytical',
        research_company_description: 'Builds engines that compute',
        research_industry: 'Computing',
        research_location: 'London, UK',
        research_linkedin_url: 'https://linkedin.com/in/ada',
        research_recent_activity: 'Raised a seed round',
        research_hooks: 'Spoke at Engine Conf',
      });
    });

    it('omits fields the research left empty', () => {
      const variables = buildResearchVariables(
        enrichment({ recent_activity: '', personalization_hooks: '' }),
      );

      expect(variables).not.toHaveProperty('research_recent_activity');
      expect(variables).not.toHaveProperty('research_hooks');
      expect(variables).toHaveProperty('research_role', 'CTO');
    });

    it('keeps only company-level fields when the identity match is low', () => {
      const variables = buildResearchVariables(
        enrichment({ identity_match_confidence: 'low', identity_match_reasoning: 'Common name' }),
      );

      expect(variables).toStrictEqual({
        research_confidence: 'low',
        research_identity_reasoning: 'Common name',
        research_company_description: 'Builds engines that compute',
        research_industry: 'Computing',
      });
    });

    it('keeps only company-level fields when no person was found', () => {
      const variables = buildResearchVariables(enrichment({ person_found: false }));

      expect(variables).not.toHaveProperty('research_role');
      expect(variables).not.toHaveProperty('research_hooks');
    });

    it('returns nothing without research', () => {
      expect(buildResearchVariables(null)).toStrictEqual({});
    });
  });

  describe('Body conversion', () => {
    it('escapes HTML so a written angle bracket is not markup', () => {
      expect(toHtmlBody('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    });

    it('turns line breaks into markup', () => {
      expect(toHtmlBody('one\n\ntwo')).toBe('one<br/><br/>two');
    });

    it('normalises Windows line endings', () => {
      expect(toHtmlBody('one\r\ntwo')).toBe('one<br/>two');
    });
  });

  describe('Lead chunking', () => {
    it('splits leads into request-sized batches', () => {
      const chunks = chunkLeads([1, 2, 3, 4, 5], 2);

      expect(chunks).toStrictEqual([[1, 2], [3, 4], [5]]);
    });

    it('returns nothing for an empty list', () => {
      expect(chunkLeads([], 2)).toStrictEqual([]);
    });
  });
});
