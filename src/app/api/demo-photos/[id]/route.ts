import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { demoPhotoSchema } from '@/models/Schema';

// Public: serves the photo behind one scene of a demo's version B
export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const photo = await db.query.demoPhotoSchema.findFirst({ where: eq(demoPhotoSchema.id, id) });

  if (!photo) {
    return notFound();
  }

  // A photo never changes: making them again stores new ones under new ids
  return new Response(Buffer.from(photo.data, 'base64'), {
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
