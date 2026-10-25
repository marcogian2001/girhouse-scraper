import { and, count, eq, inArray, notInArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { familyStatus, inSearchFamily, loadRegionalSearches } from '@/libs/LeadSearches';
import { jobSchema, leadSchema, leadSearchSchema } from '@/models/Schema';
import { RESERVE_LEAD_STATUSES } from '@/utils/Leads';

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

  const [regional, leadCounts, [outstandingJobs]] = await Promise.all([
    loadRegionalSearches(search.id),
    db
      .select({ status: leadSchema.status, total: count() })
      .from(leadSchema)
      .where(
        and(
          inSearchFamily(leadSchema.leadSearchId, search.id),
          notInArray(leadSchema.status, [...RESERVE_LEAD_STATUSES]),
        ),
      )
      .groupBy(leadSchema.status),
    db
      .select({ total: count() })
      .from(jobSchema)
      .where(
        and(
          inSearchFamily(jobSchema.leadSearchId, search.id),
          inArray(jobSchema.status, ['queued', 'running']),
        ),
      ),
  ]);

  return NextResponse.json({
    status: familyStatus(
      search.status,
      regional.map((region) => region.status),
    ),
    errorMessage: search.errorMessage,
    leads: Object.fromEntries(leadCounts.map((row) => [row.status, row.total])),
    // How many leads with a deliverable email the search wants
    target: search.maxResults,
    // Non-zero while the worker still has something to do for this search
    outstandingJobs: outstandingJobs?.total ?? 0,
  });
};
