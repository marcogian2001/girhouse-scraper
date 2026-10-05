CREATE TABLE "coverage_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"daily_leads" integer DEFAULT 750 NOT NULL,
	"leads_per_search" integer DEFAULT 250 NOT NULL,
	"website_filter" "website_filter" DEFAULT 'any' NOT NULL,
	"processor" "parallel_processor" DEFAULT 'base' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coverage_plan_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "coverage_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"term" text NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coverage_term_plan_id_term_unique" UNIQUE("plan_id","term"),
	CONSTRAINT "coverage_term_tier_check" CHECK ("coverage_term"."tier" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "lead_search" ADD COLUMN "coverage_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "coverage_plan" ADD CONSTRAINT "coverage_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_plan" ADD CONSTRAINT "coverage_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_term" ADD CONSTRAINT "coverage_term_plan_id_coverage_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."coverage_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_search" ADD CONSTRAINT "lead_search_coverage_plan_id_coverage_plan_id_fk" FOREIGN KEY ("coverage_plan_id") REFERENCES "public"."coverage_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_search_coverage_plan_id_idx" ON "lead_search" USING btree ("coverage_plan_id");