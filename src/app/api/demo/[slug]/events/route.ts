import { NextResponse } from 'next/server';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { recordDemoEvent } from '@/libs/Demos';
import { DemoEventValidation, DemoSlugValidation } from '@/validations/DemoValidation';

// Public: the demo page reports what the lead does, through `navigator.sendBeacon`
export const POST = async (request: Request, props: { params: Promise<{ slug: string }> }) => {
  const { slug } = await props.params;

  if (!DemoSlugValidation.safeParse(slug).success) {
    return notFound();
  }

  const parse = DemoEventValidation.safeParse(await request.json().catch(() => null));

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const recorded = await recordDemoEvent({ slug, ...parse.data });

  return recorded ? new NextResponse(null, { status: 204 }) : notFound();
};
