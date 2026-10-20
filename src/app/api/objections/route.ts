import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { createObjection } from '@/libs/Objections';
import { ObjectionValidation } from '@/validations/AutomationValidation';

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = ObjectionValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const objection = await createObjection({
    organizationId: context.organizationId,
    objection: parse.data,
  });

  return NextResponse.json({ objection }, { status: 201 });
};
