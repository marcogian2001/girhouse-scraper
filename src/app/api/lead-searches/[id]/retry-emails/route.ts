import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { retryNoEmailLeads } from '@/libs/LeadJobs';
import { leadSearchSchema } from '@/models/Schema';

export const POST = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const search = await db.query.leadSearchSchema.findFirst({
    columns: { id: true },
    where: and(
      eq(leadSearchSchema.id, id),
      eq(leadSearchSchema.organizationId, context.organizationId),
    ),
  });

  if (!search) {
    return notFound();
  }

  return NextResponse.json({ queued: await retryNoEmailLeads(search.id) });
};
