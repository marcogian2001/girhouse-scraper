ALTER TYPE "public"."lead_email_source" ADD VALUE 'website';--> statement-breakpoint
ALTER TYPE "public"."lead_email_source" ADD VALUE 'guessed';--> statement-breakpoint
ALTER TYPE "public"."usage_provider" ADD VALUE 'reoon';--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "email_attempts" jsonb;