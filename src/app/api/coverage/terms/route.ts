import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { coveragePlanSchema, coverageTermSchema } from '@/models/Schema';
import { toSearchKey } from '@/utils/Leads';
import { CoverageTermValidation } from '@/validations/CoverageValidation';

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = CoverageTermValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const plan = await db.query.coveragePlanSchema.findFirst({
    where: eq(coveragePlanSchema.organizationId, context.organizationId),
  });

  if (!plan) {
    return notFound();
  }

  const [term] = await db
    .insert(coverageTermSchema)
    .values({ planId: plan.id, term: toSearchKey(parse.data.term), tier: parse.data.tier })
    .onConflictDoNothing()
    .returning({ id: coverageTermSchema.id });

  if (!term) {
    return NextResponse.json({ error: 'Term already exists' }, { status: 409 });
  }

  return NextResponse.json({ id: term.id }, { status: 201 });
};
