import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { runNextActionNow, skipToWhatsapp } from '@/libs/FollowUps';

const NextActionValidation = z.object({ to: z.literal('whatsapp').optional() });

// Test conversations, or real ones in draft mode: runs the next follow-up now instead of in a
// few days, or skips the remaining follow-ups and prepares the WhatsApp hand-off
export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;
  const parse = NextActionValidation.safeParse(await request.json().catch(() => ({})));

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const options = { organizationId: context.organizationId, conversationId: id };
  const queued =
    parse.data.to === 'whatsapp' ? await skipToWhatsapp(options) : await runNextActionNow(options);

  return queued
    ? NextResponse.json({ status: 'queued' })
    : NextResponse.json({ error: 'Nothing due' }, { status: 409 });
};
