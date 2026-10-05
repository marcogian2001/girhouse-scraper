import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { coveragePlanSchema, coverageTermSchema } from '@/models/Schema';
import { CoverageTermUpdateValidation } from '@/validations/CoverageValidation';

/**
 * Matches a term of the organization's plan.
 * @param options The call options.
 * @param options.id The term id.
 * @param options.organizationId The organization of the signed-in user.
 * @returns The where clause over coverage terms.
 */
const isOwnTerm = (options: { id: string; organizationId: string }) =>
  and(
    eq(coverageTermSchema.id, options.id),
    inArray(
      coverageTermSchema.planId,
      db
        .select({ id: coveragePlanSchema.id })
        .from(coveragePlanSchema)
        .where(eq(coveragePlanSchema.organizationId, options.organizationId)),
    ),
  );

export const PATCH = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = CoverageTermUpdateValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const { id } = await props.params;
  const [term] = await db
    .update(coverageTermSchema)
    .set(parse.data)
    .where(isOwnTerm({ id, organizationId: context.organizationId }))
    .returning();

  if (!term) {
    return notFound();
  }

  return NextResponse.json({ term });
};

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  // The term's search areas stay, so adding it back resumes where it stopped
  const [term] = await db
    .delete(coverageTermSchema)
    .where(isOwnTerm({ id, organizationId: context.organizationId }))
    .returning({ id: coverageTermSchema.id });

  if (!term) {
    return notFound();
  }

  return NextResponse.json({ deleted: term.id });
};
