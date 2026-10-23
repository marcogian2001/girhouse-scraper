import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { jobSchema } from '@/models/Schema';
import {
  campaignSchema,
  contactSchema,
  conversationEventSchema,
  conversationSchema,
  demoSchema,
  emailDraftSchema,
  inboundMessageSchema,
  leadOutcomeSchema,
  replyClassificationSchema,
} from '@/models/Schema';
import { getCampaignAnalytics } from '@/services/Instantly';
import { analyzePrompt } from '@/services/PromptAnalyzer';
import type { LeadFacts } from '@/utils/CampaignTests';
import { buildCampaignTest, resolveTargeting } from '@/utils/CampaignTests';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import { getAutomationSettings } from './AutomationSettings';
import { loadKnowledgeAssets, requireCampaign } from './CampaignWriting';
import { db } from './DB';
import { completeJob } from './JobQueue';
import { logger } from './Logger';
import { recordCopywritingUsage } from './Usage';

type Job = typeof jobSchema.$inferSelect;

type LeadOutcome = Pick<
  typeof leadOutcomeSchema.$inferSelect,
  'email' | 'callBookedAt' | 'wonAt' | 'wonValue'
>;

type ConversationFacts = Awaited<ReturnType<typeof loadConversationFacts>>[number];

/** How many leads' sequences the analysis reads next to the prompt. */
const SAMPLE_SEQUENCES = 2;

/**
 * Reads a sample of the sequences a campaign wrote: its approved leads first, since
 * those are the emails that went out.
 * @param campaignId The campaign.
 * @returns Up to `SAMPLE_SEQUENCES` sequences, each ordered by step.
 */
const loadSampleSequences = async (campaignId: string) => {
  const contacts = await db
    .select({ id: contactSchema.id })
    .from(contactSchema)
    .where(
      and(
        eq(contactSchema.campaignId, campaignId),
        inArray(contactSchema.status, ['approved', 'ready']),
      ),
    )
    .orderBy(asc(contactSchema.status), asc(contactSchema.rowIndex))
    .limit(SAMPLE_SEQUENCES);

  if (contacts.length === 0) {
    return [];
  }

  const drafts = await db
    .select()
    .from(emailDraftSchema)
    .where(
      inArray(
        emailDraftSchema.contactId,
        contacts.map((contact) => contact.id),
      ),
    )
    .orderBy(asc(emailDraftSchema.stepIndex));

  return contacts.map((contact) =>
    drafts
      .filter((draft) => draft.contactId === contact.id)
      .map((draft) => ({ step: draft.stepIndex, subject: draft.subject, body: draft.body })),
  );
};

/**
 * Has the AI sum up the structure of a campaign's emails, from the prompts it was
 * written with and a sample of what it wrote, and stores it on the campaign.
 * @param campaignId The campaign.
 * @returns The stored analysis.
 * @throws {Error} When the campaign is gone or the answer does not parse.
 */
export const analyzeCampaign = async (campaignId: string) => {
  const campaign = await requireCampaign(campaignId);
  const [settings, assets, samples] = await Promise.all([
    getAutomationSettings(campaign.organizationId),
    loadKnowledgeAssets(campaign),
    loadSampleSequences(campaign.id),
  ]);

  const analyzed = await analyzePrompt({
    model: settings.classificationModel,
    prompts: [
      ...assets.flatMap((asset) =>
        asset.kind === 'prompt' && asset.content ? [asset.content] : [],
      ),
      campaign.extraPrompt ?? '',
    ].filter((prompt) => prompt.trim()),
    documentNames: assets.filter((asset) => asset.kind === 'document').map((asset) => asset.name),
    samples,
  });

  // Recorded before the output is checked: an unparsable response is billed too
  await recordCopywritingUsage({
    userId: campaign.userId,
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    sequence: analyzed.call,
  });

  if (!analyzed.output) {
    throw new Error(`The analysis of campaign ${campaign.id} did not parse`);
  }

  const promptAnalysis = {
    summary: analyzed.output.sintesi.trim(),
    points: analyzed.output.punti.map((point) => point.trim()).filter(Boolean),
    model: analyzed.call.model,
    analyzedAt: new Date().toISOString(),
  };

  await db.update(campaignSchema).set({ promptAnalysis }).where(eq(campaignSchema.id, campaign.id));

  return promptAnalysis;
};

/**
 * Runs the analysis queued when a campaign is pushed.
 * @param job The analysis job.
 * @throws {Error} When the job carries no campaign.
 */
const runCampaignAnalysisJob = async (job: Job) => {
  if (!job.campaignId) {
    throw new Error('Job is missing its campaign');
  }

  await analyzeCampaign(job.campaignId);
  await completeJob(job.id);
};

export const campaignTestJobHandlers = {
  campaign_analysis: runCampaignAnalysisJob,
};

/**
 * Logs an analysis that ran out of attempts: the campaign is fine, and the analysis
 * can be run again from the dashboard.
 * @param job The abandoned job.
 * @param message The last error.
 */
export const markCampaignAnalysisAbandoned = (job: Job, message: string) => {
  logger.warn('The analysis of campaign {campaignId} was abandoned: {error}', {
    campaignId: job.campaignId,
    error: message,
  });
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
    .groupBy(contactSchema.campaignId);

  return new Map(rows.map((row) => [row.campaignId, row]));
};

