import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { writeNudge } from '@/libs/OutboundEmails';

// Suggests a new email while the latest one is still unanswered; it stays a draft
export const POST = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const outcome = await writeNudge({ ...context, conversationId: id });

  if (outcome.status === 'not_found') {
    return notFound();
  }

  return outcome.status === 'drafted'
    ? NextResponse.json({ email: outcome.email })
    : NextResponse.json({ status: outcome.status }, { status: 409 });
};
