import { describe, expect, it } from 'vitest';
import type { campaignSchema, contactSchema, emailDraftSchema } from '@/models/Schema';
import { buildCampaignPayload, buildLeadPayload, chunkLeads, toHtmlBody } from './Instantly';

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
      });

      expect(lead.custom_variables).toStrictEqual({
        email_subject_1: 'first',
        email_body_1: 'hello',
        email_subject_2: 'second',
        email_body_2: 'again',
      });
    });

    it('sends undefined rather than null for missing contact fields', () => {
      const lead = buildLeadPayload({ contact: contact(), drafts: [] });

      expect(lead.phone).toBeUndefined();
      expect(lead.first_name).toBe('Ada');
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
