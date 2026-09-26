import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema, contactSchema, emailDraftSchema } from '@/models/Schema';
import { EmailDraftValidation } from '@/validations/EmailDraftValidation';

export const PATCH = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  // The owning organization lives two joins up, on the campaign
  const [owned] = await db
    .select({ id: emailDraftSchema.id })
    .from(emailDraftSchema)
    .innerJoin(contactSchema, eq(contactSchema.id, emailDraftSchema.contactId))
    .innerJoin(campaignSchema, eq(campaignSchema.id, contactSchema.campaignId))
    .where(
      and(eq(emailDraftSchema.id, id), eq(campaignSchema.organizationId, context.organizationId)),
    )
    .limit(1);

  if (!owned) {
    return notFound();
  }

  const parse = EmailDraftValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const [updated] = await db
    .update(emailDraftSchema)
    .set({ subject: parse.data.subject, body: parse.data.body, edited: true })
    .where(eq(emailDraftSchema.id, id))
    .returning();

  return NextResponse.json({ draft: updated });
};
