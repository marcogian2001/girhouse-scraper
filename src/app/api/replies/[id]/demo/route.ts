import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { demoUrl, ensureDemo, rebuildDemo } from '@/libs/Demos';
import { conversationSchema } from '@/models/Schema';

// Building reads the business website and asks the AI for the texts
export const maxDuration = 60;

export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const conversation = await db.query.conversationSchema.findFirst({
    where: and(
      eq(conversationSchema.id, id),
      eq(conversationSchema.organizationId, context.organizationId),
    ),
  });

  if (!conversation) {
    return notFound();
  }

  // Rebuilding reads the sources again and rewrites the texts, keeping the link
  const demo =
    new URL(request.url).searchParams.get('rebuild') === '1'
      ? await rebuildDemo(conversation)
      : await ensureDemo(conversation);

  return NextResponse.json({ url: demoUrl(demo.slug) }, { status: 201 });
};
