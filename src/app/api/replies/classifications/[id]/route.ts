import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { overrideClassification } from '@/libs/Conversations';
import { ClassificationOverrideValidation } from '@/validations/AutomationValidation';

export const PATCH = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const parse = ClassificationOverrideValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const classification = await overrideClassification({
    ...context,
    classificationId: id,
    category: parse.data.category,
  });

  if (!classification) {
    return notFound();
  }

  return NextResponse.json({ classification });
};
