ALTER TYPE "public"."conversation_state" ADD VALUE 'auto_reply' BEFORE 'paused';--> statement-breakpoint
ALTER TYPE "public"."reply_category" ADD VALUE 'auto_reply' BEFORE 'wrong_person';