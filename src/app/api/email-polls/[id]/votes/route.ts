import { NextResponse } from 'next/server';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { castEmailPollVote } from '@/libs/EmailPoll';
import { getClientIp, hashVoter } from '@/utils/Voter';
import { EmailPollVoteValidation } from '@/validations/EmailPollValidation';

// Public: anyone with the poll link votes, told apart by their IP address
export const PUT = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const parse = EmailPollVoteValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const isCast = await castEmailPollVote({
    pollId: id,
    itemId: parse.data.itemId,
    voterHash: hashVoter({ pollId: id, ip: getClientIp(request.headers) }),
    score: parse.data.score,
  });

  if (!isCast) {
    return notFound();
  }

  return NextResponse.json({ score: parse.data.score });
};
