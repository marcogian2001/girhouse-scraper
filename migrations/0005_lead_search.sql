CREATE TYPE "public"."email_verification" AS ENUM('valid', 'catch_all');--> statement-breakpoint
CREATE TYPE "public"."lead_email_source" AS ENUM('prospeo', 'public');--> statement-breakpoint
CREATE TYPE "public"."lead_search_status" AS ENUM('searching', 'qualifying', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('found', 'researching', 'finding_email', 'ready', 'filtered_out', 'no_email', 'failed');--> statement-breakpoint
CREATE TYPE "public"."website_filter" AS ENUM('any', 'without', 'with');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'lead_search';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'lead_research';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'lead_email';--> statement-breakpoint
ALTER TYPE "public"."usage_provider" ADD VALUE 'apify';--> statement-breakpoint
ALTER TYPE "public"."usage_provider" ADD VALUE 'prospeo';--> statement-breakpoint
ALTER TYPE "public"."usage_provider" ADD VALUE 'millionverifier';--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_search_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"place_id" text NOT NULL,
	"company" text NOT NULL,
	"website" text,
	"domain" text,
	"has_website" boolean NOT NULL,
	"phone" text,
	"address" text,
	"city" text,
	"category" text,
	"rating" real,
	"reviews_count" integer,
	"first_name" text,
	"last_name" text,
	"role" text,
	"linkedin_url" text,
	"email" text,
	"email_source" "lead_email_source",
	"email_verification" "email_verification",
	"status" "lead_status" DEFAULT 'found' NOT NULL,
	"parallel_run_id" text,
	"research_started_at" timestamp,
	"research" jsonb,
	"raw" jsonb,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_organization_id_place_id_unique" UNIQUE("organization_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "lead_search" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"search_terms" jsonb NOT NULL,
	"location" text NOT NULL,
	"max_results" integer NOT NULL,
	"website_filter" "website_filter" DEFAULT 'any' NOT NULL,
	"processor" "parallel_processor" DEFAULT 'base' NOT NULL,
	"status" "lead_search_status" DEFAULT 'searching' NOT NULL,
	"apify_run_id" text,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "campaign_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_usage" ADD COLUMN "lead_search_id" uuid;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "lead_search_id" uuid;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_lead_search_id_lead_search_id_fk" FOREIGN KEY ("lead_search_id") REFERENCES "public"."lead_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_search" ADD CONSTRAINT "lead_search_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_search" ADD CONSTRAINT "lead_search_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_lead_search_id_status_idx" ON "lead" USING btree ("lead_search_id","status");--> statement-breakpoint
CREATE INDEX "lead_search_organization_id_idx" ON "lead_search" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_lead_search_id_lead_search_id_fk" FOREIGN KEY ("lead_search_id") REFERENCES "public"."lead_search"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_lead_search_id_lead_search_id_fk" FOREIGN KEY ("lead_search_id") REFERENCES "public"."lead_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_usage_lead_search_id_idx" ON "api_usage" USING btree ("lead_search_id");--> statement-breakpoint
CREATE INDEX "job_lead_search_id_idx" ON "job" USING btree ("lead_search_id");