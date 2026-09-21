CREATE TYPE "public"."usage_provider" AS ENUM('anthropic', 'parallel');--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"campaign_id" uuid,
	"provider" "usage_provider" NOT NULL,
	"external_id" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_usage_provider_external_id_unique" UNIQUE("provider","external_id")
);
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_usage_user_id_created_at_idx" ON "api_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "api_usage_campaign_id_idx" ON "api_usage" USING btree ("campaign_id");--> statement-breakpoint
-- Backfill: Parallel bills each completed run at a flat per-processor price,
-- so the research done before this table existed can be priced after the fact
INSERT INTO "api_usage" ("user_id", "campaign_id", "provider", "external_id", "model", "cost_micros", "created_at", "updated_at")
SELECT
	"campaign"."user_id",
	"campaign"."id",
	'parallel',
	"enrichment"."parallel_run_id",
	"enrichment"."processor",
	CASE "enrichment"."processor"
		WHEN 'lite' THEN 5000
		WHEN 'base' THEN 10000
		WHEN 'core' THEN 25000
		WHEN 'pro' THEN 100000
	END,
	"enrichment"."completed_at",
	"enrichment"."completed_at"
FROM "enrichment"
INNER JOIN "contact" ON "contact"."id" = "enrichment"."contact_id"
INNER JOIN "campaign" ON "campaign"."id" = "contact"."campaign_id"
WHERE "enrichment"."parallel_run_id" IS NOT NULL AND "enrichment"."completed_at" IS NOT NULL
ON CONFLICT DO NOTHING;