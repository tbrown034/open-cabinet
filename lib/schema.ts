/**
 * Data schema for Open Cabinet.
 *
 * Separate from auth-schema.ts (Better Auth tables). Both live in the
 * same Neon PostgreSQL database but are defined in separate files so
 * Drizzle can manage them independently.
 *
 * Key design decisions:
 * - officials.slug is the unique identifier (matches JSON filenames)
 * - transactions use a UNIQUE constraint on (officialId, description,
 *   date, amount, type, pdfSource) — this allows legitimate duplicate
 *   lot sales within a single filing while still catching cross-filing
 *   duplicates from amended filings. When an amended filing replaces
 *   an original, the pipeline deletes the original's transactions first.
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
// The UNIQUE constraint prevents cross-filing duplicates (amended
// filings restating the same trades) while allowing legitimate
// duplicate lot sales within a single filing. Including pdfSource
// means two rows with identical (desc, date, type, amount) from the
// SAME PDF are allowed — they represent different lots. When an
// amended filing arrives, the pipeline deletes all transactions from
// the original filing first, then inserts the amendment's rows.
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
    rowIndex: integer("row_index"), // Position in source PDF (distinguishes duplicate lots)
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
      table.type,
      table.rowIndex
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

// ── ALERT SIGNUPS ──
// Public filing-alert subscriptions collected from the site.
//
// Lifecycle: pending -> active -> unsubscribed | suppressed
//   "pending"      — signed up, confirmation email sent, not yet clicked
//   "active"       — double-opt-in confirmed; eligible for digest sends
//   "unsubscribed" — opted out via unsubscribe link
//   "suppressed"   — removed due to bounce or spam complaint from Resend webhook
//
// Tokens (confirm/unsubscribe) are stateless HMAC signatures generated at
// request time by lib/tokens.ts — they are never stored here. The old
// confirmToken/unsubscribeToken columns are removed.
//
// confirmationSentAt is a durable anti-list-bombing throttle: the signup
// route only sends (or re-sends) a confirmation if this field is null or
// older than 15 minutes. The previous in-memory Map throttle was reset on
// every serverless cold start.
export const alertSignups = pgTable(
  "alert_signups",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    alertType: text("alert_type").default("major").notNull(), // "major" | "all" — reserved for per-person targeting
    sourcePage: text("source_page"),
    officialSlug: text("official_slug"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    status: text("status").default("pending").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    unsubscribedAt: timestamp("unsubscribed_at"),
    // Timestamp of the last digest this address received (debugging/recency).
    lastNotifiedAt: timestamp("last_notified_at"),
    // "bounce" | "complaint" — populated by Resend webhook when suppressed.
    suppressedReason: text("suppressed_reason"),
    // Stamped when the one-time re-permission email was sent; prevents re-spam
    // on subsequent script runs.
    repermissionSentAt: timestamp("repermission_sent_at"),
    // Stamped when the confirmation email is (re-)sent; null until first send.
    // The signup route checks this before sending to enforce the 15-minute
    // re-send window — serverless-safe, unlike an in-memory throttle.
    confirmationSentAt: timestamp("confirmation_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("alert_signups_email_idx").on(table.email),
    index("alert_signups_status_idx").on(table.status),
    index("alert_signups_source_idx").on(table.sourcePage),
  ]
);

// ── DIGEST RUNS ──
// One row per digest send attempt; models a write-ahead outbox so the
// external Resend call is never assumed atomic with our DB writes.
//
// Lifecycle: draft -> sending -> sent | failed
//   "draft"   — payload assembled, not yet sent; requires admin approval
//   "sending" — chunks are being submitted to resend.emails.send (batch)
//   "sent"    — all chunks accepted; notified_filings ledger rows written
//   "failed"  — at least one chunk failed; errors field has details
//
// The send is chunked: frozenPayload drives resend.emails.send calls with
// per-chunk idempotency keys derived deterministically from idempotencyKey
// (e.g. "<idempotencyKey>:chunk:0"). Resend's idempotency window is 24h,
// so a crash mid-send leaves status "sending" and recovery replays the
// byte-identical frozenPayload with the same chunk keys — no duplicate sends.
//
// officialSlugs and filingUrls are derivable from frozenPayload and are NOT
// stored here. frozenPayload is the authoritative, immutable send spec.
// notified_filings rows are written only on transition to "sent".
export const digestRuns = pgTable("digest_runs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(), // draft | sending | sent | failed
  recipientCount: integer("recipient_count").default(0).notNull(),
  // Unique guard: prevents a retry or double-click from starting a second
  // concurrent send for the same logical digest window.
  idempotencyKey: text("idempotency_key").unique(),
  // Frozen, byte-identical send spec (digest items + recipient list).
  // Must NOT be mutated after the first chunk is submitted — Resend
  // idempotency requires the payload to be byte-identical on replay.
  frozenPayload: jsonb("frozen_payload"),
  // Per-chunk tracking: [{ n, idempotencyKey, status, recipientCount }].
  // Written after each chunk to allow partial-failure recovery.
  chunks: jsonb("chunks"),
  approvedBy: text("approved_by"), // admin email that triggered the send
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  errors: jsonb("errors"),
  pipelineRunId: integer("pipeline_run_id").references(() => pipelineRuns.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── NOTIFIED FILINGS ──
// Idempotency ledger: one row per filing URL that has gone out in a digest.
// The UNIQUE filing_url is the hard guard against emailing the same filing
// twice — even if the notified_filings 24h Resend window has expired.
// Rows are written only when a digest_runs row transitions to "sent".
export const notifiedFilings = pgTable(
  "notified_filings",
  {
    id: serial("id").primaryKey(),
    filingUrl: text("filing_url").notNull().unique(),
    officialSlug: text("official_slug").notNull(),
    digestRunId: integer("digest_run_id").references(() => digestRuns.id, {
      onDelete: "set null",
    }),
    notifiedAt: timestamp("notified_at").defaultNow().notNull(),
  },
  (table) => [index("notified_filings_slug_idx").on(table.officialSlug)]
);

// ── EMAIL SENDS ──
// Per-recipient deliverability and audit log. One row per send, inserted by
// the send helpers in lib/email-send.ts. The Resend webhook updates
// status (delivered | bounced | complained) keyed on resendMessageId.
//
// kind: confirmation | welcome | digest | repermission | admin
//   All digest rows are per-recipient (resend.emails.send returns one
//   message id per address in the batch) — there are no campaign-level
//   broadcast rows here.
export const emailSends = pgTable(
  "email_sends",
  {
    id: serial("id").primaryKey(),
    // Every row is per-recipient now; batch.send returns per-address ids.
    email: text("email").notNull(),
    kind: text("kind").notNull(), // confirmation | welcome | digest | repermission | admin
    digestRunId: integer("digest_run_id").references(() => digestRuns.id, {
      onDelete: "set null",
    }),
    // Resend's message id; the webhook uses this to key delivery events.
    resendMessageId: text("resend_message_id"),
    status: text("status").default("sent").notNull(), // sent | delivered | bounced | complained
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Updated by Resend webhook when delivery status changes.
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_sends_email_idx").on(table.email),
    index("email_sends_kind_idx").on(table.kind),
  ]
);
