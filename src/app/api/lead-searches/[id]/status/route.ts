import { and, count, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { jobSchema, leadSchema, leadSearchSchema } from '@/models/Schema';

export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const search = await db.query.leadSearchSchema.findFirst({
    where: and(
      eq(leadSearchSchema.id, id),
      eq(leadSearchSchema.organizationId, context.organizationId),
    ),
  });

  if (!search) {
    return notFound();
  }

  const leadCounts = await db
    .select({ status: leadSchema.status, total: count() })
    .from(leadSchema)
    .where(eq(leadSchema.leadSearchId, search.id))
    .groupBy(leadSchema.status);

  const [outstandingJobs] = await db
    .select({ total: count() })
    .from(jobSchema)
    .where(
      and(eq(jobSchema.leadSearchId, search.id), inArray(jobSchema.status, ['queued', 'running'])),
    );

  return NextResponse.json({
    status: search.status,
    errorMessage: search.errorMessage,
    leads: Object.fromEntries(leadCounts.map((row) => [row.status, row.total])),
    // Non-zero while the worker still has something to do for this search
    outstandingJobs: outstandingJobs?.total ?? 0,
  });
};
