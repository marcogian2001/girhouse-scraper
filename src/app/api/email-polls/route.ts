import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { createEmailPoll } from '@/libs/EmailPoll';
import { EmailPollValidation } from '@/validations/EmailPollValidation';

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = EmailPollValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const poll = await createEmailPoll({ ...context, ...parse.data });

  // A campaign from another organization, or none with written sequences
  if (!poll) {
    return notFound();
  }

  return NextResponse.json({ poll }, { status: 201 });
};
