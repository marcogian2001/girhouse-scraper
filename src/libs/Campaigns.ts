import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  notExists,
  sql,
} from 'drizzle-orm';
import {
  campaignSchema,
  contactSchema,
  emailDraftSchema,
  emailSuppressionSchema,
  enrichmentSchema,
  knowledgeAssetSchema,
  leadSchema,
  leadSearchSchema,
} from '@/models/Schema';
import { toLeadCsv } from '@/utils/Leads';
import { LIST_PAGE_SIZE } from '@/utils/Pagination';
import {
  ACCENTED_LETTERS,
  PLAIN_LETTERS,
  splitSearchTerms,
  toLikePattern,
} from '@/utils/SearchTerms';
import type { CampaignInput } from '@/validations/CampaignValidation';
import { enqueueWriting } from './CampaignWriting';
import { db } from './DB';
import { enqueue } from './JobQueue';
import { findResearchedLeads } from './LeadResearch';
import { logger } from './Logger';
import { campaignCostMicros } from './Usage';

/**
 * Lists one page of an organization's campaigns, newest first, with their contact
 * count and spend. Search and paging run in SQL, so only the page is loaded.
 * @param options The listing.
 * @param options.organizationId The organization.
 * @param options.archived Whether to list the archived campaigns instead of the active ones.
 * @param options.search Words the name must all contain, ignoring case and accents.
 * @param options.page The 1-based page.
 * @returns The page's campaigns, how many match in all, and the organization's
 * campaign and archived totals for the tabs.
 */
export const listCampaigns = async (options: {
  organizationId: string;
  archived: boolean;
  search: string;
  page: number;
}) => {
  const terms = splitSearchTerms(options.search);
  // Folds case and accents in SQL the same way `splitSearchTerms` does in JavaScript
  const searchableName = sql`translate(lower(${campaignSchema.name}), ${ACCENTED_LETTERS}, ${PLAIN_LETTERS})`;

  const [[totals], campaigns] = await Promise.all([
    // `count(column)` skips NULLs, so `archived` counts the archived campaigns
    db
      .select({ total: count(), archived: count(campaignSchema.archivedAt) })
      .from(campaignSchema)
      .where(eq(campaignSchema.organizationId, options.organizationId))
      .$withCache(),
    db
      .select({
        id: campaignSchema.id,
        name: campaignSchema.name,
        status: campaignSchema.status,
        emailCount: campaignSchema.emailCount,
        createdAt: campaignSchema.createdAt,
        // Grouping by the primary key lets the other columns ride along
        contacts: count(contactSchema.id),
        costMicros: campaignCostMicros,
        // Counted after grouping and before the limit, so it is every matching campaign
        matching: sql<number>`count(*) over ()`.mapWith(Number),
      })
      .from(campaignSchema)
      .leftJoin(contactSchema, eq(contactSchema.campaignId, campaignSchema.id))
      .where(
        and(
          eq(campaignSchema.organizationId, options.organizationId),
          options.archived
            ? isNotNull(campaignSchema.archivedAt)
            : isNull(campaignSchema.archivedAt),
          ...terms.map((term) => sql`${searchableName} like ${toLikePattern(term)}`),
        ),
      )
      .groupBy(campaignSchema.id)
      .orderBy(desc(campaignSchema.createdAt), desc(campaignSchema.id))
      .limit(LIST_PAGE_SIZE)
      .offset((options.page - 1) * LIST_PAGE_SIZE)
      .$withCache(),
  ]);

  return {
    campaigns,
    matching: campaigns[0]?.matching ?? 0,
    total: totals?.total ?? 0,
    archived: totals?.archived ?? 0,
  };
};

/**
 * Loads the ready leads of a search as the contact list of a new campaign,
 * leaving out addresses another campaign of the organization already holds.
 * @param options The call options.
 * @param options.leadSearchId The lead search to start from.
 * @param options.organizationId The organization the search must belong to.
 * @returns The leads laid out as a parsed CSV, or null when there are none.
 */
