ALTER TYPE "public"."outbound_kind" ADD VALUE 'booking_confirmation';--> statement-breakpoint
ALTER TABLE "outbound_email" ADD COLUMN "offered_slots" jsonb DEFAULT '[]'::jsonb NOT NULL;