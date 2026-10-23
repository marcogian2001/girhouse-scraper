CREATE INDEX "contact_lower_email_idx" ON "contact" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "conversation_organization_id_last_inbound_at_idx" ON "conversation" USING btree ("organization_id","last_inbound_at","id");--> statement-breakpoint
CREATE INDEX "conversation_campaign_id_idx" ON "conversation" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "conversation_contact_id_idx" ON "conversation" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversation_lead_id_idx" ON "conversation" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "demo_lead_id_idx" ON "demo" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "job_contact_id_idx" ON "job" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "job_lead_id_idx" ON "job" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_organization_id_status_idx" ON "lead" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "lead_organization_id_lower_email_idx" ON "lead" USING btree ("organization_id",lower("email"));