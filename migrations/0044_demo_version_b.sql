CREATE TYPE "public"."demo_version" AS ENUM('a', 'b');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'demo_vsl';--> statement-breakpoint
CREATE TABLE "demo_voice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demo_id" uuid NOT NULL,
	"line" text NOT NULL,
	"text" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"seconds" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo" ADD COLUMN "version" "demo_version" DEFAULT 'a' NOT NULL;--> statement-breakpoint
ALTER TABLE "demo" ADD COLUMN "vsl" jsonb;--> statement-breakpoint
ALTER TABLE "demo_voice" ADD CONSTRAINT "demo_voice_demo_id_demo_id_fk" FOREIGN KEY ("demo_id") REFERENCES "public"."demo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_voice_demo_id_idx" ON "demo_voice" USING btree ("demo_id");