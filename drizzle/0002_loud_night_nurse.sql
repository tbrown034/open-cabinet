-- Hand-edited: safe for both fresh DBs and the live prod DB.
--
-- Two issues in the raw drizzle-kit output:
--
-- 1. alert_signups exists on prod (35 rows, old 10-column shape created by
--    the old ensureAlertSignupsTable() runtime shim — never via a migration).
--    drizzle-kit's snapshot history doesn't know it exists and emits a bare
--    CREATE TABLE, which would collide. We use CREATE TABLE IF NOT EXISTS plus
--    ADD COLUMN IF NOT EXISTS to handle both cases (fresh and prod).
--
-- 2. transactions.row_index is already present on prod (pre-existing schema
--    drift — added at runtime before the migration system was in place) but
--    absent from the 0001 snapshot. drizzle-kit would drop+re-add the dedup
--    constraint and ADD COLUMN row_index, both of which would fail. Those
--    changes are removed here; the column and constraint are already correct
--    in prod.

-- alert_signups: create on fresh DBs; no-op on prod where it already exists.
CREATE TABLE IF NOT EXISTS "alert_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"alert_type" text DEFAULT 'major' NOT NULL,
	"source_page" text,
	"official_slug" text,
	"referrer" text,
	"user_agent" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp,
	"unsubscribed_at" timestamp,
	"last_notified_at" timestamp,
	"suppressed_reason" text,
	"repermission_sent_at" timestamp,
	"confirmation_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alert_signups_email_unique" UNIQUE("email")
);
--> statement-breakpoint

-- alert_signups: add lifecycle columns on prod's old 10-column table.
-- ADD COLUMN IF NOT EXISTS is a no-op on fresh DBs where the CREATE above
-- already included these columns.
ALTER TABLE "alert_signups" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "alert_signups" ADD COLUMN IF NOT EXISTS "unsubscribed_at" timestamp;--> statement-breakpoint
ALTER TABLE "alert_signups" ADD COLUMN IF NOT EXISTS "last_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "alert_signups" ADD COLUMN IF NOT EXISTS "suppressed_reason" text;--> statement-breakpoint
ALTER TABLE "alert_signups" ADD COLUMN IF NOT EXISTS "repermission_sent_at" timestamp;--> statement-breakpoint
-- confirmation_sent_at: durable anti-list-bombing throttle. New column on both
-- fresh and prod DBs (was never in the old shim or prior migration drafts).
ALTER TABLE "alert_signups" ADD COLUMN IF NOT EXISTS "confirmation_sent_at" timestamp;--> statement-breakpoint
-- Set default for new signups; SET DEFAULT is a metadata-only change and does
-- NOT alter existing rows' status values.
ALTER TABLE "alert_signups" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint

-- digest_runs: never existed on prod (old 0002 migration never ran).
CREATE TABLE "digest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"frozen_payload" jsonb,
	"chunks" jsonb,
	"approved_by" text,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"errors" jsonb,
	"pipeline_run_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "digest_runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint

-- email_sends: never existed on prod.
CREATE TABLE "email_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"kind" text NOT NULL,
	"digest_run_id" integer,
	"resend_message_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- notified_filings: never existed on prod.
CREATE TABLE "notified_filings" (
	"id" serial PRIMARY KEY NOT NULL,
	"filing_url" text NOT NULL,
	"official_slug" text NOT NULL,
	"digest_run_id" integer,
	"notified_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notified_filings_filing_url_unique" UNIQUE("filing_url")
);
--> statement-breakpoint

ALTER TABLE "digest_runs" ADD CONSTRAINT "digest_runs_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_digest_run_id_digest_runs_id_fk" FOREIGN KEY ("digest_run_id") REFERENCES "public"."digest_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notified_filings" ADD CONSTRAINT "notified_filings_digest_run_id_digest_runs_id_fk" FOREIGN KEY ("digest_run_id") REFERENCES "public"."digest_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- alert_signups indexes: IF NOT EXISTS because the shim may have created some.
CREATE INDEX IF NOT EXISTS "alert_signups_email_idx" ON "alert_signups" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_signups_status_idx" ON "alert_signups" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_signups_source_idx" ON "alert_signups" USING btree ("source_page");--> statement-breakpoint

-- New table indexes (no IF NOT EXISTS needed; tables are brand new).
CREATE INDEX "email_sends_email_idx" ON "email_sends" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_sends_kind_idx" ON "email_sends" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "notified_filings_slug_idx" ON "notified_filings" USING btree ("official_slug");
