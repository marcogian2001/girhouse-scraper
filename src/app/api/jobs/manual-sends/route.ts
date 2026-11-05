import { NextResponse } from 'next/server';
import { unauthorized } from '@/libs/ApiAuth';
import { Env } from '@/libs/Env';
import { syncManualReplies } from '@/libs/ManualReplies';

export const maxDuration = 120;

// Vercel Cron calls every few minutes, so an email sent by hand from Instantly with the demo
// starts its follow-ups well before the first one is due
export const GET = async (request: Request) => {
  const isCron =
    Boolean(Env.CRON_SECRET) &&
    request.headers.get('authorization') === `Bearer ${Env.CRON_SECRET}`;

  if (!isCron) {
    return unauthorized();
  }

  return NextResponse.json({ answered: await syncManualReplies() });
};
