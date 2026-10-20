import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { getConversationStatus } from '@/libs/Conversations';

export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const status = await getConversationStatus({
    organizationId: context.organizationId,
    conversationId: id,
  });

  if (!status) {
    return notFound();
  }

  return NextResponse.json(status);
};
