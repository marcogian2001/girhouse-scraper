import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { leadSchema, leadSearchSchema } from '@/models/Schema';
import type { ParallelProcessor } from '@/services/Parallel';
import { toEnrichmentContent } from '@/utils/Leads';
import type { EnrichmentContent } from '@/validations/EnrichmentValidation';
import { db } from './DB';

/**
 * Finds the leads of an organization already researched on the platform, so
 * campaign contacts matching them skip a second Parallel run.
 * @param options The call options.
 * @param options.organizationId The organization the leads must belong to.
 * @param options.emails The lowercase contact emails to match.
 * @returns The reusable research keyed by lowercase email.
 */
export const findResearchedLeads = async (options: {
  organizationId: string;
  emails: string[];
}) => {
  const found = new Map<
    string,
    {
      content: EnrichmentContent;
      parallelRunId: string | null;
      processor: ParallelProcessor;
    }
  >();

  if (options.emails.length === 0) {
    return found;
  }

  const email = sql<string>`lower(${leadSchema.email})`;

  // Newest first, so an address shared by several leads resolves to the latest research
  const leads = await db
    .select({ lead: leadSchema, processor: leadSearchSchema.processor, email })
    .from(leadSchema)
    .innerJoin(leadSearchSchema, eq(leadSchema.leadSearchId, leadSearchSchema.id))
    .where(
      and(
        eq(leadSchema.organizationId, options.organizationId),
        eq(leadSchema.status, 'ready'),
        inArray(email, options.emails),
      ),
    )
    .orderBy(desc(leadSchema.updatedAt));

  for (const row of leads) {
    const content = toEnrichmentContent(row.lead);

    if (content && !found.has(row.email)) {
      found.set(row.email, {
        content,
        parallelRunId: row.lead.parallelRunId,
        processor: row.processor,
      });
    }
  }

  return found;
};
