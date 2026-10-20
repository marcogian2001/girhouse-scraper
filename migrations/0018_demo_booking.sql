ALTER TYPE "public"."demo_event_type" ADD VALUE 'booked';--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "ghl_contact_id" text;--> statement-breakpoint
ALTER TABLE "demo" ADD COLUMN "booked_at" timestamp;