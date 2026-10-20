import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { approveOutbound } from '@/libs/OutboundEmails';
import { OutboundApprovalValidation } from '@/validations/AutomationValidation';

export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const parse = OutboundApprovalValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const outcome = await approveOutbound({ ...context, outboundEmailId: id, ...parse.data });

  if (outcome.status === 'not_found') {
    return notFound();
  }

  if (outcome.status !== 'scheduled') {
    // A draft already handled, the kill switch, or rules the email still breaks
    return NextResponse.json(outcome, { status: 409 });
  }

  return NextResponse.json({ email: outcome.email });
};
