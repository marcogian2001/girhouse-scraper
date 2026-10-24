import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  apiUsageSchema,
  campaignSchema,
  contactSchema,
  conversationEventSchema,
  conversationSchema,
  demoSchema,
  emailDraftSchema,
  inboundMessageSchema,
  instantlyCampaignStatSchema,
  instantlyLeadSchema,
  leadOutcomeSchema,
  leadSchema,
  memberSchema,
  replyClassificationSchema,
  userSchema,
} from '@/models/Schema';
import type { PlatformFacts } from '@/utils/CampaignTests';
import { buildCampaignTest, mergeLeadFacts, resolveTargeting } from '@/utils/CampaignTests';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import { db } from './DB';

type LeadOutcome = Pick<
  typeof leadOutcomeSchema.$inferSelect,
  'email' | 'callBookedAt' | 'noShowAt' | 'rescheduledAt' | 'wonAt' | 'wonValue'
>;

type InstantlyLead = Pick<
  typeof instantlyLeadSchema.$inferSelect,
  'email' | 'repliedStep' | 'interestStatus'
>;

/**
 * Sums the cost of the matching calls.
 * @param column The cost column.
 * @returns A numeric SQL aggregate, zero when nothing matches.
 */
const sumOf = (column: typeof apiUsageSchema.costMicros) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

/**
 * Groups rows by a key into maps keyed by lead email.
 * @param rows The rows.
 * @param keyOf Reads a row's group.
 * @returns Each group's rows, by email.
 */
const groupByEmail = <Row extends { email: string }>(rows: Row[], keyOf: (row: Row) => string) => {
  const groups = new Map<string, Map<string, Row>>();

  for (const row of rows) {
    const group = groups.get(keyOf(row)) ?? new Map<string, Row>();
    group.set(row.email, row);
    groups.set(keyOf(row), group);
  }

  return groups;
};

/**
 * Reads what most contacts of each campaign share, and how many were approved to send.
 * @param campaignIds The campaigns.
 * @returns The profession, the province or city and the approved count, by campaign.
 */
const loadContactTargeting = async (campaignIds: string[]) => {
  const rows = await db
    .select({
      campaignId: contactSchema.campaignId,
      target: sql<
        string | null
      >`mode() within group (order by nullif(${contactSchema.extra}->>'Profession', ''))`,
      zone: sql<
        string | null
      >`mode() within group (order by coalesce(nullif(${contactSchema.extra}->>'Province', ''), nullif(${contactSchema.extra}->>'City', '')))`,
      approved: sql<number>`count(*) filter (where ${contactSchema.status} = 'approved')::int`,
    })
    .from(contactSchema)
    .where(inArray(contactSchema.campaignId, campaignIds))
    .groupBy(contactSchema.campaignId)
    .$withCache();

  return new Map(rows.map((row) => [row.campaignId, row]));
};

/**
 * Reads the first email each campaign sent to its first approved lead, as an example of
 * how its emails are built.
 * @param campaignIds The campaigns.
 * @returns The subject and body, by campaign.
 */
const loadExampleEmails = async (campaignIds: string[]) => {
  const rows = await db
    .selectDistinctOn([contactSchema.campaignId], {
      campaignId: contactSchema.campaignId,
      subject: emailDraftSchema.subject,
      body: emailDraftSchema.body,
    })
    .from(emailDraftSchema)
    .innerJoin(contactSchema, eq(contactSchema.id, emailDraftSchema.contactId))
    .where(
      and(
        inArray(contactSchema.campaignId, campaignIds),
        eq(contactSchema.status, 'approved'),
        eq(emailDraftSchema.stepIndex, 1),
      ),
    )
    .orderBy(contactSchema.campaignId, asc(contactSchema.rowIndex))
    .$withCache();

  return new Map(rows.map((row) => [row.campaignId, { subject: row.subject, body: row.body }]));
};

/**
 * Reads what happened to the leads who replied on the platform: their categories,
 * whether they saw the whole demo and whether they booked from the platform.
 * @param campaignIds The campaigns.
 * @returns Each campaign's conversations, by lead email.
 */
