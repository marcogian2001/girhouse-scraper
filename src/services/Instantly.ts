import * as z from 'zod';
import { Env } from '@/libs/Env';
import type { campaignSchema, contactSchema, emailDraftSchema } from '@/models/Schema';
import { requireEnv } from '@/utils/Helpers';
import { SEGMENT_VARIABLES } from '@/utils/Leads';
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

const emailSchema = z.object({
  id: z.string(),
  thread_id: z.string().nullish(),
  // 1 sent by a campaign step, 2 received, 3 sent by hand or through the API, 4 scheduled
  ue_type: z.number().nullish(),
  eaccount: z.string().nullish(),
  subject: z.string().nullish(),
  timestamp_email: z.string().nullish(),
  timestamp_created: z.string().nullish(),
  is_auto_reply: z.number().nullish(),
  i_status: z.number().nullish(),
  body: z.object({ text: z.string().nullish(), html: z.string().nullish() }).nullish(),
});

const sentEmailResponseSchema = z.object({ id: z.string() });

const listEmailsResponseSchema = z.object({
  items: z.array(emailSchema),
});

export type InstantlyEmail = z.infer<typeof emailSchema>;

/** Instantly's lead interest statuses, as the labels the classifier reads. */
const INTEREST_LABELS: Record<number, string> = {
  0: 'out_of_office',
  1: 'interested',
  2: 'meeting_booked',
  3: 'meeting_completed',
  4: 'won',
  [-1]: 'not_interested',
  [-2]: 'wrong_person',
  [-3]: 'lost',
  [-4]: 'no_show',
};

/** Instantly's interest value for a lead who booked a meeting. */
export const MEETING_BOOKED_INTEREST = 2;

/** Instantly's lead status while the campaign is still sending to the lead. */
export const ACTIVE_LEAD_STATUS = 1;

