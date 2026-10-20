import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { CampaignBotValidation } from '@/validations/CampaignValidation';

// Hands one or more campaigns' leads to the reply bot, or back to the sales reps
export const PATCH = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = CampaignBotValidation.safeParse(await request.json().catch(() => null));

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  // Filtering on the organization keeps other organizations' campaigns out of reach
  const updated = await db
    .update(campaignSchema)
    .set({ botManaged: parse.data.botManaged })
    .where(
      and(
        inArray(campaignSchema.id, parse.data.campaignIds),
        eq(campaignSchema.organizationId, context.organizationId),
      ),
    )
    .returning({ id: campaignSchema.id });

  return NextResponse.json({ campaignIds: updated.map((campaign) => campaign.id) });
};
