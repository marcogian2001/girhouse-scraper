CREATE TABLE "demo_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo" ADD COLUMN "guidance" text;--> statement-breakpoint
ALTER TABLE "demo_image" ADD CONSTRAINT "demo_image_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_image_conversation_id_idx" ON "demo_image" USING btree ("conversation_id");