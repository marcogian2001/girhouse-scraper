import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { knowledgeAssetSchema } from '@/models/Schema';
import { deleteKnowledgeFile } from '@/services/Claude';

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
    await deleteKnowledgeFile(asset.anthropicFileId).catch((error: unknown) => {
      logger.error('Could not delete Anthropic file {fileId}: {error}', {
        fileId: asset.anthropicFileId,
        error: String(error),
      });
    });
  }

  await db.delete(knowledgeAssetSchema).where(eq(knowledgeAssetSchema.id, asset.id));

  return NextResponse.json({ deleted: asset.id });
};
