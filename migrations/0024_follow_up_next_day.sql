ALTER TABLE "automation_settings" ALTER COLUMN "demo_not_opened_business_days" SET DEFAULT 1;--> statement-breakpoint
-- Organizations still on the old default move to the next working day too
UPDATE "automation_settings" SET "demo_not_opened_business_days" = 1 WHERE "demo_not_opened_business_days" = 2;
