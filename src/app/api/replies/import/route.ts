import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { importInstantlyReplies } from '@/libs/Conversations';
import { ReplyImportValidation } from '@/validations/AutomationValidation';

// Reads every page of the mailbox's replies from Instantly
export const maxDuration = 60;

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = ReplyImportValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  return NextResponse.json(await importInstantlyReplies({ ...context, ...parse.data }));
};
