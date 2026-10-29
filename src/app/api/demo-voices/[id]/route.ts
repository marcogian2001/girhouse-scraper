import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { demoVoiceSchema } from '@/models/Schema';
import { parseByteRange } from '@/utils/ByteRange';

// Public: serves Gigi saying one line of a demo's version B
export const GET = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const voice = await db.query.demoVoiceSchema.findFirst({ where: eq(demoVoiceSchema.id, id) });

  if (!voice) {
    return notFound();
  }

  const file = Buffer.from(voice.data, 'base64');
  // A voice never changes: voicing again stores new ones under new ids
  const headers = {
    'Content-Type': voice.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
  };
  // Safari asks for audio in byte ranges and plays nothing from a server that ignores them
  const range = parseByteRange(request.headers.get('range'), file.length);

  if (!range) {
    return new Response(file, { headers });
  }

  return new Response(file.subarray(range.start, range.end + 1), {
    status: 206,
    headers: {
      ...headers,
      'Content-Range': `bytes ${range.start}-${range.end}/${file.length}`,
    },
  });
};