const campaignLeadsSchema = z.object({
  items: z.array(z.looseObject({ status: z.number().nullish() })),
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
 * Zones Instantly's timezone list leaves out, mapped to a listed zone on the same clock.
 * Instantly's own "Rome" option is saved as Arctic/Longyearbyen, which shares Central European time.
 */
const INSTANTLY_TIMEZONES: Record<string, string> = { 'Europe/Rome': 'Arctic/Longyearbyen' };

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
        timezone: INSTANTLY_TIMEZONES[options.timezone] ?? options.timezone,
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
  // An out-of-office reply must not end the sequence; the automation waits for the return date
  stop_on_auto_reply: false,
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
 * Builds one lead, carrying its personalised copy, research and segment as custom variables.
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

  // Lets campaigns be filtered and segmented by where and what the business is
  for (const [header, variable] of Object.entries(SEGMENT_VARIABLES)) {
    const value = options.contact.extra[header];

    if (value) {
      customVariables[variable] = value;
    }
  }

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

/**
 * Lists every email exchanged with a lead, across campaigns and manual sends.
 * Filtering by campaign would hide replies a salesperson sent by hand, which carry none.
 * @param leadEmail The lead's email address.
 * @returns Up to 100 emails, oldest first.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const listLeadEmails = async (leadEmail: string) => {
  const query = new URLSearchParams({ lead: leadEmail, limit: '100', sort_order: 'asc' });
  const payload = listEmailsResponseSchema.parse(await request(`/emails?${query.toString()}`));

  return payload.items;
};

/**
 * Sets a lead's interest status in one campaign. A positive status such as "meeting
 * booked" marks the campaign lead completed, which stops its sequence.
 * @param options The update.
 * @param options.email The lead's email.
 * @param options.campaignId The Instantly campaign.
 * @param options.value The interest value, such as `MEETING_BOOKED_INTEREST`.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const updateLeadInterest = async (options: {
  email: string;
  campaignId: string;
  value: number;
}) => {
  await request('/leads/update-interest-status', {
    method: 'POST',
    body: JSON.stringify({
      lead_email: options.email,
      interest_value: options.value,
      campaign_id: options.campaignId,
    }),
  });
};

/**
 * Reads a lead's status in one campaign: 1 while the campaign still sends to them,
 * 3 once their sequence is completed or stopped.
 * @param options The lookup.
 * @param options.email The lead's email.
 * @param options.campaignId The Instantly campaign.
 * @returns The status, or null when the lead is not in the campaign.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const getCampaignLeadStatus = async (options: { email: string; campaignId: string }) => {
  const payload = campaignLeadsSchema.parse(
    await request('/leads/list', {
      method: 'POST',
      body: JSON.stringify({ campaign: options.campaignId, contacts: [options.email], limit: 1 }),
    }),
  );

  return payload.items[0]?.status ?? null;
};

/**
 * Adds an address to the workspace blocklist, so no campaign ever emails it again.
 * @param email The address to block.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const addToBlocklist = async (email: string) => {
  await request('/block-lists-entries', {
    method: 'POST',
    body: JSON.stringify({ bl_value: email }),
  });
};

/**
 * Reads when an email was sent or received.
 * @param email The Instantly email.
 * @returns The mail server timestamp, falling back to when Instantly stored it.
 */
export const emailTimestamp = (email: InstantlyEmail) => {
  const value = email.timestamp_email ?? email.timestamp_created;

  return value ? new Date(value) : null;
};

/**
 * Turns an email body into plain text.
 * @param email The Instantly email.
 * @returns The text body, or the HTML body stripped of its tags.
 */
export const emailText = (email: InstantlyEmail) => {
  if (email.body?.text) {
    return email.body.text;
  }

  return (email.body?.html ?? '')
    .replaceAll(/<br\s*\/?>/giu, '\n')
    .replaceAll(/<\/(?:p|div)>/giu, '\n')
    .replaceAll(/<[^>]+>/gu, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim();
};

/**
 * Maps Instantly's numeric interest status to a label.
 * @param status The `i_status` of an email.
 * @returns The label, or null when Instantly set none.
 */
export const toInterestLabel = (status: number | null | undefined) =>
  status === null || status === undefined ? null : (INTEREST_LABELS[status] ?? `status_${status}`);

/**
 * Finds the thread a reply belongs to: the latest received email not already stored.
 * @param options The lookup options.
 * @param options.emails Every email with the lead, oldest first.
 * @param options.knownEmailIds Received emails already matched to a stored reply.
 * @returns The received email and the emails of its thread, oldest first.
 */
export const findReplyThread = (options: {
  emails: InstantlyEmail[];
  knownEmailIds: Set<string>;
}) => {
  const reply = options.emails.findLast(
    (email) => email.ue_type === 2 && !options.knownEmailIds.has(email.id),
  );

  if (!reply) {
    return null;
  }

  const thread = reply.thread_id
    ? options.emails.filter((email) => email.thread_id === reply.thread_id)
    : [reply];

  return { reply, thread };
};

/**
 * Finds an email a salesperson sent by hand, which hands the lead back to them.
 * @param options The lookup options.
 * @param options.thread The thread, oldest first.
 * @param options.ownEmailIds Emails the automation sent through the API itself.
 * @returns The latest manual email, or undefined when there is none.
 */
export const findManualReply = (options: { thread: InstantlyEmail[]; ownEmailIds: Set<string> }) =>
  options.thread.findLast((email) => email.ue_type === 3 && !options.ownEmailIds.has(email.id));

/**
 * Finds when the first cold email of a thread went out.
 * @param thread The thread, oldest first.
 * @returns The send time of the first campaign step, or null when none is in the thread.
 */
export const firstCampaignEmailAt = (thread: InstantlyEmail[]) => {
  const first = thread.find((email) => email.ue_type === 1);

  return first ? emailTimestamp(first) : null;
};

/**
 * Replies to an email in its own thread, from the mailbox the thread runs on.
 * @param options The reply.
 * @param options.eaccount The connected mailbox the cold email went out from.
 * @param options.replyToEmailId The Instantly id of the email being answered.
 * @param options.subject The subject, as a reply.
 * @param options.body The plain-text body.
 * @returns The Instantly id of the sent email.
 * @throws {Error} When the API key is missing or Instantly rejects the request.
 */
export const replyToEmail = async (options: {
  eaccount: string;
  replyToEmailId: string;
  subject: string;
  body: string;
}) => {
  const sent = sentEmailResponseSchema.parse(
    await request('/emails/reply', {
      method: 'POST',
      body: JSON.stringify({
        eaccount: options.eaccount,
        reply_to_uuid: options.replyToEmailId,
        subject: options.subject,
        body: { text: options.body, html: toHtmlBody(options.body) },
      }),
    }),
  );

  return sent.id;
};
