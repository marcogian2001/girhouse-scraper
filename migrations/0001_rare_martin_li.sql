CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'enriching', 'writing', 'review', 'pushing', 'pushed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('pending', 'enriching', 'enriched', 'writing', 'ready', 'approved', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('enrich', 'write', 'push');--> statement-breakpoint
CREATE TYPE "public"."knowledge_kind" AS ENUM('prompt', 'document');--> statement-breakpoint
CREATE TYPE "public"."parallel_processor" AS ENUM('lite', 'base', 'core', 'pro');--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"processor" "parallel_processor" DEFAULT 'core' NOT NULL,
	"email_count" integer NOT NULL,
	"delays_days" jsonb NOT NULL,
	"knowledge_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_prompt" text,
	"instantly_campaign_id" text,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"company" text,
	"website" text,
	"linkedin_url" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "contact_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"model" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_draft_contact_id_step_index_unique" UNIQUE("contact_id","step_index")
);
--> statement-breakpoint
CREATE TABLE "enrichment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"parallel_run_id" text,
	"processor" "parallel_processor" NOT NULL,
	"content" jsonb,
	"basis" jsonb,
	"person_found" boolean,
	"identity_confidence" "confidence_level",
	"identity_reasoning" text,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enrichment_contact_id_unique" UNIQUE("contact_id")
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"run_after" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "knowledge_kind" NOT NULL,
	"content" text,
	"anthropic_file_id" text,
	"mime_type" text,
	"size_bytes" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_draft" ADD CONSTRAINT "email_draft_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment" ADD CONSTRAINT "enrichment_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_user_id_idx" ON "campaign" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contact_campaign_id_status_idx" ON "contact" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "job_status_run_after_idx" ON "job" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "job_campaign_id_idx" ON "job" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "knowledge_asset_user_id_idx" ON "knowledge_asset" USING btree ("user_id");