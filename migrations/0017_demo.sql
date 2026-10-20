CREATE TYPE "public"."demo_event_type" AS ENUM('open', 'step', 'heartbeat', 'whatsapp_click', 'phone_submitted');--> statement-breakpoint
CREATE TABLE "demo_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demo_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"type" "demo_event_type" NOT NULL,
	"step" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"lead_id" uuid,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"first_opened_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "demo_conversation_id_unique" UNIQUE("conversation_id"),
	CONSTRAINT "demo_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "demo_event" ADD CONSTRAINT "demo_event_demo_id_demo_id_fk" FOREIGN KEY ("demo_id") REFERENCES "public"."demo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo" ADD CONSTRAINT "demo_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo" ADD CONSTRAINT "demo_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo" ADD CONSTRAINT "demo_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_event_demo_id_created_at_idx" ON "demo_event" USING btree ("demo_id","created_at");--> statement-breakpoint
CREATE INDEX "demo_organization_id_idx" ON "demo" USING btree ("organization_id");