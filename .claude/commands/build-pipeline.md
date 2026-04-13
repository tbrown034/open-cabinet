# Build the Open Cabinet Automated Data Pipeline

You are building the full automated data pipeline for Open Cabinet, an executive branch stock trade tracker. This is a journalism tool — accuracy, transparency, and verifiability are non-negotiable.

Read `CLAUDE.md` fully before starting. Read `lib/data.ts`, `lib/types.ts`, `lib/format.ts`, `lib/auth.ts`, `lib/auth-schema.ts`, and all files in `scripts/` to understand the current codebase.

## Current State

- **29-34 officials** with ~2,200 transactions stored as static JSON in `data/officials/{slug}.json`
- **3 existing scripts**: `check-new-filings.ts` (polls OGE API), `rebuild-index.ts`, `generate-exports.ts`
- **Neon PostgreSQL** already configured for Better Auth (user/session/account/verification tables)
- **Drizzle ORM** configured in `drizzle.config.ts`, schema in `lib/auth-schema.ts`
- **ANTHROPIC_API_KEY** in `.env.local` (for Claude API PDF parsing)
- **No automated parsing** — all transaction data was manually parsed during the April 11 build sessions
- **No cron/scheduling** — scripts are manual only
- **OGE API**: `https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest` — no auth, no rate limiting, 16,857 records, paginate with `start` and `length`

## What to Build (in order)

### Phase 1: Database Schema & Migration

Design and migrate the transaction data into the existing Neon PostgreSQL database alongside the auth tables.

**Schema (add to a new `lib/schema.ts`, keep `lib/auth-schema.ts` separate):**

```
officials
├── id (serial pk)
├── name (text, not null) — "Trump, Donald J."
├── slug (text, unique, not null) — "trump-donald-j"
├── title (text) — "President of the United States"
├── agency (text)
├── level (text) — "Cabinet", "Sub-Cabinet"
├── party (text) — "R", "D", "I"
├── photoUrl (text, nullable)
├── summary (text, nullable) — AI-generated summary
├── nominatedDate (date, nullable)
├── confirmedDate (date, nullable)
├── createdAt (timestamp, default now)
├── updatedAt (timestamp)

transactions
├── id (serial pk)
├── officialId (integer, fk → officials.id, not null)
├── description (text, not null) — "BANK OF AMERICA CORPORATION CONV PFD SER L 7.250%"
├── ticker (text, nullable) — "BAC"
├── type (text, not null) — "Sale", "Purchase", "Sale (Partial)", "Sale (Full)", "Exchange"
├── date (date, not null)
├── amount (text, not null) — "$1,001-$15,000" (exact OGE range string)
├── lateFilingFlag (boolean, default false)
├── pdfSource (text, nullable) — URL of the source PDF
├── confidence (real, nullable) — parser confidence 0-1
├── needsReview (boolean, default false)
├── createdAt (timestamp, default now)
├── UNIQUE(officialId, description, date, amount, type)

news_coverage
├── id (serial pk)
├── officialSlug (text, not null)
├── headline (text, not null)
├── source (text, not null) — "ProPublica", "CNBC"
├── date (date, not null)
├── url (text, not null)
├── relevance (text) — one-sentence context
├── createdAt (timestamp, default now)

pipeline_runs
├── id (serial pk)
├── ranAt (timestamp, default now)
├── trigger (text) — "cron", "manual", "admin"
├── status (text) — "running", "completed", "failed"
├── newFilingsFound (integer, default 0)
├── newTransactionsParsed (integer, default 0)
├── errors (jsonb, nullable)
├── duration (integer, nullable) — milliseconds
├── completedAt (timestamp, nullable)

validation_results
├── id (serial pk)
├── pipelineRunId (integer, fk → pipeline_runs.id, nullable)
├── ranAt (timestamp, default now)
├── totalTransactions (integer)
├── schemaFailures (integer)
├── unknownTickers (integer)
├── goldenFilesPassed (integer)
├── goldenFilesTotal (integer)
├── flaggedForReview (integer)
├── report (jsonb) — full validation report
```

**Steps:**
1. Create `lib/schema.ts` with Drizzle table definitions
2. Update `drizzle.config.ts` to include both schema files
3. Run `pnpm drizzle-kit generate` then `pnpm drizzle-kit migrate`
4. Create `scripts/seed-from-json.ts` that reads all JSON files in `data/officials/` and inserts into the DB
5. Also seed `news_coverage` from `data/news-coverage.json`
6. Update `lib/data.ts` to query the database instead of reading JSON files
7. Verify all pages still render correctly with DB-backed data

**Keep the JSON files** — they become the archive/backup. The DB is now the source of truth for the live site.

### Phase 2: PDF Parser with Claude API

Build `scripts/parse-pdf.ts` — the core parsing script.

**How it works:**
1. Takes a PDF file path (or URL) as input
2. Downloads the PDF if it's a URL
3. Sends the PDF to Claude API (use `claude-haiku-4-5-20251001` for cost efficiency)
4. Claude extracts every transaction row from the 278-T table
5. Returns structured JSON matching the `transactions` schema
6. Each transaction gets a confidence score (0-1) from the parser

