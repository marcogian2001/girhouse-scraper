-- Keeps only the professions some campaign of the organization was made for, adding those missing.
-- Their search areas stay, so adding a profession back resumes where it stopped.
DELETE FROM "coverage_term" "t"
USING "coverage_plan" "p"
WHERE "p"."id" = "t"."plan_id"
  AND NOT EXISTS (
    SELECT 1
    FROM "contact" "c"
    JOIN "campaign" "ca" ON "ca"."id" = "c"."campaign_id"
    CROSS JOIN LATERAL regexp_split_to_table("c"."extra"->>'Profession', ',') AS "prof"
    WHERE "ca"."organization_id" = "p"."organization_id"
      AND lower(trim("prof")) = "t"."term"
  );--> statement-breakpoint
INSERT INTO "coverage_term" ("plan_id", "term")
SELECT DISTINCT "p"."id", lower(trim("prof"))
FROM "coverage_plan" "p"
JOIN "campaign" "ca" ON "ca"."organization_id" = "p"."organization_id"
JOIN "contact" "c" ON "c"."campaign_id" = "ca"."id"
CROSS JOIN LATERAL regexp_split_to_table("c"."extra"->>'Profession', ',') AS "prof"
WHERE trim("prof") <> ''
ON CONFLICT ("plan_id", "term") DO NOTHING;
