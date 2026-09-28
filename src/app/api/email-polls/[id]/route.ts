import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { emailPollSchema } from '@/models/Schema';
import { EmailPollVisibilityValidation } from '@/validations/EmailPollValidation';

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  // Items and votes follow the poll through their cascading foreign keys
  const [deleted] = await db
    .delete(emailPollSchema)
    .where(
      and(eq(emailPollSchema.id, id), eq(emailPollSchema.organizationId, context.organizationId)),
    )
    .returning({ id: emailPollSchema.id });

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

  const parse = EmailPollVisibilityValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const [updated] = await db
    .update(emailPollSchema)
    .set(parse.data)
    .where(
      and(eq(emailPollSchema.id, id), eq(emailPollSchema.organizationId, context.organizationId)),
    )
    .returning();

  if (!updated) {
    return notFound();
  }

  return NextResponse.json({ poll: updated });
};
