import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { leadSearchSchema } from '@/models/Schema';

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  // Leads and queued jobs follow the search through their cascading foreign keys
  const [deleted] = await db
    .delete(leadSearchSchema)
    .where(
      and(eq(leadSearchSchema.id, id), eq(leadSearchSchema.organizationId, context.organizationId)),
    )
    .returning({ id: leadSearchSchema.id });

  if (!deleted) {
    return notFound();
  }

  return NextResponse.json({ deleted: deleted.id });
};
