import { NextResponse } from 'next/server';
import { notFound } from '@/libs/ApiAuth';
import { getDemoSlots } from '@/libs/DemoBooking';
import { getDemoPage } from '@/libs/Demos';
import { DemoSlugValidation } from '@/validations/DemoValidation';

// Public: the free call times the last step of the demo offers
export const GET = async (_request: Request, props: { params: Promise<{ slug: string }> }) => {
  const { slug } = await props.params;

  if (!DemoSlugValidation.safeParse(slug).success || !(await getDemoPage(slug))) {
    return notFound();
  }

  const slots = await getDemoSlots();

  if (!slots) {
    return NextResponse.json({ error: 'Booking unavailable' }, { status: 503 });
  }

  return NextResponse.json(slots, { headers: { 'Cache-Control': 'private, max-age=60' } });
};
