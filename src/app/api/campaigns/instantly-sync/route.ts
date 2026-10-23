import { NextResponse } from 'next/server';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { syncInstantlyStats } from '@/libs/InstantlySync';

export const POST = async () => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  return NextResponse.json(await syncInstantlyStats());
};
