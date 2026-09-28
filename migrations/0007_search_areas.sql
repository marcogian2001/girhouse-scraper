ALTER TYPE "public"."lead_status" ADD VALUE 'reserve' BEFORE 'filtered_out';--> statement-breakpoint
CREATE TABLE "discovered_place" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_area_id" uuid NOT NULL,
	"place_id" text NOT NULL,
	"scraped_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discovered_place_search_area_id_place_id_unique" UNIQUE("search_area_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "search_area" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"location_place_id" text NOT NULL,
	"search_term" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "search_area_organization_id_location_place_id_search_term_unique" UNIQUE("organization_id","location_place_id","search_term")
);
--> statement-breakpoint
CREATE TABLE "search_cell" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_area_id" uuid NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"low_latitude" double precision NOT NULL,
	"low_longitude" double precision NOT NULL,
	"high_latitude" double precision NOT NULL,
	"high_longitude" double precision NOT NULL,
	"scanned_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "search_cell_search_area_id_depth_low_unique" UNIQUE("search_area_id","depth","low_latitude","low_longitude")
);
--> statement-breakpoint
ALTER TABLE "lead_search" ADD COLUMN "location_place_id" text;--> statement-breakpoint
ALTER TABLE "lead_search" ADD COLUMN "scrape_rounds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_search" ADD COLUMN "reserve_claimed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_place" ADD CONSTRAINT "discovered_place_search_area_id_search_area_id_fk" FOREIGN KEY ("search_area_id") REFERENCES "public"."search_area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_area" ADD CONSTRAINT "search_area_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_cell" ADD CONSTRAINT "search_cell_search_area_id_search_area_id_fk" FOREIGN KEY ("search_area_id") REFERENCES "public"."search_area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_cell_search_area_id_scanned_at_idx" ON "search_cell" USING btree ("search_area_id","scanned_at");