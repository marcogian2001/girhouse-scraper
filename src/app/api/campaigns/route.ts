import { and, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { enqueue } from '@/libs/JobQueue';
import { logger } from '@/libs/Logger';
import { campaignSchema, contactSchema, knowledgeAssetSchema } from '@/models/Schema';
import { CampaignValidation } from '@/validations/CampaignValidation';

export const GET = async () => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const campaigns = await db
    .select()
    .from(campaignSchema)
    .where(eq(campaignSchema.organizationId, context.organizationId))
    .orderBy(desc(campaignSchema.createdAt));

  return NextResponse.json({ campaigns });
};

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = CampaignValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const { contacts, ...settings } = parse.data;

  // Only assets of the same organization may be attached
  const ownedAssetIds =
    settings.knowledgeAssetIds.length > 0
      ? await db
          .select({ id: knowledgeAssetSchema.id })
          .from(knowledgeAssetSchema)
          .where(
            and(
              eq(knowledgeAssetSchema.organizationId, context.organizationId),
              inArray(knowledgeAssetSchema.id, settings.knowledgeAssetIds),
            ),
          )
      : [];

  // One row per address: a duplicated lead would just burn an enrichment run
  const uniqueContacts = [
    ...new Map(contacts.map((contact) => [contact.email.toLowerCase(), contact])).values(),
  ];

  const created = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaignSchema)
      .values({
        userId: context.userId,
        organizationId: context.organizationId,
        name: settings.name,
        status: 'enriching',
        processor: settings.processor,
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
        })),
      )
      .returning({ id: contactSchema.id });

    return { campaign, contactIds: insertedContacts.map((contact) => contact.id) };
  });

  await enqueue(
    created.contactIds.map((contactId) => ({
      campaignId: created.campaign.id,
      contactId,
      type: 'enrich' as const,
    })),
  );

  logger.info(
    `Campaign ${created.campaign.id} queued with ${created.contactIds.length} contacts to enrich`,
  );

  return NextResponse.json({ id: created.campaign.id }, { status: 201 });
};
