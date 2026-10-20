import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { simulateReply } from '@/libs/Conversations';
import { ReplySimulationValidation } from '@/validations/AutomationValidation';

export const POST = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = ReplySimulationValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const conversationId = await simulateReply({ ...context, ...parse.data });

  return NextResponse.json({ conversationId }, { status: 201 });
};
