import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { requestDemoVsl } from '@/libs/DemoVsl';
import { conversationSchema, demoSchema } from '@/models/Schema';
import { DemoVersionValidation } from '@/validations/DemoValidation';

// Picks the version the demo link shows; version B is written and voiced in the background
export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const parse = DemoVersionValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const [row] = await db
    .select({ demo: demoSchema })
    .from(demoSchema)
    .innerJoin(conversationSchema, eq(conversationSchema.id, demoSchema.conversationId))
    .where(
      and(
        eq(demoSchema.conversationId, id),
        eq(conversationSchema.organizationId, context.organizationId),
      ),
    );

  if (!row) {
    return notFound();
  }

  const { version, regenerate } = parse.data;

  await db.update(demoSchema).set({ version }).where(eq(demoSchema.id, row.demo.id));

  if (version === 'b' && (regenerate || !row.demo.vsl)) {
    await requestDemoVsl(row.demo.id);
  }

  return NextResponse.json({ version });
};
