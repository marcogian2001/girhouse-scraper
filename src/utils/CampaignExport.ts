import Papa from 'papaparse';
import * as z from 'zod';
import type { contactSchema, emailDraftSchema, enrichmentSchema } from '@/models/Schema';
import {
  EnrichmentBasisValidation,
  EnrichmentContentValidation,
} from '@/validations/EnrichmentValidation';

type Contact = typeof contactSchema.$inferSelect;

type Enrichment = typeof enrichmentSchema.$inferSelect;

type EmailDraft = typeof emailDraftSchema.$inferSelect;

const CONTACT_COLUMNS = [
  'email',
  'first_name',
  'last_name',
  'phone',
  'company',
  'website',
  'linkedin_url',
  'status',
  'error',
];

const RESEARCH_FIELDS = EnrichmentContentValidation.keyof().options;

/**
 * Collects the distinct citation URLs behind the research, in the order they appear.
 * @param basis The raw basis stored with the enrichment.
 * @returns The URLs, one per line.
 */
const toSources = (basis: unknown) => {
  const parse = z.array(EnrichmentBasisValidation).safeParse(basis);

  if (!parse.success) {
    return '';
  }

  const urls = parse.data.flatMap(
    (entry) => entry.citations?.map((citation) => citation.url) ?? [],
  );

  return [...new Set(urls)].join('\n');
};

/**
 * Builds the research columns of one contact, left empty when the research is missing.
 * @param enrichment The contact's enrichment, if any.
 * @returns The `research_*` cells.
 */
const toResearchCells = (enrichment: Enrichment | undefined) => {
  const content = EnrichmentContentValidation.safeParse(enrichment?.content);
  const cells: Record<string, string> = {};

  for (const field of RESEARCH_FIELDS) {
    cells[`research_${field}`] = content.success ? String(content.data[field]) : '';
  }

  cells.research_sources = toSources(enrichment?.basis);
  cells.research_error = enrichment?.error ?? '';

  return cells;
};

/**
 * Builds a CSV holding, for every contact of a campaign, its details, its
 * research and the emails written for it.
 * @param options The call options.
 * @param options.emailCount The number of emails in the sequence.
 * @param options.contacts The campaign contacts, in the order to export them.
 * @param options.enrichments The research rows of those contacts.
 * @param options.drafts The email drafts of those contacts.
 * @param options.campaignNames The campaign names by id, which add a leading
 * `campaign` column when several campaigns are exported together.
 * @returns The CSV text, prefixed with a BOM so spreadsheets read it as UTF-8.
 */
export const buildCampaignCsv = (options: {
  emailCount: number;
  contacts: Contact[];
  enrichments: Enrichment[];
  drafts: EmailDraft[];
  campaignNames?: Map<string, string>;
}) => {
  const { campaignNames } = options;
  const fixedColumns = campaignNames ? ['campaign', ...CONTACT_COLUMNS] : CONTACT_COLUMNS;

  // An unmapped column named like a fixed one is renamed, so neither overwrites the other
  const extraColumns = [
    ...new Set(options.contacts.flatMap((contact) => Object.keys(contact.extra))),
  ].map((key) => ({ key, column: fixedColumns.includes(key) ? `extra_${key}` : key }));

  const researchColumns = [
    ...RESEARCH_FIELDS.map((field) => `research_${field}`),
    'research_sources',
    'research_error',
  ];

  const steps = Array.from({ length: options.emailCount }, (_unused, index) => index + 1);
  const emailColumns = steps.flatMap((step) => [`email_${step}_subject`, `email_${step}_body`]);

  const rows = options.contacts.map((contact) => {
    const enrichment = options.enrichments.find((row) => row.contactId === contact.id);
    const drafts = options.drafts.filter((draft) => draft.contactId === contact.id);

    const emailCells = Object.fromEntries(
      steps.flatMap((step) => {
        const draft = drafts.find((row) => row.stepIndex === step);

        return [
          [`email_${step}_subject`, draft?.subject ?? ''],
          [`email_${step}_body`, draft?.body ?? ''],
        ];
      }),
    );

    return {
      ...Object.fromEntries(
        extraColumns.map((extra) => [extra.column, contact.extra[extra.key] ?? '']),
      ),
      ...(campaignNames && { campaign: campaignNames.get(contact.campaignId) ?? '' }),
      email: contact.email,
      first_name: contact.firstName ?? '',
      last_name: contact.lastName ?? '',
      phone: contact.phone ?? '',
      company: contact.company ?? '',
      website: contact.website ?? '',
      linkedin_url: contact.linkedinUrl ?? '',
      status: contact.status,
      error: contact.errorMessage ?? '',
      ...toResearchCells(enrichment),
      ...emailCells,
    };
  });

  const csv = Papa.unparse(
    {
      fields: [
        ...fixedColumns,
        ...extraColumns.map((extra) => extra.column),
        ...researchColumns,
        ...emailColumns,
      ],
      data: rows,
    },
    // Scraped text starting with `=` or `@` would run as a spreadsheet formula,
    // while `+` is left alone so phone numbers keep their prefix
    { newline: '\r\n', escapeFormulae: /^[=@]/u },
  );

  return `\uFEFF${csv}`;
};

/**
 * Builds the response that downloads a CSV as a file.
 * @param options The call options.
 * @param options.fileName The file name, accents included.
 * @param options.csv The CSV text.
 * @returns The attachment response.
 */
export const toCsvDownload = (options: { fileName: string; csv: string }) => {
  // The ASCII name covers old clients, `filename*` keeps accents where supported
  const asciiName = options.fileName.replaceAll(/[^\w .-]/gu, '_');

  return new Response(options.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(options.fileName)}`,
    },
  });
};