/**
 * Reads what happened to the leads who replied to the campaigns: their categories,
 * whether they saw the whole demo and whether they booked from the platform.
 * @param campaignIds The campaigns.
 * @returns One entry per real conversation.
 */
const loadConversationFacts = async (campaignIds: string[]) => {
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
    );

  const ids = conversations.map((conversation) => conversation.id);

  if (ids.length === 0) {
    return [];
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
      .where(inArray(inboundMessageSchema.conversationId, ids)),
    db
      .select({ conversationId: demoSchema.conversationId })
      .from(demoSchema)
      .where(and(inArray(demoSchema.conversationId, ids), isNotNull(demoSchema.completedAt))),
    db
      .selectDistinct({ conversationId: conversationEventSchema.conversationId })
      .from(conversationEventSchema)
      .where(
        and(
          inArray(conversationEventSchema.conversationId, ids),
          inArray(conversationEventSchema.type, ['call_booked', 'ghl_appointment_booked']),
        ),
      ),
  ]);

  const completed = new Set(demos.map((demo) => demo.conversationId));
  const booked = new Set(bookings.map((booking) => booking.conversationId));

  return conversations.map((conversation) => ({
    campaignId: conversation.campaignId,
    email: conversation.email.toLowerCase(),
    categories: classifications
      .filter((row) => row.conversationId === conversation.id)
      .map((row): ReplyCategory => row.category),
    demoCompleted: completed.has(conversation.id),
    booked: booked.has(conversation.id) || conversation.state === 'call_booked',
  }));
};

/**
 * Reads the calls and sales GHL reported for the campaigns' leads, by campaign.
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
    );

  const byCampaign = new Map<string, Map<string, LeadOutcome>>();

  for (const row of rows) {
    const outcomes = byCampaign.get(row.campaignId) ?? new Map<string, LeadOutcome>();
    outcomes.set(row.email, row);
    byCampaign.set(row.campaignId, outcomes);
  }

  return byCampaign;
};

/**
 * Reads how many leads each Instantly campaign emailed. A failure leaves the counts
 * out rather than the whole report.
 * @returns The totals by Instantly campaign id, or null when Instantly did not answer.
 */
const loadSendingTotals = async () =>
  await getCampaignAnalytics().catch((error: unknown) => {
    logger.warn('Instantly campaign analytics failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  });

/**
 * Joins what happened to a campaign's leads by email: their replies on the platform and
 * what GHL reported, including leads who never replied by email, booked by a setter or
 * on WhatsApp.
 * @param options The campaign's facts.
 * @param options.conversations The campaign's conversations.
 * @param options.outcomes The campaign's GHL outcomes, by lead email.
 * @returns One entry per lead something happened to.
 */
const collectLeads = (options: {
  conversations: ConversationFacts[];
  outcomes: Map<string, LeadOutcome>;
}) => {
  const leads = new Map<string, LeadFacts>();

  for (const conversation of options.conversations) {
    const outcome = options.outcomes.get(conversation.email);

    leads.set(conversation.email, {
      categories: conversation.categories,
      demoCompleted: conversation.demoCompleted,
      booked: conversation.booked || Boolean(outcome?.callBookedAt),
      won: Boolean(outcome?.wonAt),
      wonValue: outcome?.wonValue ?? 0,
    });
  }

  for (const [email, outcome] of options.outcomes) {
    if (!leads.has(email)) {
      leads.set(email, {
        categories: null,
        demoCompleted: false,
        booked: Boolean(outcome.callBookedAt),
        won: Boolean(outcome.wonAt),
        wonValue: outcome.wonValue ?? 0,
      });
    }
  }

  return [...leads.values()];
};

/**
 * Builds the test record of every campaign sent through Instantly, newest first:
 * who and where it targets, how its emails are built, and how its leads went from the
 * reply to the sale. Archived campaigns stay, since they are past tests.
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
    .orderBy(desc(campaignSchema.createdAt));

  if (campaigns.length === 0) {
    return [];
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [targeting, conversations, outcomes, totals] = await Promise.all([
    loadContactTargeting(campaignIds),
    loadConversationFacts(campaignIds),
    loadOutcomes({ organizationId, campaignIds }),
    loadSendingTotals(),
  ]);

  return campaigns.map((campaign) => {
    const contacts = targeting.get(campaign.id);
    const sending = campaign.instantlyCampaignId ? totals?.get(campaign.instantlyCampaignId) : null;
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
      promptAnalysis: campaign.promptAnalysis,
      ...resolveTargeting({ ...targetingSources, target: campaign.target, zone: campaign.zone }),
      manualTarget: campaign.target,
      manualZone: campaign.zone,
      auto: resolveTargeting({ ...targetingSources, target: null, zone: null }),
      // Before Instantly reports, the approved contacts are the best guess
      isContactedEstimate: !sending,
      bounced: sending?.bounced ?? null,
      ...buildCampaignTest({
        contacted: sending?.contacted ?? contacts?.approved ?? 0,
        leads: collectLeads({
          conversations: conversations.filter(
            (conversation) => conversation.campaignId === campaign.id,
          ),
          outcomes: outcomes.get(campaign.id) ?? new Map<string, LeadOutcome>(),
        }),
      }),
    };
  });
};
