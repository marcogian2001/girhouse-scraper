import { NextResponse } from 'next/server';
import * as z from 'zod';
import { unauthorized } from '@/libs/ApiAuth';
import { Env } from '@/libs/Env';
import { isFunnelCaller } from '@/libs/FunnelAuth';
import { createFunnelDemo } from '@/libs/FunnelDemos';
import { FunnelDemoValidation } from '@/validations/FunnelDemoValidation';

// The demo is written while the request waits; its video follows in the background
export const maxDuration = 120;

export const POST = async (request: Request) => {
  if (!isFunnelCaller(request, Env.FUNNEL_SECRET)) {
    return unauthorized();
  }

  const parse = FunnelDemoValidation.safeParse(await request.json().catch(() => null));

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  return NextResponse.json(await createFunnelDemo(parse.data), { status: 201 });
};
