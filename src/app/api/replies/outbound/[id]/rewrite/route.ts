import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { rewriteOutbound } from '@/libs/OutboundEmails';
import { OutboundRewriteValidation } from '@/validations/AutomationValidation';

// Writes a draft answer again with the current instructions; it stays a draft
export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const parse = OutboundRewriteValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const email = await rewriteOutbound({ ...context, outboundEmailId: id, ...parse.data });

  return email
    ? NextResponse.json({ email })
    : NextResponse.json({ error: 'Not a draft answer that can be rewritten' }, { status: 409 });
};
