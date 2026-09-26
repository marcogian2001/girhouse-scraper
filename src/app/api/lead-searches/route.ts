import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { enqueue } from '@/libs/JobQueue';
import { logger } from '@/libs/Logger';
import { leadSearchSchema } from '@/models/Schema';
import { LeadSearchValidation } from '@/validations/LeadSearchValidation';

export const GET = async () => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const searches = await db
    .select()
    .from(leadSearchSchema)
    .where(eq(leadSearchSchema.organizationId, context.organizationId))
    .orderBy(desc(leadSearchSchema.createdAt));

  return NextResponse.json({ searches });
};

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = LeadSearchValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
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

  logger.info(`Lead search ${search.id} queued for up to ${search.maxResults} places`);

  return NextResponse.json({ id: search.id }, { status: 201 });
};
