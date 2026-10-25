import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { enqueue } from '@/libs/JobQueue';
import { createRegionalSearch, isShownSearch } from '@/libs/LeadSearches';
import { logger } from '@/libs/Logger';
import { leadSearchSchema } from '@/models/Schema';
import { NewLeadSearchValidation } from '@/validations/LeadSearchValidation';

export const GET = async () => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const searches = await db
    .select()
    .from(leadSearchSchema)
    .where(isShownSearch(context.organizationId))
    .orderBy(desc(leadSearchSchema.createdAt));

  return NextResponse.json({ searches });
};

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = NewLeadSearchValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  if ('regions' in parse.data) {
    const parent = await createRegionalSearch({
      search: parse.data,
      userId: context.userId,
      organizationId: context.organizationId,
    });

    logger.info(
      `Lead search ${parent.id} queued for ${parent.maxResults} leads across ${parse.data.regions.length} regions`,
    );

    return NextResponse.json({ id: parent.id }, { status: 201 });
  }

  const [search] = await db
    .insert(leadSearchSchema)
    .values({
      ...parse.data,
      userId: context.userId,
      organizationId: context.organizationId,
    })
    .returning();

  if (!search) {
    throw new Error('Lead search insert returned no row');
  }

  await enqueue([{ leadSearchId: search.id, type: 'lead_search' }]);

  logger.info(`Lead search ${search.id} queued for ${search.maxResults} leads with an email`);

  return NextResponse.json({ id: search.id }, { status: 201 });
};
