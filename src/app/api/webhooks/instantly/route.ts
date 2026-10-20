import { NextResponse } from 'next/server';
import * as z from 'zod';
import { unauthorized } from '@/libs/ApiAuth';
import { receiveInstantlyReply } from '@/libs/Conversations';
import { Env } from '@/libs/Env';
import { safeEqual } from '@/utils/Secrets';
import { InstantlyWebhookValidation } from '@/validations/InstantlyWebhookValidation';

export const POST = async (request: Request) => {
  // Instantly signs nothing, so the webhook URL carries the secret; a header works too
  const secret =
    new URL(request.url).searchParams.get('secret') ?? request.headers.get('x-webhook-secret');

  if (
    !Env.INSTANTLY_WEBHOOK_SECRET ||
    !secret ||
    !safeEqual(secret, Env.INSTANTLY_WEBHOOK_SECRET)
  ) {
    return unauthorized();
  }

  const parse = InstantlyWebhookValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  // Answered at once: the reply is processed by the worker, never inside the webhook
  return NextResponse.json(await receiveInstantlyReply(parse.data));
};
