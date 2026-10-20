CREATE TYPE "public"."automation_mode" AS ENUM('draft', 'auto');--> statement-breakpoint
CREATE TYPE "public"."classification_source" AS ENUM('ai', 'stop_guard', 'manual');--> statement-breakpoint
CREATE TYPE "public"."conversation_state" AS ENUM('replied', 'classified', 'demo_sent', 'demo_viewed', 'follow_up', 'whatsapp', 'call_booked', 'nurturing', 'out_of_office', 'paused', 'manual_review', 'closed_not_interested', 'stop', 'wrong_person');--> statement-breakpoint
CREATE TYPE "public"."objection_status" AS ENUM('active', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."reply_category" AS ENUM('interested', 'question', 'objection', 'not_now', 'not_interested', 'stop', 'out_of_office', 'wrong_person', 'other');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'reply_process';--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" "automation_mode" DEFAULT 'draft' NOT NULL,
	"confidence_threshold" real DEFAULT 0.75 NOT NULL,
	"reply_delay_min_minutes" integer DEFAULT 4 NOT NULL,
	"reply_delay_max_minutes" integer DEFAULT 15 NOT NULL,
	"business_hour_start" integer DEFAULT 9 NOT NULL,
	"business_hour_end" integer DEFAULT 18 NOT NULL,
	"monthly_price" integer DEFAULT 97 NOT NULL,
	"new_monthly_price" integer DEFAULT 197 NOT NULL,
	"price_increase_days" integer DEFAULT 15 NOT NULL,
	"onboarding_slots_per_month" integer DEFAULT 10 NOT NULL,
	"demo_not_opened_business_days" integer DEFAULT 2 NOT NULL,
	"max_follow_ups" integer DEFAULT 3 NOT NULL,
	"whatsapp_after_business_days" integer DEFAULT 2 NOT NULL,
	"nurturing_interval_days" integer DEFAULT 30 NOT NULL,
	"nurturing_max_count" integer DEFAULT 3 NOT NULL,
	"classification_model" text DEFAULT 'claude-sonnet-5-5' NOT NULL,
	"writing_model" text DEFAULT 'claude-opus-5-5' NOT NULL,
	"whatsapp_business_number" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "automation_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"campaign_id" uuid,
	"contact_id" uuid,
	"lead_id" uuid,
	"instantly_campaign_id" text,
	"lead_email" text NOT NULL,
	"company" text,
	"eaccount" text,
	"thread_id" text,
	"state" "conversation_state" DEFAULT 'replied' NOT NULL,
	"follow_up_count" integer DEFAULT 0 NOT NULL,
	"nurturing_count" integer DEFAULT 0 NOT NULL,
	"negative_reply_count" integer DEFAULT 0 NOT NULL,
	"paused_reason" text,
	"out_of_office_until" timestamp,
	"first_email_sent_at" timestamp,
	"next_action_at" timestamp,
	"last_inbound_at" timestamp,
	"last_outbound_at" timestamp,
	"phone_e164" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_organization_id_instantly_campaign_id_lead_email_unique" UNIQUE("organization_id","instantly_campaign_id","lead_email")
);
--> statement-breakpoint
CREATE TABLE "email_suppression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppression_organization_id_email_unique" UNIQUE("organization_id","email")
);
--> statement-breakpoint
CREATE TABLE "inbound_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"instantly_email_id" text,
	"event_type" text NOT NULL,
	"subject" text,
	"body_text" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"instantly_interest_label" text,
	"is_auto_reply" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"processed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_message_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "inbound_message_instantly_email_id_unique" UNIQUE("instantly_email_id")
);
--> statement-breakpoint
CREATE TABLE "objection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"response_angle" text NOT NULL,
	"status" "objection_status" DEFAULT 'active' NOT NULL,
	"source_message_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "objection_organization_id_key_unique" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "reply_classification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbound_message_id" uuid NOT NULL,
	"category" "reply_category" NOT NULL,
	"objection_id" uuid,
	"phone_e164" text,
	"referral" text,
	"chosen_slot" text,
	"return_date" text,
	"confidence" real NOT NULL,
	"reasoning" text NOT NULL,
	"source" "classification_source" NOT NULL,
	"model" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reply_classification_inbound_message_id_unique" UNIQUE("inbound_message_id")
);
--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_event" ADD CONSTRAINT "conversation_event_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_event" ADD CONSTRAINT "conversation_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppression" ADD CONSTRAINT "email_suppression_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppression" ADD CONSTRAINT "email_suppression_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_message" ADD CONSTRAINT "inbound_message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objection" ADD CONSTRAINT "objection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objection" ADD CONSTRAINT "objection_source_message_id_inbound_message_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."inbound_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_classification" ADD CONSTRAINT "reply_classification_inbound_message_id_inbound_message_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."inbound_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_classification" ADD CONSTRAINT "reply_classification_objection_id_objection_id_fk" FOREIGN KEY ("objection_id") REFERENCES "public"."objection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_event_conversation_id_created_at_idx" ON "conversation_event" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_organization_id_state_idx" ON "conversation" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX "inbound_message_conversation_id_idx" ON "inbound_message" USING btree ("conversation_id");