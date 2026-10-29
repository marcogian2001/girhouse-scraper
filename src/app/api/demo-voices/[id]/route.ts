import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { demoVoiceSchema } from '@/models/Schema';

// Public: serves Gigi saying one line of a demo's version B
export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const voice = await db.query.demoVoiceSchema.findFirst({ where: eq(demoVoiceSchema.id, id) });

  if (!voice) {
    return notFound();
  }

  // A voice never changes: voicing again stores new ones under new ids
  return new Response(Buffer.from(voice.data, 'base64'), {
    headers: {
      'Content-Type': voice.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
