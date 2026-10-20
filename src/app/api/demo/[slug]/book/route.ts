import { NextResponse } from 'next/server';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { bookDemoCall } from '@/libs/DemoBooking';
import { DemoBookingValidation, DemoSlugValidation } from '@/validations/DemoValidation';

const STATUS_CODES = { booked: 201, taken: 409, phone_missing: 422, unavailable: 503 } as const;

// Public: the lead books the call on the last step of the demo
export const POST = async (request: Request, props: { params: Promise<{ slug: string }> }) => {
  const { slug } = await props.params;

  if (!DemoSlugValidation.safeParse(slug).success) {
    return notFound();
  }

  const parse = DemoBookingValidation.safeParse(await request.json().catch(() => null));

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const outcome = await bookDemoCall({ slug, ...parse.data });

  if (outcome.status === 'not_found') {
    return notFound();
  }

  return NextResponse.json(outcome, { status: STATUS_CODES[outcome.status] });
};
