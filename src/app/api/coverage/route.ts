import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { coveragePlanSchema, coverageTermSchema } from '@/models/Schema';
import { DEFAULT_COVERAGE_TERMS } from '@/utils/CoverageTerms';
import { CoveragePlanValidation } from '@/validations/CoverageValidation';

export const POST = async () => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  // A new plan starts paused, so nothing is spent before its settings are reviewed
  const id = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(coveragePlanSchema)
      .values({ organizationId: context.organizationId, userId: context.userId })
      .onConflictDoNothing()
      .returning({ id: coveragePlanSchema.id });

    if (plan) {
      await tx
        .insert(coverageTermSchema)
        .values(DEFAULT_COVERAGE_TERMS.map((item) => ({ planId: plan.id, ...item })));
    }

    return plan?.id;
  });

  if (!id) {
    return NextResponse.json({ error: 'Plan already exists' }, { status: 409 });
  }

  return NextResponse.json({ id }, { status: 201 });
};

export const PUT = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = CoveragePlanValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const [plan] = await db
    .update(coveragePlanSchema)
    // The scheduled searches are billed to whoever last set the plan up
    .set({ ...parse.data, userId: context.userId })
    .where(eq(coveragePlanSchema.organizationId, context.organizationId))
    .returning();

  if (!plan) {
    return notFound();
  }

  return NextResponse.json({ plan });
};
