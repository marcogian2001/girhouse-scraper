import { NextResponse } from 'next/server';
import { getApiUserId, unauthorized } from '@/libs/ApiAuth';
import { Env } from '@/libs/Env';
import { processJobs } from '@/libs/JobWorker';

/**
 * How many jobs one call drains. Kept small so a single request finishes well
 * inside a serverless time limit, whatever the queue looks like.
 */
const BATCH_SIZE = 5;

export const POST = async (request: Request) => {
  // Two callers: a signed-in user whose campaign page is open, and a scheduler
  // holding the shared secret. Either may advance the shared queue.
  const secret = request.headers.get('x-jobs-secret');
  const isScheduler = Boolean(Env.JOBS_SECRET) && secret === Env.JOBS_SECRET;

  if (!isScheduler && !(await getApiUserId())) {
    return unauthorized();
  }

  return NextResponse.json(await processJobs(BATCH_SIZE));
};
