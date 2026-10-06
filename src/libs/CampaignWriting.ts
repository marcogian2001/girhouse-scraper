import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  campaignSchema,
  contactSchema,
  emailDraftSchema,
  jobSchema,
  knowledgeAssetSchema,
} from '@/models/Schema';
import type { WrittenSequence } from '@/services/EmailPrompt';
import { extractMentionNames } from '@/utils/KnowledgeMentions';
import { db } from './DB';
import { enqueue } from './JobQueue';
import { recordCopywritingUsage } from './Usage';

type Campaign = typeof campaignSchema.$inferSelect;

/**
 * How long a batch campaign waits for more contacts to finish research before
 * submitting, so contacts enriched around the same time share one batch.
 */
const BATCH_COLLECT_SECONDS = 120;

/**
 * Loads the campaign a job belongs to.
 * @param campaignId The campaign to load, when the job carries one.
 * @returns The campaign row.
 * @throws {Error} When the job has no campaign or the campaign no longer exists.
 */
export const requireCampaign = async (campaignId: string | null) => {
  if (!campaignId) {
    throw new Error('Job is missing its campaign');
  }

  const campaign = await db.query.campaignSchema.findFirst({
    where: eq(campaignSchema.id, campaignId),
  });

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} no longer exists`);
  }

  return campaign;
};

/**
 * Derives the campaign status from where its contacts are.
 * Terminal campaign states are left alone: a campaign being pushed is no longer
 * described by its contacts.
 * @param campaignId The campaign to refresh.
 */
export const syncCampaignStatus = async (campaignId: string) => {
  const campaign = await requireCampaign(campaignId);

  if (['pushing', 'pushed', 'failed'].includes(campaign.status)) {
    return;
  }

  const contacts = await db
    .select({ status: contactSchema.status })
    .from(contactSchema)
    .where(eq(contactSchema.campaignId, campaignId));

  const has = (...statuses: (typeof contactSchema.$inferSelect)['status'][]) =>
    contacts.some((contact) => statuses.includes(contact.status));

  let status: Campaign['status'] = 'review';

  if (has('pending', 'enriching')) {
    status = 'enriching';
  } else if (has('enriched', 'writing')) {
    status = 'writing';
  }

  if (status !== campaign.status) {
    await db.update(campaignSchema).set({ status }).where(eq(campaignSchema.id, campaignId));
  }
};

/**
 * Loads the knowledge a campaign writes from: the assets picked in the wizard,
 * plus every document the brief or a picked prompt mentions as `@[name]`.
 * @param campaign The campaign being written.
 * @returns The picked assets followed by the mentioned documents.
 */
export const loadKnowledgeAssets = async (campaign: Campaign) => {
  const selected =
    campaign.knowledgeAssetIds.length > 0
      ? await db
          .select()
          .from(knowledgeAssetSchema)
          .where(inArray(knowledgeAssetSchema.id, campaign.knowledgeAssetIds))
      : [];

  const mentionedNames = extractMentionNames(
    [
      campaign.extraPrompt ?? '',
      ...selected.map((asset) => (asset.kind === 'prompt' ? asset.content : '')),
    ].join('\n'),
  );

  if (mentionedNames.length === 0) {
    return selected;
  }

  // Newest first, so a duplicated name resolves to the latest upload
  const documents = await db
    .select()
    .from(knowledgeAssetSchema)
    .where(
      and(
        eq(knowledgeAssetSchema.organizationId, campaign.organizationId),
        eq(knowledgeAssetSchema.kind, 'document'),
        inArray(knowledgeAssetSchema.name, mentionedNames),
      ),
    )
    .orderBy(desc(knowledgeAssetSchema.createdAt));

  const mentioned = mentionedNames.flatMap((name) => {
    const document = documents.find((candidate) => candidate.name === name);

    return document && !selected.some((asset) => asset.id === document.id) ? [document] : [];
  });

  return [...selected, ...mentioned];
};

/**
 * Records a written sequence's spend and, when it parsed, stores its drafts
 * and marks the contact ready.
 * @param options The save options.
 * @param options.campaign The campaign the sequence was written for.
 * @param options.contactId The contact it was written to.
 * @param options.sequence The provider's result.
 * @returns Whether drafts were stored; false when the output did not parse.
 */
export const saveSequence = async (options: {
  campaign: Campaign;
  contactId: string;
  sequence: WrittenSequence;
}) => {
  // Recorded before the output is checked: an unparsable response is billed too
  await recordCopywritingUsage({
    userId: options.campaign.userId,
    organizationId: options.campaign.organizationId,
    campaignId: options.campaign.id,
    sequence: options.sequence,
  });

  const { emails, model } = options.sequence;

  if (!emails) {
    return false;
  }

  // Upserted so a retry after a partial write refreshes the drafts in place
  await Promise.all(
    emails.map((email) =>
      db
        .insert(emailDraftSchema)
        .values({
          contactId: options.contactId,
          stepIndex: email.step,
          subject: email.subject,
          body: email.body,
          model,
        })
        .onConflictDoUpdate({
          target: [emailDraftSchema.contactId, emailDraftSchema.stepIndex],
          set: { subject: email.subject, body: email.body, model, edited: false },
        }),
    ),
  );

  await db
    .update(contactSchema)
    .set({ status: 'ready' })
    .where(eq(contactSchema.id, options.contactId));

  return true;
};

/**
 * Queues the writing of researched contacts. A direct campaign gets one job
 * per contact; a batch campaign gets a single collecting job, unless one is
 * already waiting to pick these contacts up.
 * @param options The queue options.
 * @param options.campaign The campaign being written.
 * @param options.contactIds The contacts that are ready to write.
 */
export const enqueueWriting = async (options: {
  campaign: Pick<Campaign, 'id' | 'copywritingBatch'>;
  contactIds: string[];
}) => {
  if (options.contactIds.length === 0) {
    return;
  }

  if (!options.campaign.copywritingBatch) {
    await enqueue(
      options.contactIds.map((contactId) => ({
        campaignId: options.campaign.id,
        contactId,
        type: 'write' as const,
      })),
    );

    return;
  }

  // A collecting job has no payload until it claims its contacts
  const collecting = await db.query.jobSchema.findFirst({
    where: and(
      eq(jobSchema.campaignId, options.campaign.id),
      eq(jobSchema.type, 'write_batch'),
      eq(jobSchema.status, 'queued'),
      isNull(jobSchema.payload),
    ),
  });

  if (collecting) {
    return;
  }

  await enqueue([
    {
      campaignId: options.campaign.id,
      type: 'write_batch',
      runAfter: new Date(Date.now() + BATCH_COLLECT_SECONDS * 1000),
    },
  ]);
};
