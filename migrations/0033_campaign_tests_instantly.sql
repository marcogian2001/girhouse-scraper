CREATE TABLE "instantly_campaign_stat" (
	"instantly_campaign_id" text PRIMARY KEY NOT NULL,
	"contacted" integer NOT NULL,
	"replied" integer NOT NULL,
	"bounced" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instantly_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instantly_campaign_id" text NOT NULL,
	"email" text NOT NULL,
	"replied_step" integer,
	"interest_status" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instantly_lead_instantly_campaign_id_email_unique" UNIQUE("instantly_campaign_id","email")
);
--> statement-breakpoint
ALTER TYPE "public"."job_type" RENAME VALUE 'campaign_analysis' TO 'instantly_sync';--> statement-breakpoint
ALTER TABLE "lead_outcome" ADD COLUMN "no_show_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign" DROP COLUMN "prompt_analysis";