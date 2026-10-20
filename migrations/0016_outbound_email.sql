CREATE TYPE "public"."outbound_kind" AS ENUM('reply', 'follow_up', 'nurturing', 'closing');--> statement-breakpoint
CREATE TYPE "public"."outbound_status" AS ENUM('draft', 'scheduled', 'sent', 'cancelled', 'failed');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'reply_write';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'reply_send';--> statement-breakpoint
CREATE TABLE "outbound_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inbound_message_id" uuid,
	"kind" "outbound_kind" NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "outbound_status" DEFAULT 'draft' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"instantly_email_id" text,
	"approved_by_user_id" text,
	"model" text,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_email_inbound_message_id_unique" UNIQUE("inbound_message_id")
);
--> statement-breakpoint
ALTER TABLE "inbound_message" ADD COLUMN "thread" jsonb;--> statement-breakpoint
ALTER TABLE "outbound_email" ADD CONSTRAINT "outbound_email_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_email" ADD CONSTRAINT "outbound_email_inbound_message_id_inbound_message_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."inbound_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_email" ADD CONSTRAINT "outbound_email_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_email_conversation_id_idx" ON "outbound_email" USING btree ("conversation_id");