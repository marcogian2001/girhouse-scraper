import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { createCampaign } from '@/libs/Campaigns';
import { db } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
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

  const campaign = await createCampaign({
    userId: context.userId,
    organizationId: context.organizationId,
    campaign: parse.data,
  });

  return NextResponse.json({ id: campaign.id }, { status: 201 });
};
