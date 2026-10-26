ALTER TABLE "outbound_email" ADD COLUMN "not_interested_version" "not_interested_version";--> statement-breakpoint
ALTER TABLE "automation_settings" DROP COLUMN "not_interested_version";--> statement-breakpoint
UPDATE "outbound_email" SET "not_interested_version" = 'a'
FROM "reply_classification"
WHERE "reply_classification"."inbound_message_id" = "outbound_email"."inbound_message_id"
  AND "reply_classification"."category" = 'not_interested'
  AND "outbound_email"."kind" = 'reply';
