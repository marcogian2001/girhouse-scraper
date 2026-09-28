import { NextResponse } from 'next/server';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { Env } from '@/libs/Env';
import { processJobs } from '@/libs/JobWorker';

/**
 * How many jobs one call drains. Kept small so a single request finishes well
 * inside a serverless time limit, whatever the queue looks like.
 */
const BATCH_SIZE = 5;

/** The cron stops taking new batches past this point, so its call ends inside `maxDuration`. */
const CRON_BUDGET_MS = 50_000;

export const maxDuration = 120;

export const POST = async (request: Request) => {
  // Two callers: a signed-in user whose campaign page is open, and a scheduler
  // holding the shared secret. Either may advance the shared queue.
  const secret = request.headers.get('x-jobs-secret');
  const isScheduler = Boolean(Env.JOBS_SECRET) && secret === Env.JOBS_SECRET;

  if (!isScheduler && !(await getApiContext())) {
    return unauthorized();
  }

  return NextResponse.json(await processJobs(BATCH_SIZE));
};

// Vercel Cron calls every minute and drains the queue for about a minute, so work
// moves on with no page open
export const GET = async (request: Request) => {
  const isCron =
    Boolean(Env.CRON_SECRET) &&
    request.headers.get('authorization') === `Bearer ${Env.CRON_SECRET}`;

  if (!isCron) {
    return unauthorized();
  }

  const deadline = Date.now() + CRON_BUDGET_MS;
  const totals = { processed: 0, failed: 0 };

  // Sequential on purpose: each batch claims what the previous one left due
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop
    const batch = await processJobs(BATCH_SIZE);

    totals.processed += batch.processed;
    totals.failed += batch.failed;

    if (batch.processed === 0) {
      break;
    }
  }

  return NextResponse.json(totals);
};
