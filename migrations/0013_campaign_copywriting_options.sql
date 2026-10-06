ALTER TYPE "public"."job_type" ADD VALUE 'write_batch' BEFORE 'push';--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "copywriting_effort" text DEFAULT 'high' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "copywriting_batch" boolean DEFAULT false NOT NULL;