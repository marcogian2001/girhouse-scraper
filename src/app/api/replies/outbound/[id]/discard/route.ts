import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { discardOutbound } from '@/libs/OutboundEmails';

export const POST = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const discarded = await discardOutbound({ ...context, outboundEmailId: id });

  if (!discarded) {
    return notFound();
  }

  return NextResponse.json({ discarded: id });
};
