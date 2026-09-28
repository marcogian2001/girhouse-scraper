import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { CampaignNameValidation } from '@/validations/CampaignValidation';

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  // Contacts, drafts and queued jobs follow the campaign through their cascading
  // foreign keys, while recorded spend stays with its campaign set to null
  const [deleted] = await db
    .delete(campaignSchema)
    .where(
      and(eq(campaignSchema.id, id), eq(campaignSchema.organizationId, context.organizationId)),
    )
    .returning({ id: campaignSchema.id });

  if (!deleted) {
    return notFound();
  }

  return NextResponse.json({ deleted: deleted.id });
};

export const PATCH = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const parse = CampaignNameValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  // Filtering on the organization keeps other organizations' campaigns out of reach
  const [updated] = await db
    .update(campaignSchema)
    .set({ name: parse.data.name })
    .where(
      and(eq(campaignSchema.id, id), eq(campaignSchema.organizationId, context.organizationId)),
    )
    .returning();

  if (!updated) {
    return notFound();
  }

  return NextResponse.json({ campaign: updated });
};
