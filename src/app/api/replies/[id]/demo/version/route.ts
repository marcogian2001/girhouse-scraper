import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { requestDemoVsl } from '@/libs/DemoVsl';
import { conversationSchema, demoSchema } from '@/models/Schema';

// Writes, voices and illustrates the video again in the background
export const POST = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  if (!z.uuid().safeParse(id).success) {
    return notFound();
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

  await db.update(demoSchema).set({ version: 'c' }).where(eq(demoSchema.id, row.demo.id));
  await requestDemoVsl(row.demo.id);

  return NextResponse.json({ status: 'queued' });
};
