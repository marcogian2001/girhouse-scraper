ALTER TYPE "public"."conversation_state" ADD VALUE 'closed_no_reply' BEFORE 'stop';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'conversation_tick';