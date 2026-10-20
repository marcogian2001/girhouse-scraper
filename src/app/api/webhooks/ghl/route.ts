import { NextResponse } from 'next/server';
import * as z from 'zod';
import { unauthorized } from '@/libs/ApiAuth';
import { Env } from '@/libs/Env';
import { receiveGhlEvent } from '@/libs/GhlEvents';
import { safeEqual } from '@/utils/Secrets';
import { GhlWebhookValidation } from '@/validations/GhlWebhookValidation';

export const POST = async (request: Request) => {
  // A GHL workflow's Webhook action signs nothing, so the URL carries the secret; a header works too
  const secret =
    new URL(request.url).searchParams.get('secret') ?? request.headers.get('x-webhook-secret');

  if (!Env.GHL_WEBHOOK_SECRET || !secret || !safeEqual(secret, Env.GHL_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  const parse = GhlWebhookValidation.safeParse(await request.json().catch(() => null));

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  return NextResponse.json(await receiveGhlEvent(parse.data));
};
