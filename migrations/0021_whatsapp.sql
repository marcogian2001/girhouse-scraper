CREATE TYPE "public"."whatsapp_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_handoff_status" AS ENUM('draft', 'sent', 'cancelled');--> statement-breakpoint
CREATE TABLE "whatsapp_handoff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"first_message" text NOT NULL,
	"email_summary" text NOT NULL,
	"objections" text NOT NULL,
	"demo_behavior" text NOT NULL,
	"status" "whatsapp_handoff_status" DEFAULT 'draft' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by_user_id" text,
	"sent_at" timestamp,
	"model" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_handoff_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "whatsapp_direction" NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "whatsapp_handoff" ADD CONSTRAINT "whatsapp_handoff_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_handoff" ADD CONSTRAINT "whatsapp_handoff_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_message_conversation_id_idx" ON "whatsapp_message" USING btree ("conversation_id","received_at");