import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import type { contactSchema, emailDraftSchema, enrichmentSchema } from '@/models/Schema';
import { buildCampaignCsv } from './CampaignExport';

const now = new Date('2026-01-01T00:00:00Z');

const makeContact = (
  overrides: Partial<typeof contactSchema.$inferSelect>,
): typeof contactSchema.$inferSelect => ({
  id: 'contact-1',
  campaignId: 'campaign-1',
  rowIndex: 0,
  email: 'mario@example.com',
  firstName: 'Mario',
  lastName: 'Rossi',
  phone: '+39 333 1234567',
  company: 'Rossi Srl',
  website: 'https://rossi.it',
  linkedinUrl: null,
  extra: {},
  status: 'ready',
  errorMessage: null,
  pain: null,
  painReason: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const makeDraft = (
  overrides: Partial<typeof emailDraftSchema.$inferSelect>,
): typeof emailDraftSchema.$inferSelect => ({
  id: 'draft-1',
  contactId: 'contact-1',
  stepIndex: 1,
  subject: 'Ciao Mario',
  body: 'Primo messaggio',
  edited: false,
  model: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const enrichment: typeof enrichmentSchema.$inferSelect = {
  id: 'enrichment-1',
  contactId: 'contact-1',
  parallelRunId: null,
  processor: 'core',
  content: {
    person_found: true,
    identity_match_confidence: 'high',
    identity_match_reasoning: 'Same company and city',
    full_name: 'Mario Rossi',
    current_role: 'CEO',
    current_company: 'Rossi Srl',
    company_description: 'Makes furniture',
    company_industry: 'Furniture',
    location: 'Milano',
    linkedin_url: 'https://linkedin.com/in/mario',
    recent_activity: 'Opened a new store',
    personalization_hooks: 'New store in Brera',
  },
  basis: [
    { field: 'current_role', citations: [{ url: 'https://a.com' }, { url: 'https://b.com' }] },
    { field: 'location', citations: [{ url: 'https://a.com' }] },
  ],
  personFound: true,
  identityConfidence: 'high',
  identityReasoning: null,
  error: null,
  startedAt: null,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
};

/**
 * Parses the exported CSV back into records, without its BOM.
 * @param csv The exported CSV text.
 * @returns The header and the rows.
 */
const parse = (csv: string) =>
  Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/u, ''), { header: true });

describe(buildCampaignCsv, () => {
  it('prefixes the output with a BOM', () => {
    const csv = buildCampaignCsv({ emailCount: 1, contacts: [], enrichments: [], drafts: [] });

    expect(csv.startsWith('\uFEFF')).toBeTruthy();
  });

  it('orders contact, extra, research and email columns', () => {
    const csv = buildCampaignCsv({
      emailCount: 2,
      contacts: [
        makeContact({ extra: { Città: 'Milano' } }),
        makeContact({ id: 'contact-2', extra: { Note: 'VIP' } }),
      ],
      enrichments: [],
      drafts: [],
    });

    const fields = parse(csv).meta.fields ?? [];

    expect(fields.slice(0, 11)).toStrictEqual([
      'email',
      'first_name',
      'last_name',
      'phone',
      'company',
      'website',
      'linkedin_url',
      'status',
      'error',
      'Città',
      'Note',
    ]);
    expect(fields.at(11)).toBe('research_person_found');
    expect(fields.slice(-4)).toStrictEqual([
      'email_1_subject',
      'email_1_body',
      'email_2_subject',
      'email_2_body',
    ]);
  });

  it('renames extra columns named like a fixed one', () => {
    const csv = buildCampaignCsv({
      emailCount: 1,
      contacts: [makeContact({ extra: { status: 'hot lead' } })],
      enrichments: [],
      drafts: [],
    });

    const [row] = parse(csv).data;

    expect(row?.status).toBe('ready');
    expect(row?.extra_status).toBe('hot lead');
  });

  it('leads with the campaign name when names are given', () => {
    const csv = buildCampaignCsv({
      emailCount: 1,
      contacts: [
        makeContact({ extra: { campaign: 'Spring' } }),
        makeContact({ id: 'contact-2', campaignId: 'campaign-2' }),
      ],
      enrichments: [],
      drafts: [],
      campaignNames: new Map([
        ['campaign-1', 'Ristoranti Milano'],
        ['campaign-2', 'Hotel Roma'],
      ]),
    });

    const { data, meta } = parse(csv);

    expect(meta.fields?.at(0)).toBe('campaign');
    expect(data.map((row) => row.campaign)).toStrictEqual(['Ristoranti Milano', 'Hotel Roma']);
    expect(data.at(0)?.extra_campaign).toBe('Spring');
  });

  it('fills research and emails for each step', () => {
    const csv = buildCampaignCsv({
      emailCount: 2,
      contacts: [makeContact({})],
      enrichments: [enrichment],
      drafts: [
        makeDraft({}),
        makeDraft({
          id: 'draft-2',
          stepIndex: 2,
          subject: 'Re: Ciao',
          body: 'Riga uno,\nriga "due"',
        }),
      ],
    });

    const [row] = parse(csv).data;

    expect(row?.research_person_found).toBe('true');
    expect(row?.research_current_role).toBe('CEO');
    expect(row?.research_sources).toBe('https://a.com\nhttps://b.com');
    expect(row?.email_1_subject).toBe('Ciao Mario');
    expect(row?.email_2_body).toBe('Riga uno,\nriga "due"');
  });

  it('leaves research and email cells empty for a contact without them', () => {
    const csv = buildCampaignCsv({
      emailCount: 1,
      contacts: [makeContact({ status: 'failed', errorMessage: 'Research failed' })],
      enrichments: [],
      drafts: [],
    });

    const [row] = parse(csv).data;

    expect(row?.error).toBe('Research failed');
    expect(row?.research_full_name).toBe('');
    expect(row?.email_1_subject).toBe('');
  });

  it('keeps phone prefixes and neutralises formulas', () => {
    const csv = buildCampaignCsv({
      emailCount: 1,
      contacts: [makeContact({ company: '=HYPERLINK("x")' })],
      enrichments: [],
      drafts: [],
    });

    const [row] = parse(csv).data;

    expect(row?.phone).toBe('+39 333 1234567');
    expect(row?.company).toBe('\'=HYPERLINK("x")');
  });
});
