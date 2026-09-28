import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { knowledgeAssetSchema } from '@/models/Schema';
import { deleteKnowledgeFile as deleteFromAnthropic } from '@/services/Claude';
import { deleteKnowledgeFile as deleteFromOpenAI } from '@/services/OpenAI';
import { KnowledgePromptValidation } from '@/validations/KnowledgeValidation';

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const asset = await db.query.knowledgeAssetSchema.findFirst({
    where: and(
      eq(knowledgeAssetSchema.id, id),
      eq(knowledgeAssetSchema.organizationId, context.organizationId),
    ),
  });

  if (!asset) {
    return notFound();
  }

  if (asset.anthropicFileId) {
    // A file left behind on Anthropic is harmless, so a failure here does not
    // block removing the asset the user asked to delete
    await deleteFromAnthropic(asset.anthropicFileId).catch((error: unknown) => {
      logger.error('Could not delete Anthropic file {fileId}: {error}', {
        fileId: asset.anthropicFileId,
        error: String(error),
      });
    });
  }

  if (asset.openaiFileId) {
    await deleteFromOpenAI(asset.openaiFileId).catch((error: unknown) => {
      logger.error('Could not delete OpenAI file {fileId}: {error}', {
        fileId: asset.openaiFileId,
        error: String(error),
      });
    });
  }

  await db.delete(knowledgeAssetSchema).where(eq(knowledgeAssetSchema.id, asset.id));

  return NextResponse.json({ deleted: asset.id });
};

export const PATCH = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const asset = await db.query.knowledgeAssetSchema.findFirst({
    where: and(
      eq(knowledgeAssetSchema.id, id),
      eq(knowledgeAssetSchema.organizationId, context.organizationId),
    ),
  });

  if (!asset) {
    return notFound();
  }

  // Documents are tied to uploaded file bytes (and Anthropic/OpenAI file IDs);
  // only pasted prompts can be edited in place
  if (asset.kind !== 'prompt') {
    return NextResponse.json({ error: 'Only prompts can be edited' }, { status: 422 });
  }

  const parse = KnowledgePromptValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const [updated] = await db
    .update(knowledgeAssetSchema)
    .set({ name: parse.data.name, content: parse.data.content })
    .where(eq(knowledgeAssetSchema.id, asset.id))
    .returning();

  return NextResponse.json({ asset: updated });
};
