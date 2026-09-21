import * as z from 'zod';
import { Env } from '@/libs/Env';
import type { campaignSchema, contactSchema, emailDraftSchema } from '@/models/Schema';
import { requireEnv } from '@/utils/Helpers';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';

const INSTANTLY_API_URL = 'https://api.instantly.ai/api/v2';

/** Instantly accepts at most 1000 leads per request. */
const LEADS_PER_REQUEST = 1000;

type Campaign = typeof campaignSchema.$inferSelect;

type Contact = typeof contactSchema.$inferSelect;

type EmailDraft = typeof emailDraftSchema.$inferSelect;

const accountSchema = z.object({
  email: z.string(),
  status: z.number().nullish(),
  warmup_status: z.number().nullish(),
});

const listAccountsResponseSchema = z.object({
  items: z.array(accountSchema).nullish(),
});

const createCampaignResponseSchema = z.object({
  id: z.string(),
});

const addLeadsResponseSchema = z.object({
  status: z.string().nullish(),
  total_sent: z.number().nullish(),
  leads_uploaded: z.number().nullish(),
  skipped_count: z.number().nullish(),
  invalid_email_count: z.number().nullish(),
  duplicate_email_count: z.number().nullish(),
});

/**
 * Calls the Instantly API and fails loudly on a non-2xx response.
 * @param path The API path, relative to the v2 base URL.
 * @param init Fetch options; a JSON body is expected to be pre-serialised.
 * @returns The parsed JSON response.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
const request = async (path: string, init?: RequestInit): Promise<unknown> => {
  const apiKey = requireEnv('INSTANTLY_API_KEY', Env.INSTANTLY_API_KEY);

  const response = await fetch(`${INSTANTLY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Instantly ${path} failed with ${response.status}: ${await response.text()}`);
  }

  return await response.json();
};

/**
 * Escapes a plain-text email body into the HTML Instantly expects.
 * @param body The plain-text body written by Claude.
 * @returns HTML with escaped entities and paragraph breaks.
 */
export const toHtmlBody = (body: string) =>
  body
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r\n', '\n')
    .replaceAll('\n', '<br/>');

/**
 * Builds the campaign payload. Every step carries placeholders instead of copy,
 * because the actual subject and body travel per lead as custom variables.
 * @param options The call options.
 * @param options.campaign The campaign settings, including the per-step delays.
 * @param options.emailList The sending mailboxes to rotate through.
 * @param options.timezone The IANA timezone the schedule runs in.
 * @returns The body for `POST /campaigns`.
 */
export const buildCampaignPayload = (options: {
  campaign: Campaign;
  emailList: string[];
  timezone: string;
}) => ({
  name: options.campaign.name,
  campaign_schedule: {
    schedules: [
      {
        name: 'Business hours',
        timing: { from: '09:00', to: '17:00' },
        days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
        timezone: options.timezone,
      },
    ],
  },
  sequences: [
    {
      steps: Array.from({ length: options.campaign.emailCount }, (_unused, index) => ({
        type: 'email',
        // Days to wait before the next step; the last step has nothing to wait for
        delay:
          index === options.campaign.emailCount - 1
            ? 0
            : (options.campaign.delaysDays.at(index) ?? 0),
        variants: [
          {
            subject: `{{email_subject_${index + 1}}}`,
            body: `{{email_body_${index + 1}}}`,
          },
        ],
      })),
    },
  ],
  email_list: options.emailList,
  stop_on_reply: true,
  link_tracking: false,
  open_tracking: false,
});

/**
 * Flattens the research into string custom variables, so Instantly knows who the
 * lead is when it answers their replies. Empty answers are dropped, and when the
 * research may describe a namesake only the company-level fields are kept.
 * @param enrichment The research output, when it parsed cleanly.
 * @returns The `research_*` custom variables.
 */
export const buildResearchVariables = (enrichment: EnrichmentContent | null) => {
  if (!enrichment) {
    return {};
  }

  const isReliable = enrichment.person_found && enrichment.identity_match_confidence !== 'low';

  const variables = {
    research_confidence: enrichment.identity_match_confidence,
    research_identity_reasoning: enrichment.identity_match_reasoning,
    research_company_description: enrichment.company_description,
    research_industry: enrichment.company_industry,
    ...(isReliable && {
      research_role: enrichment.current_role,
      research_company: enrichment.current_company,
      research_location: enrichment.location,
      research_linkedin_url: enrichment.linkedin_url,
      research_recent_activity: enrichment.recent_activity,
      research_hooks: enrichment.personalization_hooks,
    }),
  };

  return Object.fromEntries(Object.entries(variables).filter(([, value]) => value));
};

/**
 * Builds one lead, carrying its personalised copy and research as custom variables.
 * @param options The call options.
 * @param options.contact The contact to send to.
 * @param options.drafts The approved drafts for that contact.
 * @param options.enrichment The research output, when it parsed cleanly.
 * @returns The lead entry for `POST /leads/add`.
 */
export const buildLeadPayload = (options: {
  contact: Contact;
  drafts: EmailDraft[];
  enrichment: EnrichmentContent | null;
}) => {
  const customVariables: Record<string, string> = buildResearchVariables(options.enrichment);

  for (const draft of options.drafts) {
    customVariables[`email_subject_${draft.stepIndex}`] = draft.subject;
    customVariables[`email_body_${draft.stepIndex}`] = toHtmlBody(draft.body);
  }

  return {
    email: options.contact.email,
    first_name: options.contact.firstName ?? undefined,
    last_name: options.contact.lastName ?? undefined,
    company_name: options.contact.company ?? undefined,
    phone: options.contact.phone ?? undefined,
    website: options.contact.website ?? undefined,
    custom_variables: customVariables,
  };
};

/**
 * Splits leads into request-sized chunks.
 * @param leads The leads to send.
 * @param size The maximum chunk size.
 * @returns The chunked leads.
 */
export const chunkLeads = <T>(leads: T[], size: number = LEADS_PER_REQUEST) => {
  const chunks: T[][] = [];

  for (let index = 0; index < leads.length; index += size) {
    chunks.push(leads.slice(index, index + size));
  }

  return chunks;
};

/**
 * Lists the mailboxes available to send from.
 * @returns The connected sending accounts.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const listAccounts = async () => {
  const payload = listAccountsResponseSchema.parse(await request('/accounts?limit=100'));

  return payload.items ?? [];
};

/**
 * Creates the Instantly campaign that will send the approved sequence.
 * @param payload The campaign body, from `buildCampaignPayload`.
 * @returns The identifier of the created campaign.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const createCampaign = async (payload: ReturnType<typeof buildCampaignPayload>) => {
  const created = createCampaignResponseSchema.parse(
    await request('/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
  );

  return created.id;
};

/**
 * Adds a batch of leads to a campaign.
 * @param options The call options.
 * @param options.campaignId The Instantly campaign to fill.
 * @param options.leads At most `LEADS_PER_REQUEST` leads.
 * @returns The import summary reported by Instantly.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const addLeads = async (options: {
  campaignId: string;
  leads: ReturnType<typeof buildLeadPayload>[];
}) => {
  const payload = await request('/leads/add', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: options.campaignId,
      leads: options.leads,
      skip_if_in_campaign: true,
    }),
  });

  return addLeadsResponseSchema.parse(payload);
};
