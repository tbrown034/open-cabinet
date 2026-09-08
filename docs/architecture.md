# How Open Cabinet works

Open Cabinet turns executive-branch financial disclosure PDFs into searchable transaction records. The website reads published JSON. PostgreSQL supports accounts, subscriptions, email delivery and other changing operational state.

## Follow one transaction

1. **Find the filing.** `lib/oge-filings.ts` reads OGE's index and identifies filing URLs. `scripts/ingest-new-filings.ts` coordinates ingestion.
2. **Read the PDF.** `lib/ingest-stages.ts` fetches and prepares it; `scripts/parse-pdf.ts` contains the model request and extraction contract. The proposed rows are ordinary JavaScript objects.
3. **Check the proposed rows.** `lib/validation/parsed-rows.ts` checks their shape and allowed values. Other readers compare the values with the document: text extraction, OCR, a second model and a page audit. Shape validation alone cannot establish that a value is true.
4. **Save accepted records.** The ingest command writes `data/officials/<slug>.json`. Corrections to existing filings use a separate review workflow; they should not be appended as new filings.
5. **Build supporting information.** Verification and asset builders write files under `data/meta/`; the export builder writes `public/data/`.
6. **Review and publish.** GitHub Actions prepares a pull request. Merging it starts Vercel's build and deployment.
7. **Render a page.** `lib/data.ts` reads the JSON and selects or groups rows. Next.js builds the page; React renders the interface and D3 calculates chart positions and scales.

## Where to look

| If you want to understand… | Start here |
|---|---|
| A page or URL | `app/`: `page.tsx` is a page; `route.ts` is an API endpoint |
| Charts and shared interface pieces | `app/components/` |
| Reading public transactions and grouping by ticker | `lib/data.ts` |
| **Validation rules** | **`lib/validation/`**: `parsed-rows.ts` for proposed rows; `published-data.ts` for the saved dataset |
| Running validation | `scripts/validate.ts`, a short CLI calling the validation module |
| Ingesting a new filing | `scripts/ingest-new-filings.ts` → `lib/ingest-stages.ts` |
| PDF model requests and prompts | `scripts/parse-pdf.ts` |
| PDF page splitting and Claude request-size checks | `lib/pdf/` |
| Cached extraction responses | `lib/parse-cache.ts` |
| Independent evidence | `lib/text-layer-parser.ts`, `lib/ocr-lane.ts`, `lib/second-read.ts`, `lib/grok-audit.ts` |
| Public verification labels | `lib/row-verification.ts`; builder: `scripts/build-row-verification.ts` |
| Asset classification and ticker decisions | `lib/instrument-type.ts`, `lib/asset-resolution.ts`, `lib/asset-reference.ts` |
| Corrections to existing filings | `scripts/reverify.ts`, `lib/reverify-diff.ts`, `app/admin/review/` |
| Asking questions about the data | `app/api/ask/route.ts`, `lib/ask/`, `lib/published-rows.ts` |
| Database access and table definitions | `lib/db.ts` (`getDb`), `lib/schema.ts`, `lib/auth-schema.ts` |
| Login and admin checks | `lib/auth.ts` (`getAuth`, `requireAdmin`); some local review surfaces have separate gates |
| Email subscriptions and digests | `app/api/alerts/`, `app/api/admin/digest/`, `lib/digest.ts` |
| Scheduled work | `.github/workflows/oge-pipeline.yml`, `app/api/cron/route.ts`, `vercel.json` |
| Tests | Next to the code as `*.test.ts`; CI is `.github/workflows/ci.yml` |

`lib/` means reusable application code; it is not a single subsystem. Validation, PDF preparation and Ask have named subfolders. Other domains still have explicit filenames directly under `lib/`; reorganize them in tested batches rather than moving everything at once. `scripts/` contains runnable commands, including older maintenance tools. Read the command's effects before executing it.

## How the files connect without SQL

An official file contains the transaction's description, date, type, amount range and source URL. Two supporting files add information:

- `data/meta/asset-resolution.json`: what instrument/ticker a row has been matched to.
- `data/meta/row-verification.json`: what evidence supports a row and its public label.

