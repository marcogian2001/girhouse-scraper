CREATE TABLE "email_poll_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"campaign_id" uuid,
	"group_key" text NOT NULL,
	"group_label" text NOT NULL,
	"model" text NOT NULL,
	"cost_micros" integer NOT NULL,
	"emails" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_poll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"show_model" boolean DEFAULT false NOT NULL,
	"show_cost" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_poll_vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"voter_hash" text NOT NULL,
	"score" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_poll_vote_item_id_voter_hash_unique" UNIQUE("item_id","voter_hash"),
	CONSTRAINT "email_poll_vote_score_check" CHECK ("email_poll_vote"."score" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "email_poll_item" ADD CONSTRAINT "email_poll_item_poll_id_email_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."email_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_poll_item" ADD CONSTRAINT "email_poll_item_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_poll" ADD CONSTRAINT "email_poll_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_poll" ADD CONSTRAINT "email_poll_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_poll_vote" ADD CONSTRAINT "email_poll_vote_poll_id_email_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."email_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_poll_vote" ADD CONSTRAINT "email_poll_vote_item_id_email_poll_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."email_poll_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_poll_item_poll_id_idx" ON "email_poll_item" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "email_poll_organization_id_idx" ON "email_poll" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "email_poll_vote_poll_id_idx" ON "email_poll_vote" USING btree ("poll_id");