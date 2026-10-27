ALTER TABLE "automation_settings" ALTER COLUMN "price_increase_days" SET DEFAULT 7;--> statement-breakpoint
ALTER TABLE "demo" ADD COLUMN "generated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- The countdown now runs from the demo build, so every organization moves to the 7 days
UPDATE "automation_settings" SET "price_increase_days" = 7;
