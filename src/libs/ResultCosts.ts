import { and, eq, sql } from 'drizzle-orm';
import { apiUsageSchema } from '@/models/Schema';
import { db } from './DB';

/**
 * Groups recorded costs by provider without allocating acquisition costs to campaigns.
 * @param options The authorized report scope.
 * @returns Provider amounts and whether they are estimates or provider-reported amounts.
 */
export const getResultCostProviders = async (options: {
  organizationId: string;
  campaignId?: string;
  leadSearchId?: string;
}) =>
  await db
    .select({
      provider: apiUsageSchema.provider,
      basis: sql<
        'provider' | 'historical' | 'estimate'
      >`case when ${apiUsageSchema.provider} = 'apify' and ${apiUsageSchema.model} = 'google_maps_reported' then 'provider' when ${apiUsageSchema.provider} = 'apify' then 'historical' else 'estimate' end`,
      costMicros: sql<number>`coalesce(sum(${apiUsageSchema.costMicros}), 0)`.mapWith(Number),
    })
    .from(apiUsageSchema)
    .where(
      and(
        eq(apiUsageSchema.organizationId, options.organizationId),
        options.campaignId ? eq(apiUsageSchema.campaignId, options.campaignId) : undefined,
        options.leadSearchId ? eq(apiUsageSchema.leadSearchId, options.leadSearchId) : undefined,
      ),
    )
    .groupBy(
      apiUsageSchema.provider,
      sql`case when ${apiUsageSchema.provider} = 'apify' and ${apiUsageSchema.model} = 'google_maps_reported' then 'provider' when ${apiUsageSchema.provider} = 'apify' then 'historical' else 'estimate' end`,
    );

/**
 * Counts complete usable sequences once per contact email, excluding failed drafts.
 * @param options The contacts, draft steps and expected sequence length.
 * @returns The number of unique recipients with every expected draft present.
 */
export const countReadySequences = (options: {
  contacts: { id: string; email: string; status: string }[];
  drafts: { contactId: string; stepIndex: number; subject: string; body: string }[];
  emailCount: number;
}) => {
  if (options.emailCount < 1) {
    return 0;
  }
  const completeSteps = new Map<string, Set<number>>();
  for (const draft of options.drafts) {
    if (!draft.subject.trim() || !draft.body.trim()) {
      continue;
    }
    const steps = completeSteps.get(draft.contactId) ?? new Set<number>();
    steps.add(draft.stepIndex);
    completeSteps.set(draft.contactId, steps);
  }
  const expectedSteps = Array.from({ length: options.emailCount }, (_, index) => index + 1);
  return new Set(
    options.contacts
      .filter(
        (contact) =>
          contact.email.trim() &&
          ['ready', 'approved'].includes(contact.status) &&
          expectedSteps.every((step) => completeSteps.get(contact.id)?.has(step)),
      )
      .map((contact) => contact.email.trim().toLowerCase()),
  ).size;
};

/**
 * Counts verified usable addresses separately from catch-all outcomes.
 * @param leads The lead search results.
 * @returns Unique valid and catch-all recipients, never inferred from campaign imports.
 */
export const countVerifiedEmails = (
  leads: { email: string | null; status: string; emailVerification: string | null }[],
) => ({
  valid: new Set(
    leads
      .filter(
        (lead) =>
          lead.status === 'ready' && lead.email?.trim() && lead.emailVerification === 'valid',
      )
      .map((lead) => lead.email?.trim().toLowerCase()),
  ).size,
  catchAll: new Set(
    leads
      .filter(
        (lead) =>
          lead.status === 'ready' && lead.email?.trim() && lead.emailVerification === 'catch_all',
      )
      .map((lead) => lead.email?.trim().toLowerCase()),
  ).size,
});
