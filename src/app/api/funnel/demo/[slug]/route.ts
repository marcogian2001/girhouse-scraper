import { NextResponse } from 'next/server';
import { notFound, unauthorized } from '@/libs/ApiAuth';
import { Env } from '@/libs/Env';
import { isFunnelCaller } from '@/libs/FunnelAuth';
import { getFunnelDemoStatus } from '@/libs/FunnelDemos';

export const GET = async (request: Request, props: { params: Promise<{ slug: string }> }) => {
  if (!isFunnelCaller(request, Env.FUNNEL_SECRET)) {
    return unauthorized();
  }

  const { slug } = await props.params;
  const status = await getFunnelDemoStatus(slug);

  return status ? NextResponse.json(status) : notFound();
};
