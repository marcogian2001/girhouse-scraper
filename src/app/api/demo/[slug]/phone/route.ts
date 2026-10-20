import { NextResponse } from 'next/server';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { saveDemoPhone } from '@/libs/Demos';
import { DemoPhoneValidation, DemoSlugValidation } from '@/validations/DemoValidation';

// Public: the lead leaves their WhatsApp number on the last step of the demo
export const POST = async (request: Request, props: { params: Promise<{ slug: string }> }) => {
  const { slug } = await props.params;

  if (!DemoSlugValidation.safeParse(slug).success) {
    return notFound();
  }

  const parse = DemoPhoneValidation.safeParse(await request.json().catch(() => null));

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const outcome = await saveDemoPhone({ slug, ...parse.data });

  if (outcome === 'not_found') {
    return notFound();
  }

  return NextResponse.json({ status: outcome }, { status: outcome === 'saved' ? 200 : 422 });
};