export const loadLeadSearchCsv = async (options: {
  leadSearchId: string;
  organizationId: string;
}) => {
  const search = await db.query.leadSearchSchema.findFirst({
    where: and(
      eq(leadSearchSchema.id, options.leadSearchId),
      eq(leadSearchSchema.organizationId, options.organizationId),
    ),
  });

  if (!search) {
    return null;
  }

  const leads = await db
    .select()
    .from(leadSchema)
    .where(
      and(
        eq(leadSchema.leadSearchId, search.id),
        eq(leadSchema.status, 'ready'),
        // Nobody is written to twice, whichever search found them first
        notExists(
          db
            .select({ id: contactSchema.id })
            .from(contactSchema)
            .innerJoin(campaignSchema, eq(campaignSchema.id, contactSchema.campaignId))
            .where(
              and(
                eq(campaignSchema.organizationId, options.organizationId),
                eq(contactSchema.email, leadSchema.email),
              ),
            ),
        ),
        // Whoever asked to stop is never written to again
        notExists(
          db
            .select({ id: emailSuppressionSchema.id })
            .from(emailSuppressionSchema)
            .where(
              and(
                eq(emailSuppressionSchema.organizationId, options.organizationId),
                eq(emailSuppressionSchema.email, sql`lower(${leadSchema.email})`),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(leadSchema.company));

  return leads.length > 0 ? toLeadCsv({ search, leads }) : null;
};

/**
 * Creates a campaign with its contacts and queues their research or writing.
 * Contacts already researched as leads skip straight to writing.
 * @param options The call options.
 * @param options.userId The user creating the campaign, billed for its runs.
 * @param options.organizationId The organization the campaign belongs to.
 * @param options.campaign The validated campaign settings and contacts.
 * @returns The created campaign.
 */
export const createCampaign = async (options: {
  userId: string;
  organizationId: string;
  campaign: CampaignInput;
}) => {
  const { contacts, ...settings } = options.campaign;

  // Only assets of the same organization may be attached
  const ownedAssetIds =
    settings.knowledgeAssetIds.length > 0
      ? await db
          .select({ id: knowledgeAssetSchema.id })
          .from(knowledgeAssetSchema)
          .where(
            and(
              eq(knowledgeAssetSchema.organizationId, options.organizationId),
              inArray(knowledgeAssetSchema.id, settings.knowledgeAssetIds),
            ),
          )
      : [];

  // One row per address: a duplicated lead would just burn an enrichment run
  const uniqueContacts = [
    ...new Map(contacts.map((contact) => [contact.email.toLowerCase(), contact])).values(),
  ];

  // Leads found on the platform were researched already, so they go straight to writing
  const leadResearch = await findResearchedLeads({
    organizationId: options.organizationId,
    emails: uniqueContacts.map((contact) => contact.email.toLowerCase()),
  });

  const isAllReused = uniqueContacts.every((contact) =>
    leadResearch.has(contact.email.toLowerCase()),
  );

  const created = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaignSchema)
      .values({
        userId: options.userId,
        organizationId: options.organizationId,
        name: settings.name,
        status: isAllReused ? 'writing' : 'enriching',
        processor: settings.processor,
        copywritingModel: settings.copywritingModel,
        copywritingEffort: settings.copywritingEffort,
        copywritingBatch: settings.copywritingBatch,
        emailCount: settings.emailCount,
        delaysDays: settings.delaysDays,
        knowledgeAssetIds: ownedAssetIds.map((asset) => asset.id),
        extraPrompt: settings.extraPrompt,
      })
      .returning();

    if (!campaign) {
      throw new Error('Campaign insert returned no row');
    }

    const insertedContacts = await tx
      .insert(contactSchema)
      .values(
        uniqueContacts.map((contact, rowIndex) => ({
          campaignId: campaign.id,
          rowIndex,
          email: contact.email.toLowerCase(),
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          company: contact.company,
          website: contact.website,
          linkedinUrl: contact.linkedinUrl,
          extra: contact.extra,
          status: leadResearch.has(contact.email.toLowerCase())
            ? ('enriched' as const)
            : ('pending' as const),
        })),
      )
      .returning({ id: contactSchema.id, email: contactSchema.email });

    const now = new Date();

    const reusedEnrichments = insertedContacts.flatMap((contact) => {
      const research = leadResearch.get(contact.email);

      return research
        ? [
            {
              contactId: contact.id,
              parallelRunId: research.parallelRunId,
              processor: research.processor,
              content: research.content,
              basis: [],
              personFound: research.content.person_found,
              identityConfidence: research.content.identity_match_confidence,
              identityReasoning: research.content.identity_match_reasoning,
              startedAt: now,
              completedAt: now,
            },
          ]
        : [];
    });

    // Not recorded as spend: the run was billed to the lead search
    if (reusedEnrichments.length > 0) {
      await tx.insert(enrichmentSchema).values(reusedEnrichments);
    }

    return { campaign, contacts: insertedContacts };
  });

  await enqueue(
    created.contacts
      .filter((contact) => !leadResearch.has(contact.email))
      .map((contact) => ({
        campaignId: created.campaign.id,
        contactId: contact.id,
        type: 'enrich' as const,
      })),
  );

  await enqueueWriting({
    campaign: created.campaign,
    contactIds: created.contacts
      .filter((contact) => leadResearch.has(contact.email))
      .map((contact) => contact.id),
  });

  logger.info(
    `Campaign ${created.campaign.id} queued with ${created.contacts.length} contacts, ${leadResearch.size} reusing lead research`,
  );

  return created.campaign;
};

/**
 * Loads the campaigns of an organization with everything their export needs.
 * @param options The call options.
 * @param options.organizationId The organization the campaigns must belong to.
 * @param options.campaignId The one campaign to load, or every campaign when omitted.
 * @param options.archived Whether to load only archived or only active
 * campaigns, or both when omitted.
 * @returns The campaigns newest first, their contacts in that order, and the
 * contacts' research and email drafts.
 */
export const loadCampaignExport = async (options: {
  organizationId: string;
  campaignId?: string;
  archived?: boolean;
}) => {
  const archivedFilter = options.archived
    ? isNotNull(campaignSchema.archivedAt)
    : isNull(campaignSchema.archivedAt);

  const campaignFilter = and(
    eq(campaignSchema.organizationId, options.organizationId),
    options.campaignId ? eq(campaignSchema.id, options.campaignId) : undefined,
    options.archived === undefined ? undefined : archivedFilter,
  );

  // Subqueries rather than id lists, which would overflow the bind parameters of a large export
  const contactIds = db
    .select({ id: contactSchema.id })
    .from(contactSchema)
    .innerJoin(campaignSchema, eq(campaignSchema.id, contactSchema.campaignId))
    .where(campaignFilter);

  const [campaigns, contacts, enrichments, drafts] = await Promise.all([
    db
      .select()
      .from(campaignSchema)
      .where(campaignFilter)
      .orderBy(desc(campaignSchema.createdAt), asc(campaignSchema.id)),
    db
      .select(getTableColumns(contactSchema))
      .from(contactSchema)
      .innerJoin(campaignSchema, eq(campaignSchema.id, contactSchema.campaignId))
      .where(campaignFilter)
      .orderBy(
        desc(campaignSchema.createdAt),
        // Keeps the contacts of campaigns created in the same instant apart
        asc(campaignSchema.id),
        asc(contactSchema.rowIndex),
      ),
    db.select().from(enrichmentSchema).where(inArray(enrichmentSchema.contactId, contactIds)),
    db.select().from(emailDraftSchema).where(inArray(emailDraftSchema.contactId, contactIds)),
  ]);

  return { campaigns, contacts, enrichments, drafts };
};
