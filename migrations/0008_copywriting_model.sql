ALTER TYPE "public"."usage_provider" ADD VALUE 'openai' BEFORE 'parallel';--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "copywriting_model" text DEFAULT 'claude-opus-5' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_asset" ADD COLUMN "openai_file_id" text;