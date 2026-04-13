/**
 * Data schema for Open Cabinet.
 *
 * Separate from auth-schema.ts (Better Auth tables). Both live in the
 * same Neon PostgreSQL database but are defined in separate files so
 * Drizzle can manage them independently.
 *
 * Key design decisions:
 * - officials.slug is the unique identifier (matches JSON filenames)
 * - transactions have a UNIQUE constraint to prevent duplicates from
 *   amended filings that restate the same trades
 * - batchId links transactions to the pipeline run that created them,
 *   enabling "revert this run" rollback
 * - confidence + needsReview support the human-in-the-loop review queue
 */
import {
  pgTable,
  serial,
  text,
  boolean,
  real,
  integer,
  timestamp,
  date,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ── OFFICIALS ──
// One row per tracked executive branch official.
export const officials = pgTable("officials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "Trump, Donald J."
  slug: text("slug").notNull().unique(), // "trump-donald-j"
  title: text("title"), // "President of the United States"
  agency: text("agency"),
  level: text("level"), // "Cabinet", "Sub-Cabinet"
  party: text("party"), // "R", "D", "I"
  filingType: text("filing_type"), // "278-T Periodic Transaction Report"
  photoUrl: text("photo_url"),
  summary: text("summary"), // AI-generated plain-English summary
  confirmedDate: date("confirmed_date"),
  tookOfficeDate: date("took_office_date"),
  ethicsAgreementDate: date("ethics_agreement_date"),
  departedDate: date("departed_date"),
  mostRecentFilingDate: date("most_recent_filing_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── TRANSACTIONS ──
// One row per financial transaction extracted from OGE 278-T PDFs.
// The UNIQUE constraint prevents duplicates when amended filings
// restate the same trades.
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    officialId: integer("official_id")
      .notNull()
      .references(() => officials.id, { onDelete: "cascade" }),
    description: text("description").notNull(), // "BANK OF AMERICA CORPORATION CONV PFD SER L 7.250%"
    ticker: text("ticker"), // "BAC" or null
    type: text("type").notNull(), // "Sale", "Purchase", "Sale (Partial)", "Sale (Full)", "Exchange"
    date: date("date").notNull(),
    amount: text("amount").notNull(), // "$1,001-$15,000" (exact OGE range string)
    lateFilingFlag: boolean("late_filing_flag").default(false).notNull(),
    pdfSource: text("pdf_source"), // URL of the source PDF
    confidence: real("confidence"), // Parser confidence 0.0-1.0
    needsReview: boolean("needs_review").default(false).notNull(),
    batchId: integer("batch_id").references(() => pipelineRuns.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("transactions_dedup").on(
      table.officialId,
      table.description,
      table.date,
      table.amount,
      table.type
    ),
    index("transactions_official_idx").on(table.officialId),
    index("transactions_ticker_idx").on(table.ticker),
    index("transactions_date_idx").on(table.date),
    index("transactions_review_idx").on(table.needsReview),
  ]
);

// ── NEWS COVERAGE ──
// Published articles about officials' financial conflicts.
export const newsCoverage = pgTable(
  "news_coverage",
  {
    id: serial("id").primaryKey(),
    officialSlug: text("official_slug").notNull(),
    headline: text("headline").notNull(),
    source: text("source").notNull(), // "ProPublica", "CNBC"
    date: date("date").notNull(),
    url: text("url").notNull(),
    relevance: text("relevance"), // One-sentence context
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("news_official_idx").on(table.officialSlug)]
);

// ── PIPELINE RUNS ──
// Tracks each automated data pipeline execution.
export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  ranAt: timestamp("ran_at").defaultNow().notNull(),
  trigger: text("trigger").notNull(), // "cron", "manual", "admin"
  status: text("status").notNull(), // "running", "completed", "failed"
  newFilingsFound: integer("new_filings_found").default(0),
  newTransactionsParsed: integer("new_transactions_parsed").default(0),
  errors: jsonb("errors"), // Array of error objects
  tokenUsage: jsonb("token_usage"), // { inputTokens, outputTokens, costUsd }
  duration: integer("duration"), // Milliseconds
  completedAt: timestamp("completed_at"),
});

// ── VALIDATION RESULTS ──
// Output of each validation run against the parsed data.
export const validationResults = pgTable("validation_results", {
  id: serial("id").primaryKey(),
  pipelineRunId: integer("pipeline_run_id").references(() => pipelineRuns.id, {
    onDelete: "set null",
  }),
  ranAt: timestamp("ran_at").defaultNow().notNull(),
  totalTransactions: integer("total_transactions"),
  schemaFailures: integer("schema_failures"),
  unknownTickers: integer("unknown_tickers"),
  goldenFilesPassed: integer("golden_files_passed"),
  goldenFilesTotal: integer("golden_files_total"),
  flaggedForReview: integer("flagged_for_review"),
  report: jsonb("report"), // Full validation report object
});
