import { NextResponse } from 'next/server';
import { notFound } from '@/libs/ApiAuth';
import { getDemoSlots } from '@/libs/DemoBooking';
import { getDemoPage } from '@/libs/Demos';
import { logger } from '@/libs/Logger';
import { DemoSlugValidation } from '@/validations/DemoValidation';

// Public: the free call times the last step of the demo offers
export const GET = async (_request: Request, props: { params: Promise<{ slug: string }> }) => {
  const { slug } = await props.params;

  if (!DemoSlugValidation.safeParse(slug).success || !(await getDemoPage(slug))) {
    return notFound();
  }

  // GHL failing (e.g. a deleted calendar) is logged, so the lead's "calendar unreachable" has a cause
  const slots = await getDemoSlots().catch((error: unknown) => {
    logger.error('Could not read the demo call slots for {slug}: {error}', {
      slug,
      error: String(error),
    });

    return 'failed' as const;
  });

  if (slots === 'failed') {
    return NextResponse.json({ error: 'Calendar unreachable' }, { status: 502 });
  }

  if (!slots) {
    return NextResponse.json({ error: 'Booking unavailable' }, { status: 503 });
  }

  return NextResponse.json(slots, { headers: { 'Cache-Control': 'private, max-age=60' } });
};
