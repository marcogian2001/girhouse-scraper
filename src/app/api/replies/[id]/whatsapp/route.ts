import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { approveWhatsapp, discardWhatsapp } from '@/libs/WhatsappHandoff';

const ApproveValidation = z.object({ message: z.string().trim().min(1).max(1000) });

const STATUS_CODES = {
  sent: 200,
  not_found: 404,
  disabled: 409,
  blocked: 422,
  failed: 502,
} as const;

// Approves the drafted WhatsApp hand-off, as edited, and sends it to GHL
export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;
  const parse = ApproveValidation.safeParse(await request.json().catch(() => null));

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const outcome = await approveWhatsapp({
    organizationId: context.organizationId,
    userId: context.userId,
    conversationId: id,
    message: parse.data.message,
  });

  return NextResponse.json(outcome, { status: STATUS_CODES[outcome.status] });
};

// Drops the drafted hand-off and closes the conversation
export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const discarded = await discardWhatsapp({
    organizationId: context.organizationId,
    userId: context.userId,
    conversationId: id,
  });

  return discarded ? NextResponse.json({ status: 'cancelled' }) : notFound();
};
