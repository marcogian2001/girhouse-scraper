import { and, count, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema, contactSchema, jobSchema } from '@/models/Schema';

export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
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

  const [contactCounts, [outstandingJobs]] = await Promise.all([
    db
      .select({ status: contactSchema.status, total: count() })
      .from(contactSchema)
      .where(eq(contactSchema.campaignId, campaign.id))
      .groupBy(contactSchema.status),
    db
      .select({ total: count() })
      .from(jobSchema)
      .where(
        and(
          eq(jobSchema.campaignId, campaign.id),
          inArray(jobSchema.status, ['queued', 'running']),
        ),
      ),
  ]);

  return NextResponse.json({
    status: campaign.status,
    errorMessage: campaign.errorMessage,
    instantlyCampaignId: campaign.instantlyCampaignId,
    contacts: Object.fromEntries(contactCounts.map((row) => [row.status, row.total])),
    // Non-zero while the worker still has something to do for this campaign
    outstandingJobs: outstandingJobs?.total ?? 0,
  });
};
