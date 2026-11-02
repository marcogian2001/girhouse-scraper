import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { markDemoVideoChecked, requestDemoVsl } from '@/libs/DemoVsl';
import { conversationSchema, demoSchema } from '@/models/Schema';
import { DemoVideoActionValidation } from '@/validations/DemoValidation';

// Writes and voices the video again in the background, or records that a person checked it
export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
  }

  const parse = DemoVideoActionValidation.safeParse(await request.json());

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

  const { action } = parse.data;

  if (action === 'check') {
    await markDemoVideoChecked(row.demo.id);
  } else {
    await db.update(demoSchema).set({ version: 'c' }).where(eq(demoSchema.id, row.demo.id));
    await requestDemoVsl(row.demo.id);
  }

  return NextResponse.json({ action });
};
