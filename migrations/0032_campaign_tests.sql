ALTER TYPE "public"."job_type" ADD VALUE 'campaign_analysis';--> statement-breakpoint
CREATE TABLE "lead_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"call_booked_at" timestamp,
	"won_at" timestamp,
	"won_value" double precision,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_outcome_organization_id_email_unique" UNIQUE("organization_id","email")
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "target" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "zone" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "hypothesis" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "prompt_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "lead_outcome" ADD CONSTRAINT "lead_outcome_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;