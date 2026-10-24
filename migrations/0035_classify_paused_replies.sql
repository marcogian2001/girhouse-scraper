-- Paused conversations now have their latest reply classified, so the replies list can show
-- whether the lead is interested. Their unclassified latest replies are queued again, half an
-- hour out so the deployment being replaced does not take them with its older code.
WITH "paused_reply" AS (
  SELECT "latest"."id"
  FROM "conversation" "c"
  CROSS JOIN LATERAL (
    SELECT "im"."id"
    FROM "inbound_message" "im"
    WHERE "im"."conversation_id" = "c"."id"
    ORDER BY "im"."received_at" DESC
    LIMIT 1
  ) "latest"
  WHERE "c"."state" = 'paused'
    AND NOT EXISTS (
      SELECT 1 FROM "reply_classification" "rc" WHERE "rc"."inbound_message_id" = "latest"."id"
    )
), "reset" AS (
  UPDATE "inbound_message"
  SET "processed_at" = NULL
  WHERE "id" IN (SELECT "id" FROM "paused_reply")
)
INSERT INTO "job" ("type", "payload", "run_after")
SELECT 'reply_process', jsonb_build_object('inboundMessageId', "id"), now() + interval '30 minutes'
FROM "paused_reply";
