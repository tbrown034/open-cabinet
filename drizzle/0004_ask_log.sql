CREATE TABLE IF NOT EXISTS "ask_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"question" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"plan" text,
	"matched_rows" integer,
	"phrased_by" text,
	"ip_hash" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ask_log_at_idx" ON "ask_log" ("at");
