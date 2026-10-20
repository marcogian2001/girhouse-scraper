ALTER TABLE "automation_settings" ALTER COLUMN "max_follow_ups" SET DEFAULT 2;--> statement-breakpoint
-- Organizations still on the old default move to the shorter sequence too
UPDATE "automation_settings" SET "max_follow_ups" = 2 WHERE "max_follow_ups" = 3;
