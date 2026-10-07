ALTER TABLE "campaign" ADD COLUMN "budget_micros" integer;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "budget_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "budget_committed_micros" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "budget_operations" jsonb DEFAULT '{}'::jsonb NOT NULL;