**Claude API prompt for parsing (embed this in the script):**

```
You are parsing a U.S. Office of Government Ethics Form 278-T (Periodic Transaction Report).

Extract every transaction from the table. For each transaction, return:
- description: the full asset name as written (e.g., "BANK OF AMERICA CORPORATION CONV PFD SER L 7.250%")
- ticker: the stock ticker if present in parentheses like "(AAPL)", otherwise null
- type: exactly one of "Sale", "Purchase", "Sale (Partial)", "Sale (Full)", "Exchange"
- date: the transaction date in YYYY-MM-DD format
- amount: the exact amount range string (e.g., "$1,001-$15,000", "$50,001-$100,000", "Over $50,000,000")
- lateFilingFlag: true if "Notification Received Over 30 Days Ago" is Yes, false otherwise
- confidence: your confidence in this extraction (0.0 to 1.0)

Valid amount ranges (use these EXACTLY):
- $1,001-$15,000
- $15,001-$50,000
- $50,001-$100,000
- $100,001-$250,000
- $250,001-$500,000
- $500,001-$1,000,000
- $1,000,001-$5,000,000
- $5,000,001-$25,000,000
- $25,000,001-$50,000,000
- Over $50,000,000

If a value is unclear or the PDF quality is poor, set confidence below 0.8 and include your best guess.

Return a JSON array of transactions. Nothing else.
```

**Important implementation details:**
- Use the Anthropic SDK (`@anthropic-ai/sdk`), which should already be a dependency or add it
- Send the PDF as a base64-encoded document in the message
- Rate limit: 2-second delay between API calls
- Cost tracking: log token usage per parse so we know what the pipeline costs
- If a PDF fails to parse, log the error and mark the pipeline run accordingly

### Phase 3: Validation & Verification System

Build `scripts/validate.ts` — the trust backbone.

**Layer 1: Schema validation (every transaction)**
- `type` must be one of the 5 valid types
- `amount` must be one of the 10 valid OGE ranges
- `date` must be a valid date, not in the future, not before 2020
- `description` must be non-empty
- `lateFilingFlag` must be boolean
- `ticker` if present must be 1-5 uppercase letters

