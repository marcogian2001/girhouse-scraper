import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { runNextActionNow } from '@/libs/FollowUps';

// Test conversations only: runs the next follow-up now instead of in a few days
export const POST = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const queued = await runNextActionNow({
    organizationId: context.organizationId,
    conversationId: id,
  });

  return queued
    ? NextResponse.json({ status: 'queued' })
    : NextResponse.json({ error: 'Nothing due' }, { status: 409 });
};
