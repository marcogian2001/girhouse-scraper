import type * as z from 'zod';
import { ContactRowValidation } from '@/validations/CampaignValidation';

export type ContactField =
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'company'
  | 'website'
  | 'linkedinUrl';

export type ColumnMapping = Partial<Record<ContactField, string>>;

export type ContactRow = z.input<typeof ContactRowValidation>;

export const CONTACT_FIELDS: ContactField[] = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'company',
  'website',
  'linkedinUrl',
];

/** Header spellings we recognise, in English and Italian. */
const FIELD_ALIASES: Record<ContactField, string[]> = {
  email: ['email', 'emailaddress', 'mail', 'indirizzoemail', 'postaelettronica'],
  firstName: ['firstname', 'givenname', 'forename', 'nome'],
  lastName: ['lastname', 'surname', 'familyname', 'cognome'],
  phone: ['phone', 'phonenumber', 'mobile', 'telephone', 'telefono', 'cellulare', 'tel'],
  company: [
    'company',
    'companyname',
    'organization',
    'organisation',
    'employer',
    'azienda',
    'societa',
    'ragionesociale',
  ],
  website: ['website', 'websiteurl', 'url', 'site', 'domain', 'sito', 'sitoweb'],
  linkedinUrl: ['linkedin', 'linkedinurl', 'linkedinprofile', 'profilolinkedin'],
};

/**
 * Reduces a header to a comparable key, so `First Name`, `first_name` and
 * `FIRSTNAME` all match the same field.
 * @param header The raw CSV header.
 * @returns The normalised key.
 */
const normalizeHeader = (header: string) =>
  header
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .replaceAll(/[^a-z0-9]/gu, '');

/**
 * Guesses which CSV column feeds which contact field.
 * @param headers The headers found in the uploaded file.
 * @returns The detected mapping, with unmatched fields left out.
 */
export const autoDetectMapping = (headers: string[]) => {
  const mapping: ColumnMapping = {};
  const taken = new Set<string>();

  for (const field of CONTACT_FIELDS) {
    const aliases = FIELD_ALIASES[field];

    const match = headers.find(
      (header) => !taken.has(header) && aliases.includes(normalizeHeader(header)),
    );

    if (match) {
      mapping[field] = match;
      taken.add(match);
    }
  }

  return mapping;
};

/**
 * Checks an address against the same schema the campaigns endpoint applies, so
 * a row the wizard keeps is a row the endpoint accepts.
 * @param email The trimmed value of the mapped email column.
 * @returns Whether the address is a valid one.
 */
const isValidEmail = (email: string) => ContactRowValidation.shape.email.safeParse(email).success;

/**
 * Applies a mapping to the parsed CSV rows.
 * Rows without a valid email are dropped: they cannot be enriched or mailed.
 * Every column left unmapped is preserved in `extra` and still shown to the model.
 * @param options The call options.
 * @param options.rows The parsed CSV records.
 * @param options.mapping The column mapping to apply.
 * @returns The contact rows, ready to be posted to the campaigns endpoint.
 */
export const toContactRows = (options: {
  rows: Record<string, string>[];
  mapping: ColumnMapping;
}) => {
  const mappedHeaders = new Set(Object.values(options.mapping));

  const read = (row: Record<string, string>, field: ContactField) => {
    const header = options.mapping[field];
    const value = header ? row[header]?.trim() : undefined;

    // An empty cell is the same as an absent one
    return value === '' ? undefined : value;
  };

  return options.rows.flatMap<ContactRow>((row) => {
    const email = read(row, 'email');

    if (!email || !isValidEmail(email)) {
      return [];
    }

    const extra: Record<string, string> = {};

    for (const [header, value] of Object.entries(row)) {
      if (!mappedHeaders.has(header) && value?.trim()) {
        extra[header] = value.trim();
      }
    }

    return [
      {
        email,
        firstName: read(row, 'firstName'),
        lastName: read(row, 'lastName'),
        phone: read(row, 'phone'),
        company: read(row, 'company'),
        website: read(row, 'website'),
        linkedinUrl: read(row, 'linkedinUrl'),
        extra,
      },
    ];
  });
};
