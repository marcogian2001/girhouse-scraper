import { and, count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { enqueue } from '@/libs/JobQueue';
import { campaignSchema, contactSchema } from '@/models/Schema';
import { InstantlyPushValidation } from '@/validations/InstantlyPushValidation';

export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
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

  const parse = InstantlyPushValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const [approved] = await db
    .select({ total: count() })
    .from(contactSchema)
    .where(and(eq(contactSchema.campaignId, campaign.id), eq(contactSchema.status, 'approved')));

  if (!approved?.total) {
    return NextResponse.json({ error: 'No approved contacts' }, { status: 409 });
  }

  await db
    .update(campaignSchema)
    .set({ status: 'pushing', errorMessage: null })
    .where(eq(campaignSchema.id, campaign.id));

  await enqueue([{ campaignId: campaign.id, type: 'push', payload: parse.data }]);

  return NextResponse.json({ queued: approved.total });
};