const loadConversations = async (campaignIds: string[]) => {
  const conversations = await db
    .select({
      id: conversationSchema.id,
      campaignId: conversationSchema.campaignId,
      email: conversationSchema.leadEmail,
      state: conversationSchema.state,
    })
    .from(conversationSchema)
    .where(
      and(
        inArray(conversationSchema.campaignId, campaignIds),
        eq(conversationSchema.isTest, false),
      ),
    )
    .$withCache();

  const ids = conversations.map((conversation) => conversation.id);

  if (ids.length === 0) {
    return new Map<string, Map<string, PlatformFacts & { email: string }>>();
  }

  const [classifications, demos, bookings] = await Promise.all([
    db
      .select({
        conversationId: inboundMessageSchema.conversationId,
        category: replyClassificationSchema.category,
      })
      .from(replyClassificationSchema)
      .innerJoin(
        inboundMessageSchema,
        eq(inboundMessageSchema.id, replyClassificationSchema.inboundMessageId),
      )
      .where(inArray(inboundMessageSchema.conversationId, ids))
      .$withCache(),
    db
      .select({ conversationId: demoSchema.conversationId })
      .from(demoSchema)
      .where(and(inArray(demoSchema.conversationId, ids), isNotNull(demoSchema.completedAt)))
      .$withCache(),
    db
      .selectDistinct({ conversationId: conversationEventSchema.conversationId })
      .from(conversationEventSchema)
      .where(
        and(
          inArray(conversationEventSchema.conversationId, ids),
          inArray(conversationEventSchema.type, ['call_booked', 'ghl_appointment_booked']),
        ),
      )
      .$withCache(),
  ]);

  const completed = new Set(demos.map((demo) => demo.conversationId));
  const booked = new Set(bookings.map((booking) => booking.conversationId));

  const facts = conversations.map((conversation) => ({
    campaignId: conversation.campaignId ?? '',
    email: conversation.email.toLowerCase(),
    categories: classifications
      .filter((row) => row.conversationId === conversation.id)
      .map((row): ReplyCategory => row.category),
    demoCompleted: completed.has(conversation.id),
    booked: booked.has(conversation.id) || conversation.state === 'call_booked',
  }));

  return groupByEmail(facts, (fact) => fact.campaignId);
};

/**
 * Reads the calls, no shows and sales GHL reported for the campaigns' leads.
 * @param options The lookup.
 * @param options.organizationId The organization.
 * @param options.campaignIds The campaigns.
 * @returns Each campaign's outcomes, by lead email.
 */
const loadOutcomes = async (options: { organizationId: string; campaignIds: string[] }) => {
  const rows = await db
    .select({
      campaignId: contactSchema.campaignId,
      email: leadOutcomeSchema.email,
      callBookedAt: leadOutcomeSchema.callBookedAt,
      noShowAt: leadOutcomeSchema.noShowAt,
      rescheduledAt: leadOutcomeSchema.rescheduledAt,
      wonAt: leadOutcomeSchema.wonAt,
      wonValue: leadOutcomeSchema.wonValue,
    })
    .from(leadOutcomeSchema)
    .innerJoin(contactSchema, eq(sql`lower(${contactSchema.email})`, leadOutcomeSchema.email))
    .where(
      and(
        eq(leadOutcomeSchema.organizationId, options.organizationId),
        inArray(contactSchema.campaignId, options.campaignIds),
      ),
    )
    .$withCache();

  return groupByEmail<LeadOutcome & { campaignId: string }>(rows, (row) => row.campaignId);
};

/**
 * Reads the copy of Instantly: each campaign's totals and the leads who replied.
 * @param instantlyCampaignIds The Instantly campaigns.
 * @returns The totals by Instantly campaign, and its replied leads by email.
 */
const loadInstantly = async (instantlyCampaignIds: string[]) => {
  const [stats, leads] = await Promise.all([
    db
      .select()
      .from(instantlyCampaignStatSchema)
      .where(inArray(instantlyCampaignStatSchema.instantlyCampaignId, instantlyCampaignIds))
      .$withCache(),
    db
      .select({
        instantlyCampaignId: instantlyLeadSchema.instantlyCampaignId,
        email: instantlyLeadSchema.email,
        repliedStep: instantlyLeadSchema.repliedStep,
        interestStatus: instantlyLeadSchema.interestStatus,
      })
      .from(instantlyLeadSchema)
      .where(inArray(instantlyLeadSchema.instantlyCampaignId, instantlyCampaignIds))
      .$withCache(),
  ]);

  return {
    stats: new Map(stats.map((stat) => [stat.instantlyCampaignId, stat])),
    leads: groupByEmail<InstantlyLead & { instantlyCampaignId: string }>(
      leads,
      (lead) => lead.instantlyCampaignId,
    ),
  };
};

