import { NextResponse } from 'next/server';
import { unauthorized } from '@/libs/ApiAuth';
import { runCoverageTick } from '@/libs/Coverage';
import { Env } from '@/libs/Env';

/** The tick stops starting new scans past this point, so its call ends inside `maxDuration`. */
const TICK_BUDGET_MS = 90_000;

export const maxDuration = 120;

// Vercel Cron calls every 15 minutes: the first call of the day fills the quota,
// the others go on with the free census
export const GET = async (request: Request) => {
  const isCron =
    Boolean(Env.CRON_SECRET) &&
    request.headers.get('authorization') === `Bearer ${Env.CRON_SECRET}`;

  if (!isCron) {
    return unauthorized();
  }

  return NextResponse.json(await runCoverageTick(Date.now() + TICK_BUDGET_MS));
};
