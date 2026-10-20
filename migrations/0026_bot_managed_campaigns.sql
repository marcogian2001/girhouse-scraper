ALTER TYPE "public"."job_type" ADD VALUE 'ghl_bot_assign';--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bot_managed" boolean DEFAULT false NOT NULL;