/**
 * Works out what each campaign cost: the AI and research it ran itself, plus its share
 * of the lead searches its leads came from, each search split evenly over the leads it
 * found an email for.
 * @param options The lookup.
 * @param options.organizationId The organization.
 * @param options.campaignIds The campaigns.
 * @returns The campaign's own spend and its leads' cost, by campaign.
 */
const loadCosts = async (options: { organizationId: string; campaignIds: string[] }) => {
  const [campaignSpend, searchSpend, searchLeads, campaignLeads] = await Promise.all([
    db
      .select({
        campaignId: apiUsageSchema.campaignId,
        costMicros: sumOf(apiUsageSchema.costMicros),
      })
      .from(apiUsageSchema)
      .where(inArray(apiUsageSchema.campaignId, options.campaignIds))
      .groupBy(apiUsageSchema.campaignId)
      .$withCache(),
    db
      .select({
        leadSearchId: apiUsageSchema.leadSearchId,
        costMicros: sumOf(apiUsageSchema.costMicros),
      })
      .from(apiUsageSchema)
      .where(
        and(
          eq(apiUsageSchema.organizationId, options.organizationId),
          isNotNull(apiUsageSchema.leadSearchId),
        ),
      )
      .groupBy(apiUsageSchema.leadSearchId)
      .$withCache(),
    db
      .select({ leadSearchId: leadSchema.leadSearchId, leads: sql<number>`count(*)::int` })
      .from(leadSchema)
      .where(
        and(eq(leadSchema.organizationId, options.organizationId), isNotNull(leadSchema.email)),
      )
      .groupBy(leadSchema.leadSearchId)
      .$withCache(),
    db
      .select({
        campaignId: contactSchema.campaignId,
        leadSearchId: leadSchema.leadSearchId,
        contacts: sql<number>`count(*)::int`,
      })
      .from(contactSchema)
      .innerJoin(
        leadSchema,
        and(
          eq(leadSchema.organizationId, options.organizationId),
          eq(sql`lower(${leadSchema.email})`, sql`lower(${contactSchema.email})`),
        ),
      )
      .where(inArray(contactSchema.campaignId, options.campaignIds))
      .groupBy(contactSchema.campaignId, leadSchema.leadSearchId)
      .$withCache(),
  ]);

  const searchCost = new Map(searchSpend.map((row) => [row.leadSearchId, row.costMicros]));
  const searchSize = new Map(searchLeads.map((row) => [row.leadSearchId, row.leads]));
  const costs = new Map(
    options.campaignIds.map((campaignId) => [
      campaignId,
      {
        ownMicros: campaignSpend.find((row) => row.campaignId === campaignId)?.costMicros ?? 0,
        leadsMicros: 0,
      },
    ]),
  );

  for (const row of campaignLeads) {
    const cost = costs.get(row.campaignId);
    const size = searchSize.get(row.leadSearchId) ?? 0;

    if (cost && size > 0) {
      cost.leadsMicros += Math.round(
        ((searchCost.get(row.leadSearchId) ?? 0) * row.contacts) / size,
      );
    }
  }

  return costs;
};

/**
 * Reads the addresses of the organization's own people, whose test replies to a
 * campaign must not count as leads.
 * @param organizationId The organization.
 * @returns The members' emails, lower-cased.
 */
const loadTeamEmails = async (organizationId: string) => {
  const rows = await db
    .select({ email: userSchema.email })
    .from(memberSchema)
    .innerJoin(userSchema, eq(userSchema.id, memberSchema.userId))
    .where(eq(memberSchema.organizationId, organizationId))
    .$withCache();

  return new Set(rows.map((row) => row.email.toLowerCase()));
};

