import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiUserId, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { knowledgeAssetSchema } from '@/models/Schema';
import { uploadKnowledgeFile } from '@/services/Claude';
import {
  DOCUMENT_MIME_TYPES,
  KnowledgePromptValidation,
  MAX_KNOWLEDGE_FILE_BYTES,
} from '@/validations/KnowledgeValidation';

const isDocumentMimeType = (mimeType: string): mimeType is (typeof DOCUMENT_MIME_TYPES)[number] =>
  DOCUMENT_MIME_TYPES.some((allowed) => allowed === mimeType);

export const GET = async () => {
  const userId = await getApiUserId();

  if (!userId) {
    return unauthorized();
  }

  const assets = await db
    .select({
      id: knowledgeAssetSchema.id,
      name: knowledgeAssetSchema.name,
      kind: knowledgeAssetSchema.kind,
      mimeType: knowledgeAssetSchema.mimeType,
      sizeBytes: knowledgeAssetSchema.sizeBytes,
      createdAt: knowledgeAssetSchema.createdAt,
    })
    .from(knowledgeAssetSchema)
    .where(eq(knowledgeAssetSchema.userId, userId))
    .orderBy(desc(knowledgeAssetSchema.createdAt));

  return NextResponse.json({ assets });
};

export const POST = async (request: Request) => {
  const userId = await getApiUserId();

  if (!userId) {
    return unauthorized();
  }

  const contentType = request.headers.get('content-type') ?? '';

  // A pasted prompt arrives as JSON, an uploaded document as multipart
  if (contentType.includes('application/json')) {
    const parse = KnowledgePromptValidation.safeParse(await request.json());

    if (!parse.success) {
      return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
    }

    const [asset] = await db
      .insert(knowledgeAssetSchema)
      .values({
        userId,
        name: parse.data.name,
        kind: 'prompt',
        content: parse.data.content,
      })
      .returning({ id: knowledgeAssetSchema.id });

    return NextResponse.json({ id: asset?.id }, { status: 201 });
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 422 });
  }

  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return NextResponse.json({ error: 'File is too large' }, { status: 413 });
  }

  if (!isDocumentMimeType(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });
  }

  // Text is inlined into the cached system prompt; PDFs go to the Files API
  const isPdf = file.type === 'application/pdf';

  const [asset] = await db
    .insert(knowledgeAssetSchema)
    .values({
      userId,
      name: file.name,
      kind: 'document',
      mimeType: file.type,
      sizeBytes: file.size,
      content: isPdf ? null : await file.text(),
      anthropicFileId: isPdf ? await uploadKnowledgeFile(file) : null,
    })
    .returning({ id: knowledgeAssetSchema.id });

  return NextResponse.json({ id: asset?.id }, { status: 201 });
};
