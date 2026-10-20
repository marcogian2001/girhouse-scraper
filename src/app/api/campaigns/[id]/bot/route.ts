import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { CampaignBotValidation } from '@/validations/CampaignValidation';

// Turns the reply bot on or off for one campaign's leads
export const PATCH = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;
  const parse = CampaignBotValidation.safeParse(await request.json().catch(() => null));

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  // Filtering on the organization keeps other organizations' campaigns out of reach
  const [updated] = await db
    .update(campaignSchema)
    .set({ botManaged: parse.data.botManaged })
    .where(
      and(eq(campaignSchema.id, id), eq(campaignSchema.organizationId, context.organizationId)),
    )
    .returning({ id: campaignSchema.id, botManaged: campaignSchema.botManaged });

  if (!updated) {
    return notFound();
  }

  return NextResponse.json({ campaign: updated });
};