/**
 * Builds the test record of every campaign sent through Instantly, newest first:
 * who and where it targets, an example of its emails, how its leads went from the
 * reply to the sale and what it cost. Replies and labels come from the copy of
 * Instantly, so campaigns sent before the platform read replies count too. Replies
 * from the organization's own people are left out. Archived campaigns stay, since they
 * are past tests.
 * @param options The report.
 * @param options.organizationId The organization.
 * @param options.campaignId A single campaign, for its own page.
 * @returns One row per campaign.
 */
export const getCampaignTests = async (options: {
  organizationId: string;
  campaignId?: string;
}) => {
  const { organizationId } = options;
  const campaigns = await db
    .select()
    .from(campaignSchema)
    .where(
      and(
        eq(campaignSchema.organizationId, organizationId),
        isNotNull(campaignSchema.instantlyCampaignId),
        options.campaignId ? eq(campaignSchema.id, options.campaignId) : undefined,
      ),
    )
    .orderBy(desc(campaignSchema.createdAt))
    .$withCache();

  if (campaigns.length === 0) {
    return [];
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const instantlyIds = campaigns.flatMap((campaign) =>
    campaign.instantlyCampaignId ? [campaign.instantlyCampaignId] : [],
  );
  const [targeting, examples, conversations, outcomes, instantly, costs, team] = await Promise.all([
    loadContactTargeting(campaignIds),
    loadExampleEmails(campaignIds),
    loadConversations(campaignIds),
    loadOutcomes({ organizationId, campaignIds }),
    loadInstantly(instantlyIds),
    loadCosts({ organizationId, campaignIds }),
    loadTeamEmails(organizationId),
  ]);

  return campaigns.map((campaign) => {
    const instantlyId = campaign.instantlyCampaignId ?? '';
    const contacts = targeting.get(campaign.id);
    const stat = instantly.stats.get(instantlyId);
    const cost = costs.get(campaign.id) ?? { ownMicros: 0, leadsMicros: 0 };
    const sources = {
      platform: conversations.get(campaign.id) ?? new Map<string, PlatformFacts>(),
      instantly: instantly.leads.get(instantlyId) ?? new Map<string, InstantlyLead>(),
      outcome: outcomes.get(campaign.id) ?? new Map<string, LeadOutcome>(),
    };
    const emails = new Set(
      [...sources.platform.keys(), ...sources.instantly.keys(), ...sources.outcome.keys()].filter(
        (email) => !team.has(email),
      ),
    );
    // Instantly's reply total includes the team's own test replies, so they come off it
    const teamReplies = [...sources.instantly.values()].filter(
      (lead) => team.has(lead.email) && lead.interestStatus !== 0,
    ).length;
    const leads = [...emails].map((email) => {
      const outcome = sources.outcome.get(email);

      return mergeLeadFacts({
        platform: sources.platform.get(email) ?? null,
        instantly: sources.instantly.get(email) ?? null,
        outcome: outcome
          ? {
              callBooked: outcome.callBookedAt !== null,
              noShow: outcome.noShowAt !== null,
              rescheduled: outcome.rescheduledAt !== null,
              won: outcome.wonAt !== null,
              wonValue: outcome.wonValue,
            }
          : null,
      });
    });
    const targetingSources = {
      name: campaign.name,
      contactTarget: contacts?.target ?? null,
      contactZone: contacts?.zone ?? null,
    };

    return {
      id: campaign.id,
      name: campaign.name,
      createdAt: campaign.createdAt,
      botManaged: campaign.botManaged,
      hypothesis: campaign.hypothesis,
      exampleEmail: examples.get(campaign.id) ?? null,
      ...resolveTargeting({ ...targetingSources, target: campaign.target, zone: campaign.zone }),
      manualTarget: campaign.target,
      manualZone: campaign.zone,
      auto: resolveTargeting({ ...targetingSources, target: null, zone: null }),
      // Before the first copy of Instantly, the approved contacts are the best guess
      isContactedEstimate: !stat,
      bounced: stat?.bounced ?? null,
      ...buildCampaignTest({
        contacted: stat?.contacted ?? contacts?.approved ?? 0,
        replied: stat ? Math.max(stat.replied - teamReplies, 0) : null,
        leads,
        costMicros: cost.ownMicros + cost.leadsMicros,
      }),
    };
  });
};
