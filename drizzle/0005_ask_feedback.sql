ALTER TABLE "ask_log" ADD COLUMN IF NOT EXISTS "feedback" text;
--> statement-breakpoint
ALTER TABLE "ask_log" ADD COLUMN IF NOT EXISTS "feedback_reason" text;
