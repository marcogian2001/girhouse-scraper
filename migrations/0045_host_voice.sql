CREATE TYPE "public"."host_voice_kind" AS ENUM('source', 'consent');--> statement-breakpoint
CREATE TABLE "host_voice" (
	"kind" "host_voice_kind" PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