**Layer 2: Ticker validation**
- Maintain a list of known NYSE/NASDAQ tickers (fetch from a public API or use a static list)
- Flag unknown tickers as `needsReview = true` (don't reject — some are OTC or preferred shares)
- Log: "12 unknown tickers flagged for review"

**Layer 3: Count verification**
- Query OGE API for each official's 278-T filing count
- Compare against our parsed PDF count
- Flag discrepancies: "Bedford: API says 5 filings, we have 4 parsed"

**Layer 4: Golden file regression tests**
- Create `data/golden/` directory
- For 5-10 representative PDFs (varying complexity), create a `{name}.golden.json` with the MANUALLY VERIFIED correct output
- On every validation run, re-parse these PDFs and diff against golden files
- Report field-level accuracy: descriptions, tickers, types, dates, amounts, flags
- ANY golden file regression is a blocking failure — don't deploy with broken parsing

Start with golden files for these PDFs (varied complexity):
- A Trump PDF (messy, many transactions, OCR quality issues)
- A Bisignano PDF (dense, high-value transactions)
- A Bessent PDF (simple, few transactions)
- A Kratsios PDF (multiple filings)
- A single-transaction filing (Bondi or Hegseth)

**Layer 5: Confidence flagging**
- Any transaction with `confidence < 0.8` gets `needsReview = true`
- These show up in the admin dashboard "Needs Review" queue

**Layer 6: Anomaly detection**
- More than 100 transactions from a single PDF → flag
- Transaction date outside the filing's expected period → flag
- Same transaction appearing in multiple PDFs (amended filing) → deduplicate

**Output:** The validation script writes results to `validation_results` table AND outputs a human-readable report to stdout:

```
=== Open Cabinet Validation Report ===
Transactions validated: 2,283
Schema failures: 0
Unknown tickers: 12 (flagged for review)
Count check: 34/34 officials match OGE API
Golden files: 5/5 passed (487/487 fields match)
Low-confidence transactions: 3 (flagged for review)
Anomalies: 1 (Trump PDF #7: 89 transactions, within bounds)

Result: PASS
```

### Phase 4: Pipeline Orchestrator

Build `scripts/pipeline.ts` — chains everything together.

```
1. Create a pipeline_runs record (status: "running")
2. Run check-new-filings logic:
   - Hit OGE API
   - Diff against known filings in DB
   - Download any new PDFs to data/pdfs/
3. For each new PDF:
   - Parse with Claude API (parse-pdf.ts)
   - Match official by name → get officialId from DB
   - Insert transactions (ON CONFLICT skip duplicates)
   - If new official not in DB, create them
4. Run validation (validate.ts)
   - If golden file regression fails → mark pipeline run as "failed", stop
   - If schema failures → log but continue
5. Update pipeline_runs record (status: "completed", counts, duration)
6. Regenerate CSV/JSON exports (generate-exports.ts logic, now from DB)
```

**Package script:** `pnpm run pipeline`

**Error handling:** Never silently fail. Every error gets logged to the pipeline_runs.errors jsonb field. Failed parses don't block the whole run — they're logged and the pipeline continues with the next PDF.

### Phase 5: API Routes for Cron & Admin

**Cron endpoint: `app/api/cron/route.ts`**
- POST handler that runs the pipeline
- Protected by a `CRON_SECRET` env var (Vercel Cron sends this header)
- Returns JSON: `{ status, newFilings, newTransactions, duration }`

**Vercel cron config in `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "0 10 * * *"
    }
  ]
}
```
This runs daily at 10 AM UTC (6 AM ET).

**Admin API routes:**

`app/api/admin/pipeline/route.ts`
- POST: manually trigger a pipeline run
- GET: return recent pipeline_runs with stats

`app/api/admin/transactions/route.ts`
- GET: list transactions with filters (needsReview, officialId, dateRange)
- PATCH: update a transaction (edit description, ticker, flag)
- DELETE: remove a bad transaction

`app/api/admin/validate/route.ts`
- POST: run validation and return report

All admin routes must check `isAdmin(session.user.email)` before executing.

### Phase 6: Admin Dashboard UI

Expand `app/admin/page.tsx` into a real control panel. This is auth-gated (already set up).

**Sections:**

1. **Pipeline Status**
   - Last run time, status, counts
   - "Run Pipeline Now" button (calls POST /api/admin/pipeline)
   - Recent run history (last 10 runs with expandable error details)

2. **Needs Review Queue**
   - Transactions where `needsReview = true` or `confidence < 0.8`
   - Show: official name, description, parsed values, link to source PDF
   - Actions: Approve (clears flag), Edit (inline edit fields), Delete
   - Count badge in the admin nav: "3 items need review"

3. **Data Quality Dashboard**
   - Latest validation report summary
   - "Run Validation" button
   - Golden file test status (green/red per file)
   - Chart: parse accuracy over time (from validation_results history)

4. **Officials Management**
   - List all officials with transaction counts
   - Edit metadata (title, agency, photo URL)
   - "Missing photo" indicator

5. **News Management**
   - List/add/edit/delete news articles
   - Form: official, headline, source, date, URL, relevance

### Phase 7: Methodology Page

Update `app/about/page.tsx` (or create a dedicated `/methodology` route) with a transparent explanation of the data pipeline. This is journalism — methodology is credibility.

**Content to include:**

```
## How We Get the Data

1. The OGE publishes financial disclosure PDFs on their public portal
2. We poll the OGE API daily for new 278-T filings
3. New PDFs are downloaded and parsed using AI (Claude API)
4. Every parsed transaction is validated against structural rules
5. A regression test suite compares parser output against manually verified "golden" files
6. Transactions with low parser confidence are flagged for human review

## Accuracy

In testing against [N] manually verified filings ([N] transactions), the parser achieved:
- [X]% accuracy on asset descriptions
- [X]% accuracy on transaction types
- [X]% accuracy on dates
- [X]% accuracy on amount ranges
- [X]% accuracy on late filing flags

[These numbers should be computed by the validation suite — do NOT fabricate them. Leave as placeholders until real golden file tests are run.]

## Limitations

- Transaction values are reported in ranges, not exact amounts. Our "estimated value" uses the midpoint of each range.
- Not all executive branch officials are included. [Coverage note explaining public vs. request-only PDFs.]
- AI parsing may occasionally misread asset descriptions, especially from low-quality PDF scans. All source PDFs are linked from each official's profile page for verification.

## Corrections

If you find an error, [open a GitHub issue / contact us]. We will correct the data and document the fix.
```

## Technical Standards

- **Never fabricate data.** If the parser isn't sure, flag it — don't guess.
- **Rate limit everything.** 2-second delays between OGE API calls and Claude API calls.
- **Log costs.** Track Claude API token usage per pipeline run.
- **Keep JSON archives.** The `data/officials/` JSON files remain as the historical record of what was parsed.
- **Test before deploying.** The validation suite must pass before any deploy.
- **Deduplicate aggressively.** Amended filings restate transactions. The UNIQUE constraint on (officialId, description, date, amount, type) handles this at the DB level.

## Verification Checklist

Before considering this complete, verify:
- [ ] All existing pages render correctly with DB-backed data
- [ ] Seed script successfully imports all JSON data into Neon
- [ ] PDF parser correctly handles at least 5 different PDF formats
- [ ] Golden file tests pass at >95% field-level accuracy
- [ ] Validation script catches intentionally bad data (test with a corrupt input)
- [ ] Pipeline runs end-to-end: OGE check → download → parse → validate → DB insert
- [ ] Admin dashboard shows pipeline status and review queue
- [ ] Cron endpoint works when called with the correct secret
- [ ] Methodology page accurately describes the process (no fabricated accuracy numbers)
- [ ] Original PDFs are linked from official profile pages
