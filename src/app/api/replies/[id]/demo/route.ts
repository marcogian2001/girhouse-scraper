import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { DemoSlugConflictError, demoUrl, ensureDemo, rebuildDemo } from '@/libs/Demos';
import { conversationSchema } from '@/models/Schema';
import { DemoCreateValidation, DemoRebuildValidation } from '@/validations/DemoValidation';

// Building reads the business's website, Instagram and linked pages, and asks the AI for the texts
export const maxDuration = 120;

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

  if (new URL(request.url).searchParams.get('rebuild') !== '1') {
    const body = await request.text();
    let input: unknown = {};

    if (body) {
      try {
        input = JSON.parse(body);
      } catch {
        return NextResponse.json({ error: 'invalid_body' }, { status: 422 });
      }
    }

    const parse = DemoCreateValidation.safeParse(input);

    if (!parse.success) {
      return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
    }

    try {
      const demo = await ensureDemo(conversation, parse.data.slug);

      return NextResponse.json({ url: demoUrl(demo.slug) }, { status: 201 });
    } catch (error) {
      if (error instanceof DemoSlugConflictError) {
        return NextResponse.json({ error: error.code }, { status: 409 });
      }

      throw error;
    }
  }

  const parse = DemoRebuildValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  // Rebuilding reads the sources again with the new guidance and rewrites the texts
  const demo = await rebuildDemo(conversation, parse.data.guidance || null);

  return NextResponse.json({ url: demoUrl(demo.slug) }, { status: 201 });
};
