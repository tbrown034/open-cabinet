# Open Cabinet

An interactive financial disclosure and conflict-of-interest tracker for the executive branch.

Congress has well-known stock trackers like Capitol Trades and Quiver Quantitative. Executive branch officials file under the same STOCK Act rules — 30 to 45 days per trade — but their filings get far less scrutiny. Open Cabinet turns those filings into searchable timelines, compliance flags and company-level lookups.

**Live:** [open-cabinet.org](https://open-cabinet.org)

## What it does

- Tracks financial transactions filed by cabinet secretaries, agency heads and senior government officials
- Parses OGE filing PDFs into searchable, sortable data with D3 visualizations
- Flags late filings, tracks compliance and surfaces potential conflicts of interest

## Current data

| Metric | Value |
|--------|-------|
| Officials tracked | 39 |
| Transactions | 11,506 |
| Rows under review (not counted in totals) | 0 |
| Estimated value | ~$4.5B |
| Late filings | 7,745 |
| Companies searchable | 439 |
| News articles linked | 35 |
| Source filing PDFs linked | 189 |

Transaction counts, estimated value and late-filing totals exclude score-0 rows under review and three historical-report rows. The JSON and transaction CSV retain all 11,509 rows, including the 0 under review. JSON `transactionCount` is the counted total; `underReviewCount` and `historicalCount` are separate at both dataset and official level. The officials summary CSV uses the same exclusions and includes `under_review_count` and `historical_count`.

Current-roster views exclude former-administration profiles and rows explicitly marked `historical`. MacGregor's three 2020 transactions remain on her profile as history. Older trade dates in second-term reports remain included and labeled. Full downloads retain historical profiles, identified by `formerOfficial` in JSON and `former_official` in CSV.

The daily OGE monitor compares published URLs with the full index and flags newly missing listings. The weekly workflow also runs `pnpm check-sources`: it tests each saved transaction-report URL and prepares `data/meta/source-availability.json` for review. HTTP 404/410 means the original link is unavailable; timeouts and other failures remain unconfirmed. Neither check deletes saved rows or PDFs.

Every number in this table is checked against `public/data/full-dataset.json` by an automated test (`lib/readme-stats.test.ts`). CI fails if the table drifts from the published dataset.

Rows by verification state: 11,364 checked; 145 human_verified; 0 deterministic_agree; 0 two_models_agree; 0 audit_only; 0 single_read; 0 implausible; 0 disputed. Counts are checked against `data/meta/row-verification.json` at test time.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Directory | `/` | All officials with transaction counts, sortable, expandable |
| All Trades | `/all` | Swim lane chart — every transaction on one canvas with time filters |
| Companies | `/companies` | Search by ticker, see which officials traded each stock |
| Late Filings | `/late-filings` | Accountability page: who files late and what the law says |
| Overview | `/dashboard` | Aggregate buy/sell ratio, asset treemap, official rankings |
| Official Detail | `/officials/[slug]` | Transaction timeline, trade table, news coverage |
| Company Detail | `/companies/[ticker]` | Who in government trades this stock |
| About | `/about` | Methodology, legal basis, AI transparency, feedback form |
| Download | `/download` | CSV and JSON exports of the full dataset |
| Admin | `/admin` | Email management and operational history, plus older database-mirror stats and review panels (auth-gated) |

## Data source

All data comes from the U.S. Office of Government Ethics. Transaction reports (278-T Periodic Transaction Reports) are filed under the STOCK Act and the Ethics in Government Act ([5 U.S.C. Section 13107](https://www.law.cornell.edu/uscode/text/5/13107)). Federal government documents carry no copyright ([17 U.S.C. Section 105](https://www.law.cornell.edu/uscode/text/17/105)).

## Architecture

**Published transactions live in JSON files. PostgreSQL holds operational records and a separate transaction mirror.** Editing that database copy does not correct a transaction on the public website.

### Where information lives

| Location | What it contains | What uses it |
|----------|------------------|--------------|
| `data/officials/*.json` | One file per official, containing their information and transaction records | Public official pages and aggregate views |
| `data/meta/row-verification.json` | Saved check results for individual transactions | Verification labels, counting rules and Ask eligibility |
| `data/meta/asset-resolution.json` | Saved asset classifications and ticker decisions | Company grouping and ticker display, together with the name-verification rule |
| `public/data/` | Generated JSON and CSV downloads | Download page and bulk-data readers |
| PostgreSQL operational tables | Login sessions, subscriptions/follows, email delivery, pipeline history, Ask quotas and question logs | Interactive services and admin |
| PostgreSQL mirror tables | A separate copy of officials, transactions and news | Older admin stats, validation and DB review panels |

The official JSON files are the **source of truth**: the saved transaction records that publication and corrections are based on. The verification and asset files add checking and interpretation information alongside those records. They are joined by transaction IDs currently computed from the records.

The database mirror has a different schema and does not include all of that supporting information. `scripts/seed-from-json.ts` replaces its contents from JSON; this overwrites edits made through the DB review panel. The mirror's current freshness must be checked rather than assumed.

### How a transaction reaches a page

```
OGE filing PDF
    → extraction and checks
    → accepted transactions in data/officials/*.json
    → rebuild verification, asset information, index and downloads
    → review and publish the changes

Published JSON + saved verification/asset information
    → JavaScript selects, groups and counts records
    → Next.js pages and React/D3 charts
```

For example, [getOfficialBySlug in lib/data.ts](lib/data.ts) opens an official's JSON file. The [official detail page](app/officials/[slug]/page.tsx) selects transactions for the requested filters and displays them as table rows. Company pages use `getTradesByTicker` to group transactions from multiple officials using the saved asset decisions and name checks. These selections use JavaScript, not SQL queries against the mirror.

**JSON storage does not mean every page is built ahead of time.** Next.js can prepare static pages during a build, while the official detail page reads URL filters and renders on the server when requested. Both use the JSON records. React handles the interface; D3 supplies chart calculations.

Ask also calculates answers from eligible JSON transaction records, through [lib/published-rows.ts](lib/published-rows.ts). Its database use is for quotas, question logs and saved plans. Email alerts use the published filing data together with subscriptions and delivery history in PostgreSQL.

### Adding filings and making corrections

The current scheduled ingestion entrypoint is [scripts/ingest-new-filings.ts](scripts/ingest-new-filings.ts). It updates the JSON publication path. The older [scripts/pipeline.ts](scripts/pipeline.ts) writes the database mirror and is not the scheduled path. These commands are not interchangeable.

Adding a new filing and correcting an existing filing are different operations. [scripts/reverify.ts](scripts/reverify.ts) provides the candidate comparison/application workflow for existing filings. Ingestion, re-verification and review commands can write files or make paid calls depending on their options; invoking them through a coding assistant does not change those effects. The current tools remain available while their manual usage and recovery rules are reviewed.

## Data pipeline

Open Cabinet uses two scheduled paths:

1. **Monitor** — Vercel Cron polls the OGE API daily, diffs exact 278-T PDF URLs against tracked source filings, records the run and emails the result.
2. **Ingest** — GitHub Actions runs the static JSON ingest weekly (Mondays) or on demand, downloads new PDFs, parses them with Claude, checks them, regenerates exports and opens a PR for review.

The ingest path (`scripts/ingest-new-filings.ts`) runs seven stages. The entrypoint coordinates the work, with acquisition, reading and checking implemented in [lib/ingest-stages.ts](lib/ingest-stages.ts):

1. **Find** — the OGE API is diffed against the filings already tracked.
2. **Fetch** — the PDF is downloaded and hashed.
3. **Read** — the whole PDF goes to a vision model (Claude Sonnet) as a document; there is no text-extraction step in front of it. Every returned row passes a shape and enum check (`lib/filing-validation.ts`) whether it came from the model or from a cache. Caches are keyed on the PDF bytes, source URL, page range, prompt, parser version and model (`lib/parse-cache.ts`).
4. **Check** — where the PDF has a text layer, `pdftotext` plus a column parser reads the same table and the two lanes are compared row for row on type, date, amount, late flag and printed row numbers (`scripts/text-layer-crosscheck.ts`). A mismatch stops the filing. A scan is OCR-compared instead, and where no program can read the page a second company's model reads it; a third company's model then audits each row against the page image. Every verdict is written per row to `data/meta/row-verification.json` (`lib/row-verification.ts`), which the site, the exports and the methodology page render. An amended filing is always held for a person: OGE amendments substitute line items of an earlier report, and a machine that merged them would double-count.
5. **Merge** — rows are added to the official's JSON; identical rows a filing repeats are real trades and are kept.
6. **Validate** — `scripts/validate.ts` checks schema and golden files and reports anomalies.
7. **Publish** — a pull request is opened for a person to merge; the site and exports rebuild from the JSON.

### Company identity

Filings print names, not tickers. `lib/instrument-type.ts` types every row from the printed text (stock, ETF, mutual fund, preferred, corporate note, municipal bond, Treasury, crypto, private holding, option). `lib/asset-resolution.ts` then ties a stock or ETF row to a symbol only on exact evidence: a printed symbol whose listing carries the printed name, an exact name match on both the Nasdaq directory and the SEC issuer list, or a person's dictionary entry (`data/meta/asset-dictionary.json`, every entry with who decided and why). No similarity matching, no model guessing. A ticker is shown only when the row's printed name was also read the same way by an independent reader. Unresolved names publish under the printed name and wait in a queue (`scripts/asset-decide.ts`, `/admin/assets`). The result is `data/meta/asset-resolution.json`; the company pages, the official trade tables and the exports all read it through one rule (`publicTicker`).

The database mirror supports older admin panels. Email subscriptions and delivery records are separate operational tables; they are not copies of the published transaction files.

### Pipeline commands

```bash
pnpm run ingest-filings        # Update static JSON from new OGE PDF URLs (the scheduled path)
pnpm run plan-reparse          # List published filings a prompt change would re-read, with cost; never parses
pnpm run crosscheck-sweep      # Re-run the text-layer comparison over every filing; writes the log
pnpm run row-verification      # Rebuild the per-row verification record from every lane
pnpm run asset-resolution      # Type every row and tie stocks/ETFs to tickers on exact evidence
pnpm run pipeline              # DB mirror path (not scheduled): check, download, parse, insert
pnpm run pipeline -- --dry-run # Legacy path; still has DB, download, parsing and notification side effects
pnpm run check-filings -- --dry-run # URL-diff OGE without writing state
pnpm run validate              # Run validation suite against data
pnpm run parse-pdf <file>      # Parse a single PDF
pnpm run check-news            # News coverage search guidance
pnpm run seed                  # Replace the DB mirror from JSON; overwrites mirror edits
```

### Models and lanes

| Model | Provider | Role |
|-------|----------|------|
| Claude Sonnet 4.6 | Anthropic | First read of every filing page (vision) |
| GPT-6 Astra | OpenAI | Second read of scans no program could confirm, page images, paired by asset |
| Grok 4.6 | xAI | Page audit: shown each row and the page image, confirms or disputes |
| Claude Sonnet 5 | Anthropic | Summaries and digest ledes (never transaction data) |

Programs that never see a model's output: the text-layer comparison (pdftotext) and the OCR lane (tesseract) compare type, date, amount, late flag and printed row numbers row for row. Every paid call counts against a spend ceiling; crossing it stops the run and emails Trevor.

## Tech stack

- **Next.js 16** (App Router, static pages and request-time server rendering)
- **React 19** + **TypeScript**
- **D3.js** v7 sub-modules for all visualizations
- **Tailwind CSS 4**
- **Neon PostgreSQL** (serverless) + **Drizzle ORM**
- **Better Auth** with Google OAuth (admin panel)
- **Anthropic SDK** + **OpenAI SDK** for PDF parsing
- **Resend** for email notifications
- **Vercel** (Pro) for hosting and lightweight cron monitoring
- **GitHub Actions** for weekly pipeline ingest and PR creation
- **pnpm** for package management

## Setup

```bash
git clone https://github.com/tbrown034/open-cabinet.git
cd open-cabinet
pnpm install
cp .env.example .env.local  # Fill in your API keys
pnpm dev                    # http://localhost:3003
```

### Environment variables

See `.env.example` for the full list. Required:

- `ANTHROPIC_API_KEY` — Claude API for PDF parsing
- `OPENAI_API_KEY` — Cross-provider verification (optional)
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Neon PostgreSQL
- `BETTER_AUTH_SECRET` — Session signing
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Admin OAuth
- `RESEND_API_KEY` — Email notifications
- `CRON_SECRET` — Vercel Cron authentication

## Research

The local `research/` directory contains historical working briefs covering:

1. STOCK Act and federal ethics law
2. Case law and legal precedent
3. News coverage of executive branch financial conflicts
4. OGE structure and data landscape
5. Late filing patterns and enforcement
6. The divestiture process

These private working documents are ignored by Git and are not included in a fresh clone. They are not required to run tests. Use the architecture and pipeline sections above to understand the current implementation; historical research should not be treated as a current operating guide.

## Tests and CI

```bash
pnpm test             # Vitest unit tests (digest scoping, alert tokens,
                      # office-line formatting, README stats vs dataset)
pnpm lint             # ESLint (app and lib; scripts/ excluded by design)
pnpm typecheck        # tsc --noEmit across app, lib and scripts
```

GitHub Actions runs all three on every push and pull request (`.github/workflows/ci.yml`). A second workflow (`oge-pipeline.yml`) runs the weekly OGE ingest and opens a data PR when new filings appear.

## Quality assurance

```bash
pnpm run validate     # Schema + golden file regression tests
/copy-review          # AP style + journalism ethics audit (Claude Code command)
/anomaly-check        # Data quality + contextual anomaly detection
```

## Legal

This tool aggregates public records. The Ethics in Government Act's [news media exception](https://www.law.cornell.edu/uscode/text/5/13107) explicitly permits dissemination of financial disclosures to the general public. Multiple for-profit companies (Capitol Trades, Quiver Quantitative, Unusual Whales) operate similarly with congressional data. No enforcement action has ever been brought against a disclosure aggregator.

For informational and journalism purposes only. Not investment advice.

## AI transparency

- **PDF parsing**: Claude Sonnet (default) with OpenAI cross-verification
- **Official summaries**: AI-generated from transaction data, reviewed for accuracy
- **News coverage**: AI-assisted search, all linked articles are real published pieces
- **Codebase**: Built by Trevor Brown with the assistance of Claude Code
- **What AI does NOT do**: No fabricated data, no editorial judgments, no decisions about who to track

See the [About page](https://open-cabinet.org/about) for full AI transparency disclosure.

## Contributing

Found a data error? [Open an issue](https://github.com/tbrown034/open-cabinet/issues) or use the [feedback form](https://open-cabinet.org/about) on the site.

## License

[MIT](LICENSE)

## Built by

[Trevor Brown](https://trevorthewebdeveloper.com) — investigative data journalist turned web developer. 15 years of political reporting including six years covering elections, dark money, financial disclosures and government accountability at Oklahoma Watch. Built a statewide financial disclosure database for Oklahoma.

[GitHub](https://github.com/tbrown034) · [Portfolio](https://trevorthewebdeveloper.com) · [Email](mailto:trevorbrown.web@gmail.com)
