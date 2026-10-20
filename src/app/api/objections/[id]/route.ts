import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { deleteObjection, updateObjection } from '@/libs/Objections';
import { ObjectionValidation } from '@/validations/AutomationValidation';

export const PATCH = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const parse = ObjectionValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const objection = await updateObjection({
    organizationId: context.organizationId,
    objectionId: id,
    objection: parse.data,
  });

  if (!objection) {
    return notFound();
  }

  return NextResponse.json({ objection });
};

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const deleted = await deleteObjection({
    organizationId: context.organizationId,
    objectionId: id,
  });

  if (!deleted) {
    return notFound();
  }

  return NextResponse.json({ deleted });
};