The code computes a transaction ID from its contents and occurrence. That ID looks up entries in both supporting files. Company pages group transactions by their resolved ticker; there is no public company database table driving these pages.

This keeps published data reviewable in Git. The tradeoff is that changing a transaction's contents can change its ID and detach old decisions. A future stored ID must preserve identity while a separate content version invalidates outdated checks. That migration has not happened.

## What PostgreSQL does

PostgreSQL stores state that changes through requests: sessions, subscriptions, email sends, pipeline runs and Ask quotas/logs/plans. `getDb()` creates and reuses the Drizzle client on first use. `getAuth()` also initializes on demand, so importing the application does not immediately require a live database configuration.

The old mirror import, reseed, stats, validation and database review tools have been retired. Historical mirror tables and schema declarations remain pending an explicit database migration. Admin still manages email, monitor history, source checks and Ask activity. The file-based correction/review workflow remains available.

## How a failed filing gets another attempt

The monitor remembers URLs it has seen in `data/meta/last-check.json`. Ingestion instead reads `sourceFilings` in `data/officials/*.json`: those entries are saved alongside accepted rows, even when deduplication adds no new transactions. Seeing or downloading a PDF never marks it imported. Failed and held filings remain candidates on a later normal ingest run; saved filings are skipped.

This uses existing source provenance rather than adding another database or job ledger. It does not automatically repair damaged files, bypass human holds, or publish partial results. Explicit `--from-file` plans still need careful review.

## Rendering and the AI boundary

### Which rows count

Public transaction totals use `officialForTotals` in `lib/data.ts`, which applies `rowsForTotals` from `lib/format.ts`. It excludes historical-report rows and score-0 rows marked Under review. Scores 1–3 and rows without a saved verdict still count under the existing policy; counted does not mean fully verified. Ask has a stricter evidence policy of its own.

The homepage, Overview, All Trades, Late Filings, aggregate methodology comparison and share card use that same counted view. Company and official totals use the same row rule within their own scope. Under-review rows stay in official/company tables and downloads. The All Trades chart plots only dated, counted rows; its headline also includes counted rows whose dates are unknown. Methodology's evidence-coverage statistics deliberately inspect the full dataset, including disputed rows.

Many pages are generated during the build. Official pages use URL filters and render on request. Both paths read the same published files. Interactive charts run browser JavaScript; D3 calculates geometry while React renders the elements.

Ask translates a question into a constrained plan, checks it and calculates results from eligible published rows. It does not execute arbitrary model-written SQL against the mirror. Models also help read PDFs and draft optional narrative text. Keep three ideas distinct: the filed values, the saved evidence about those values, and the narrative describing them.

Ask caches only validated question translations tagged for the same official-page scope, model, UTC date and cache-contract version. Old untagged logs and follow-up logs are not reused as translations. Every cached plan is validated and executed again against current rows; this cannot prove that a model interpreted a question correctly.

Ask accepts question text and optional official-page scope only. Example buttons fill the input; submitting the form runs the question. Answers preserve the submitted wording and show the interpreted query. Browser-supplied plans and retired follow-up tokens are rejected. There is no separate follow-up execution path. The intent gate refuses histories that require joining separate purchases and sales, including “never sold” and “only bought.” The planner prompt explains this boundary too. A changed prompt contract increments the cache version so old translations are not reused.

Reader-facing answers use ordinary transaction language; verification policy remains in Methodology and answer details. Pending records, if any appear, are still excluded from Ask and explained. Model planning has a 20-second SDK timeout with retries disabled; an unavailable service offers retry or direct browsing. Feedback only acknowledges a successful database update.

## Limits worth explaining honestly

Verification labels describe evidence, not guaranteed accuracy. Amounts are disclosure ranges; dollar totals generally use estimates. Report scope differs from transaction date. Company matching can be uncertain, especially for share classes. Validation and tests catch specified errors; they do not independently recheck every PDF.

The highest remaining maintenance work is ingestion recovery/amendments, verification precedence, stable row identity, database migration reproducibility, and Ask/email failure handling. The working architecture does not require a rewrite to address those issues.
