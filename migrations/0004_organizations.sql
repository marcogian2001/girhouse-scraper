CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DROP INDEX "api_usage_user_id_created_at_idx";--> statement-breakpoint
DROP INDEX "campaign_user_id_idx";--> statement-breakpoint
DROP INDEX "knowledge_asset_user_id_idx";--> statement-breakpoint
ALTER TABLE "api_usage" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_asset" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
-- Backfill: every existing user gets a personal organization that takes over
-- their campaigns, knowledge assets and spend. The slug keys the join below.
INSERT INTO "organization" ("id", "name", "slug")
SELECT gen_random_uuid()::text, "user"."name", 'personal-' || "user"."id"
FROM "user";--> statement-breakpoint
INSERT INTO "member" ("id", "organization_id", "user_id", "role")
SELECT gen_random_uuid()::text, "organization"."id", "user"."id", 'owner'
FROM "user"
INNER JOIN "organization" ON "organization"."slug" = 'personal-' || "user"."id";--> statement-breakpoint
UPDATE "api_usage" SET "organization_id" = "organization"."id"
FROM "organization" WHERE "organization"."slug" = 'personal-' || "api_usage"."user_id";--> statement-breakpoint
UPDATE "campaign" SET "organization_id" = "organization"."id"
FROM "organization" WHERE "organization"."slug" = 'personal-' || "campaign"."user_id";--> statement-breakpoint
UPDATE "knowledge_asset" SET "organization_id" = "organization"."id"
FROM "organization" WHERE "organization"."slug" = 'personal-' || "knowledge_asset"."user_id";--> statement-breakpoint
UPDATE "session" SET "active_organization_id" = "organization"."id"
FROM "organization" WHERE "organization"."slug" = 'personal-' || "session"."user_id";--> statement-breakpoint
ALTER TABLE "api_usage" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_asset" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_asset" ADD CONSTRAINT "knowledge_asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_usage_organization_id_created_at_idx" ON "api_usage" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "campaign_organization_id_idx" ON "campaign" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_asset_organization_id_idx" ON "knowledge_asset" USING btree ("organization_id");