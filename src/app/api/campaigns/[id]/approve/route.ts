import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema, contactSchema } from '@/models/Schema';

export const POST = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const campaign = await db.query.campaignSchema.findFirst({
    where: and(
      eq(campaignSchema.id, id),
      eq(campaignSchema.organizationId, context.organizationId),
    ),
  });

  if (!campaign) {
    return notFound();
  }

  const approved = await db
    .update(contactSchema)
    .set({ status: 'approved' })
    .where(and(eq(contactSchema.campaignId, campaign.id), eq(contactSchema.status, 'ready')))
    .returning({ id: contactSchema.id });

  return NextResponse.json({ approved: approved.length });
};
