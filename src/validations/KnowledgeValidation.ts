import * as z from 'zod';

/** Anthropic accepts far larger files; this keeps a stray upload from stalling a request. */
export const MAX_KNOWLEDGE_FILE_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
] as const;

export const KnowledgePromptValidation = z.object({
  name: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(100_000),
});
