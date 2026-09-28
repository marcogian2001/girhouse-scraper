import { and, asc, countDistinct, desc, eq, inArray } from 'drizzle-orm';
import {
  campaignSchema,
  contactSchema,
  emailDraftSchema,
  emailPollItemSchema,
  emailPollSchema,
  emailPollVoteSchema,
} from '@/models/Schema';
import { buildBallot, scoreStats, summarizeByModel } from '@/utils/EmailPoll';
import { db } from './DB';
import { getUsageTotals } from './Usage';

/**
 * Names a contact for voters, preferring the company the emails are pitched to.
 * @param contact The contact the sequence was written for.
 * @returns The company, else the full name, else the email.
 */
const contactLabel = (contact: typeof contactSchema.$inferSelect) => {
  if (contact.company) {
    return contact.company;
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');

  return fullName === '' ? contact.email : fullName;
};

/**
 * Copies the sequences of a campaign's first written contacts into poll items.
 * @param options The load options.
 * @param options.campaign The campaign to take sequences from.
 * @param options.organizationId The organization the campaign belongs to.
 * @param options.limit How many contacts to take, by CSV row order.
 * @returns The items, without their poll id.
 */
const loadCampaignItems = async (options: {
  campaign: { id: string; copywritingModel: string };
  organizationId: string;
  limit: number;
}) => {
  const written = await db
    .select()
    .from(contactSchema)
    .where(
      and(
        eq(contactSchema.campaignId, options.campaign.id),
        inArray(
          contactSchema.id,
          db.selectDistinct({ id: emailDraftSchema.contactId }).from(emailDraftSchema),
        ),
      ),
    )
    .orderBy(asc(contactSchema.rowIndex));

  const contacts = written.slice(0, options.limit);

  if (contacts.length === 0) {
    return [];
  }

  const [drafts, usage] = await Promise.all([
    db
      .select()
      .from(emailDraftSchema)
      .where(
        inArray(
          emailDraftSchema.contactId,
          contacts.map((contact) => contact.id),
        ),
      )
      .orderBy(asc(emailDraftSchema.stepIndex)),
    getUsageTotals({ organizationId: options.organizationId, campaignId: options.campaign.id }),
  ]);

  // Spend is recorded per campaign, so each sequence gets an even share of it
  const costMicros = Math.round(usage.copywritingCostMicros / written.length);

  return contacts.map((contact) => ({
    campaignId: options.campaign.id,
    groupKey: contact.email.toLowerCase(),
    groupLabel: contactLabel(contact),
    model: options.campaign.copywritingModel,
    costMicros,
    emails: drafts
      .filter((draft) => draft.contactId === contact.id)
      .map((draft) => ({ stepIndex: draft.stepIndex, subject: draft.subject, body: draft.body })),
  }));
};

/**
 * Creates a poll from the first written contacts of each campaign.
 * @param options The poll options.
 * @param options.organizationId The organization creating the poll.
 * @param options.userId The user creating the poll.
 * @param options.name The poll name, shown to voters.
 * @param options.campaignIds The campaigns to compare, one model each.
 * @param options.contactsPerCampaign How many contacts to take from each campaign.
 * @returns The poll, or null when a campaign is out of reach or nothing was written.
 */
export const createEmailPoll = async (options: {
  organizationId: string;
  userId: string;
  name: string;
  campaignIds: string[];
  contactsPerCampaign: number;
}) => {
  const campaigns = await db
    .select({ id: campaignSchema.id, copywritingModel: campaignSchema.copywritingModel })
    .from(campaignSchema)
    .where(
      and(
        inArray(campaignSchema.id, options.campaignIds),
        eq(campaignSchema.organizationId, options.organizationId),
      ),
    );

  if (campaigns.length !== new Set(options.campaignIds).size) {
    return null;
  }

  const itemsByCampaign = await Promise.all(
    campaigns.map(
      async (campaign) =>
        await loadCampaignItems({
          campaign,
          organizationId: options.organizationId,
          limit: options.contactsPerCampaign,
        }),
    ),
  );
  const items = itemsByCampaign.flat();

  if (items.length === 0) {
    return null;
  }

  return await db.transaction(async (tx) => {
    const [poll] = await tx
      .insert(emailPollSchema)
      .values({
        organizationId: options.organizationId,
        userId: options.userId,
        name: options.name,
      })
      .returning();

    if (!poll) {
      return null;
    }

    await tx
      .insert(emailPollItemSchema)
      .values(items.map((item) => ({ ...item, pollId: poll.id })));

    return poll;
  });
};

/**
 * Lists an organization's polls with how far voting has got.
 * @param organizationId The organization whose polls to list.
 * @returns The polls, newest first.
 */
export const listEmailPolls = async (organizationId: string) =>
  await db
    .select({
      id: emailPollSchema.id,
      name: emailPollSchema.name,
      createdAt: emailPollSchema.createdAt,
      // Distinct counts, since each item row repeats once per vote
      sequences: countDistinct(emailPollItemSchema.id),
      voters: countDistinct(emailPollVoteSchema.voterHash),
    })
    .from(emailPollSchema)
    .leftJoin(emailPollItemSchema, eq(emailPollItemSchema.pollId, emailPollSchema.id))
    .leftJoin(emailPollVoteSchema, eq(emailPollVoteSchema.itemId, emailPollItemSchema.id))
    .where(eq(emailPollSchema.organizationId, organizationId))
    .groupBy(emailPollSchema.id)
    .orderBy(desc(emailPollSchema.createdAt));

/**
 * Reads the items of a poll in a stable order, so seeded shuffles repeat.
 * @param pollId The poll to read.
 * @returns The items grouped by recipient.
 */
const getPollItems = async (pollId: string) =>
  await db
    .select()
    .from(emailPollItemSchema)
    .where(eq(emailPollItemSchema.pollId, pollId))
    .orderBy(asc(emailPollItemSchema.groupKey), asc(emailPollItemSchema.id));

/**
 * Loads what one anonymous voter may see of a poll.
 * @param options The ballot options.
 * @param options.pollId The poll from the shared link.
 * @param options.voterHash The voter's hash.
 * @returns The poll name and ballot, or null when the poll does not exist.
 */
export const getEmailPollBallot = async (options: { pollId: string; voterHash: string }) => {
  const poll = await db.query.emailPollSchema.findFirst({
    where: eq(emailPollSchema.id, options.pollId),
  });

  if (!poll) {
    return null;
  }

  const [items, votes] = await Promise.all([
    getPollItems(poll.id),
    db
      .select({ itemId: emailPollVoteSchema.itemId, score: emailPollVoteSchema.score })
      .from(emailPollVoteSchema)
      .where(
        and(
          eq(emailPollVoteSchema.pollId, poll.id),
          eq(emailPollVoteSchema.voterHash, options.voterHash),
        ),
      ),
  ]);

  return {
    name: poll.name,
    groups: buildBallot({
      poll,
      items,
      scores: new Map(votes.map((vote) => [vote.itemId, vote.score])),
      voterHash: options.voterHash,
    }),
  };
};

/**
 * Records a voter's score, replacing the one they gave before.
 * @param options The vote options.
 * @param options.pollId The poll from the shared link.
 * @param options.itemId The sequence being scored.
 * @param options.voterHash The voter's hash.
 * @param options.score The score, from 1 to 10.
 * @returns Whether the sequence belongs to the poll.
 */
export const castEmailPollVote = async (options: {
  pollId: string;
  itemId: string;
  voterHash: string;
  score: number;
}) => {
  const item = await db.query.emailPollItemSchema.findFirst({
    where: and(
      eq(emailPollItemSchema.id, options.itemId),
      eq(emailPollItemSchema.pollId, options.pollId),
    ),
  });

  if (!item) {
    return false;
  }

  await db
    .insert(emailPollVoteSchema)
    .values(options)
    .onConflictDoUpdate({
      target: [emailPollVoteSchema.itemId, emailPollVoteSchema.voterHash],
      set: { score: options.score, updatedAt: new Date() },
    });

  return true;
};

/**
 * Loads a poll's results for its organization, with every model revealed.
 * @param options The results options.
 * @param options.pollId The poll to report on.
 * @param options.organizationId The organization the poll must belong to.
 * @returns The poll, per-model and per-sequence stats, or null when out of reach.
 */
export const getEmailPollResults = async (options: { pollId: string; organizationId: string }) => {
  const poll = await db.query.emailPollSchema.findFirst({
    where: and(
      eq(emailPollSchema.id, options.pollId),
      eq(emailPollSchema.organizationId, options.organizationId),
    ),
  });

  if (!poll) {
    return null;
  }

  const [items, votes, campaigns] = await Promise.all([
    getPollItems(poll.id),
    db
      .select({
        itemId: emailPollVoteSchema.itemId,
        score: emailPollVoteSchema.score,
        voterHash: emailPollVoteSchema.voterHash,
      })
      .from(emailPollVoteSchema)
      .where(eq(emailPollVoteSchema.pollId, poll.id)),
    db
      .select({ id: campaignSchema.id, name: campaignSchema.name })
      .from(campaignSchema)
      .innerJoin(emailPollItemSchema, eq(emailPollItemSchema.campaignId, campaignSchema.id))
      .where(eq(emailPollItemSchema.pollId, poll.id)),
  ]);

  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));

  return {
    poll,
    voters: new Set(votes.map((vote) => vote.voterHash)).size,
    models: summarizeByModel({ items, votes }),
    items: items.map((item) => ({
      id: item.id,
      groupLabel: item.groupLabel,
      model: item.model,
      campaignName: item.campaignId ? (campaignNames.get(item.campaignId) ?? null) : null,
      ...scoreStats(votes.filter((vote) => vote.itemId === item.id).map((vote) => vote.score)),
    })),
  };
};
