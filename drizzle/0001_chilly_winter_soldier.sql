CREATE TABLE "news_coverage" (
	"id" serial PRIMARY KEY NOT NULL,
	"official_slug" text NOT NULL,
	"headline" text NOT NULL,
	"source" text NOT NULL,
	"date" date NOT NULL,
	"url" text NOT NULL,
	"relevance" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "officials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"title" text,
	"agency" text,
	"level" text,
	"party" text,
	"filing_type" text,
	"photo_url" text,
	"summary" text,
	"confirmed_date" date,
	"took_office_date" date,
	"ethics_agreement_date" date,
	"departed_date" date,
	"most_recent_filing_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "officials_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ran_at" timestamp DEFAULT now() NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"new_filings_found" integer DEFAULT 0,
	"new_transactions_parsed" integer DEFAULT 0,
	"errors" jsonb,
	"token_usage" jsonb,
	"duration" integer,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"official_id" integer NOT NULL,
	"description" text NOT NULL,
	"ticker" text,
	"type" text NOT NULL,
	"date" date NOT NULL,
	"amount" text NOT NULL,
	"late_filing_flag" boolean DEFAULT false NOT NULL,
	"pdf_source" text,
	"confidence" real,
	"needs_review" boolean DEFAULT false NOT NULL,
	"batch_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_dedup" UNIQUE("official_id","description","date","amount","type")
);
--> statement-breakpoint
CREATE TABLE "validation_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipeline_run_id" integer,
	"ran_at" timestamp DEFAULT now() NOT NULL,
	"total_transactions" integer,
	"schema_failures" integer,
	"unknown_tickers" integer,
	"golden_files_passed" integer,
	"golden_files_total" integer,
	"flagged_for_review" integer,
	"report" jsonb
);
--> statement-breakpoint
DROP INDEX "verification_identifier_idx";--> statement-breakpoint
DROP INDEX "account_userId_idx";--> statement-breakpoint
DROP INDEX "session_userId_idx";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_batch_id_pipeline_runs_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_official_idx" ON "news_coverage" USING btree ("official_slug");--> statement-breakpoint
CREATE INDEX "transactions_official_idx" ON "transactions" USING btree ("official_id");--> statement-breakpoint
CREATE INDEX "transactions_ticker_idx" ON "transactions" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_review_idx" ON "transactions" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");