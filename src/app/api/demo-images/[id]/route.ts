import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { demoImageSchema } from '@/models/Schema';

// Public: serves a photo a demo page shows, copied because its own link expires
export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const image = await db.query.demoImageSchema.findFirst({ where: eq(demoImageSchema.id, id) });

  if (!image) {
    return notFound();
  }

  // A copy never changes: a rebuild stores new ones under new ids
  return new Response(Buffer.from(image.data, 'base64'), {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
