import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { conversationSchema } from '@/models/Schema';

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  // Replies, emails, demos, WhatsApp hand-offs and the log follow the conversation through
  // their cascading foreign keys, while suppressed addresses stay with it set to null.
  // Queued jobs find nothing left to work on and complete on their own.
  const [deleted] = await db
    .delete(conversationSchema)
    .where(
      and(
        eq(conversationSchema.id, id),
        eq(conversationSchema.organizationId, context.organizationId),
      ),
    )
    .returning({ id: conversationSchema.id });

  if (!deleted) {
    return notFound();
  }

  return NextResponse.json({ deleted: deleted.id });
};
