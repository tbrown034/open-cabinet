# Open Cabinet

An interactive financial disclosure and conflict-of-interest tracker for the executive branch.

Congress has well-known stock trackers like Capitol Trades and Quiver Quantitative. Executive branch officials file under the same STOCK Act rules — 30 to 45 days per trade — but their filings get far less scrutiny. Open Cabinet turns those filings into searchable timelines, compliance flags and company-level lookups.

**Live:** [open-cabinet.org](https://open-cabinet.org)

**Start here:** [Architecture and file map](docs/architecture.md) · [Maintenance commands and debugging](docs/maintenance.md)

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
| Companies searchable | 1,182 |
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
| Admin | `/admin` | Email management, filing monitor history, source checks and Ask activity (auth-gated) |

## Data source

All data comes from the U.S. Office of Government Ethics. Transaction reports (278-T Periodic Transaction Reports) are filed under the STOCK Act and the Ethics in Government Act ([5 U.S.C. Section 13107](https://www.law.cornell.edu/uscode/text/5/13107)). Federal government documents carry no copyright ([17 U.S.C. Section 105](https://www.law.cornell.edu/uscode/text/17/105)).

## Architecture

**Published transactions live in JSON files. PostgreSQL powers login, emails and operational records.** Corrections to public transactions are reviewed changes to the JSON.

### Where information lives

| Location | What it contains | What uses it |
|----------|------------------|--------------|
| `data/officials/*.json` | One file per official, containing their information and transaction records | Public official pages and aggregate views |
| `data/meta/row-verification.json` | Saved check results for individual transactions | Verification labels, counting rules and Ask eligibility |
| `data/meta/asset-resolution.json` | Saved asset classifications and ticker decisions | Company grouping and ticker display, together with the name-verification rule |
| `public/data/` | Generated JSON and CSV downloads | Download page and bulk-data readers |
| PostgreSQL operational tables | Login sessions, subscriptions/follows, email delivery, pipeline history, Ask quotas and question logs | Interactive services and admin |
| Retired PostgreSQL mirror tables | Historical copies of officials, transactions and news | No current application workflow; retained pending separate database cleanup |

The official JSON files are the **source of truth**: the saved transaction records that publication and corrections are based on. The verification and asset files add checking and interpretation information alongside those records. They are joined by transaction IDs currently computed from the records.

The older database-mirror import, reseed and admin-edit tools have been removed. Existing mirror tables and their schema declarations remain to preserve historical data and avoid an implicit table drop; database removal requires a separate migration review.

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

The scheduled and manual JSON ingestion entrypoint is [scripts/ingest-new-filings.ts](scripts/ingest-new-filings.ts), run with `pnpm ingest-filings`. The retired `pipeline` and `seed` commands are no longer available.

Adding a new filing and correcting an existing filing are different operations. [scripts/reverify.ts](scripts/reverify.ts) provides the candidate comparison/application workflow for existing filings. Ingestion, re-verification and review commands can write files or make paid calls depending on their options; invoking them through a coding assistant does not change those effects. The current tools remain available while their manual usage and recovery rules are reviewed.

## Data pipeline

Open Cabinet uses two scheduled paths:

1. **Monitor** — Vercel Cron polls the OGE API daily, compares 278-T PDF URLs with previously discovered/imported URLs, records the run and sends notifications when needed. Discovery is not proof of import.
2. **Ingest** — GitHub Actions runs the static JSON ingest weekly (Mondays) or on demand, downloads new PDFs, parses them with Claude, checks them, regenerates exports and opens a PR for review.

The ingest path (`scripts/ingest-new-filings.ts`) runs seven stages. The entrypoint coordinates the work, with acquisition, reading and checking implemented in [lib/ingest-stages.ts](lib/ingest-stages.ts):

1. **Find** — compare the OGE API with `sourceFilings` in official JSON. A discovered, failed or held filing stays eligible until its source entry is saved with the accepted import.
2. **Fetch** — the PDF is downloaded and hashed.
3. **Read** — the PDF, split into page ranges when needed, goes to a vision model (Claude Sonnet) as a document; there is no text-extraction step in front of it. Every returned row passes a shape and enum check (`lib/validation/parsed-rows.ts`) whether it came from the model or from a cache. Caches are keyed on the PDF bytes, source URL, page range, prompt, parser version and model (`lib/parse-cache.ts`).
4. **Check** — text extraction, OCR, a second model and a page audit provide separate evidence about the proposed rows. `lib/ingest-stages.ts` decides whether to hold or merge a filing; `lib/row-verification.ts` later builds the public row labels. These are separate decisions, and agreement is evidence, not a guarantee of accuracy.
5. **Merge** — accepted rows are added to the official JSON. This path handles new filings; it is not a replacement workflow for correcting existing records.
6. **Validate** — `pnpm validate` runs the checks in [lib/validation/published-data.ts](lib/validation/published-data.ts). A failure or review-required result stops the workflow.
7. **Publish** — the workflow rebuilds supporting files and downloads, then opens a pull request for review. Merging triggers the Vercel deployment.

Amendments, partial-run recovery and cross-filing duplicate handling still need hardening. In particular, a hand-written `--from-file` plan does not retain all the OGE metadata used by the normal discovery path. Review the [maintenance guide](docs/maintenance.md) before adding or correcting data.

### Company identity

The filed description and the company interpretation are separate. [lib/instrument-type.ts](lib/instrument-type.ts) classifies the instrument; [lib/asset-resolution.ts](lib/asset-resolution.ts) matches it against saved exchange/SEC reference lists and human dictionary decisions. The result is saved in `data/meta/asset-resolution.json`.

`publicTicker` combines that decision with evidence about the printed name. [getTradesByTicker](lib/data.ts) groups accepted symbols into company views. Unresolved rows keep their filed descriptions. Share classes, ambiguous names and evidence precedence remain areas for careful review; an inferred ticker is not a value copied directly from the filing.

Email subscriptions and delivery records remain in PostgreSQL. Removing mirror tools does not change those services or the JSON-backed review workflow.

### Pipeline commands

```bash
pnpm run ingest-filings        # Update static JSON from new OGE PDF URLs (the scheduled path)
pnpm run plan-reparse          # List published filings a prompt change would re-read, with cost; never parses
pnpm run crosscheck-sweep      # Re-run the text-layer comparison over every filing; writes the log
pnpm run row-verification      # Rebuild the per-row verification record from every lane
pnpm run asset-resolution      # Type every row and tie stocks/ETFs to tickers on exact evidence
pnpm run check-filings -- --dry-run # URL-diff OGE without writing state
pnpm run validate              # Run validation suite against data
pnpm run parse-pdf <file>      # Parse a single PDF
pnpm run check-news            # News coverage search guidance
```

### Models and evidence

| Task | Configuration and implementation |
|------|----------------------------------|
| Primary PDF extraction | `scripts/parse-pdf.ts` (`DEFAULT_MODEL`, prompt and pricing configuration) |
| Independent second read | `lib/second-read.ts` (`SECOND_READ_MODEL`) |
| Page-image audit | `lib/grok-audit.ts` (`GROK_AUDIT_MODEL`) |
| Official summaries | `scripts/refresh-summaries.ts` (deterministic and model-drafted modes) |
| Optional digest introduction | `scripts/generate-digest-lede.ts` |

Text-layer parsing and OCR provide additional comparisons. The code records model usage and has spending controls, but those controls still need stronger retry accounting; estimate and approve paid runs before executing them. Cached responses avoid another call only when the cache matches the requested inputs.

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

See `.env.example` for the main settings. Public JSON pages and ordinary tests do not need live service credentials. Enable credentials only for the features you intend to run:

- `ANTHROPIC_API_KEY` — Claude API for PDF parsing
- `OPENAI_API_KEY` — Independent second-model verification
- `GROK_API_KEY` — Page-image auditing in the ingestion gate
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Neon PostgreSQL
- `BETTER_AUTH_SECRET` — Session signing
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Admin OAuth
- `RESEND_API_KEY` — Email notifications
- `CRON_SECRET` — Vercel Cron authentication

## Tests and CI

```bash
pnpm test             # Vitest unit tests (digest scoping, alert tokens,
                      # office-line formatting, README stats vs dataset)
pnpm lint             # ESLint (app and lib; scripts/ excluded by design)
pnpm typecheck        # tsc --noEmit across app, lib and scripts
```

GitHub Actions runs all three for pull requests and pushes to `main` (`.github/workflows/ci.yml`). The separate weekly workflow (`oge-pipeline.yml`) opens or updates a data PR when generated files change. Timestamp-only changes can still produce unnecessary PR updates.

## Data checks

```bash
pnpm validate         # Published-data rules and reference fixtures; no model or DB calls
pnpm test:data        # Current export/data regression checks
```

Validation checks consistency and known examples. It does not prove every value matches its PDF. The [maintenance guide](docs/maintenance.md) explains the checks and their limits.

## Legal

This tool aggregates public records. The Ethics in Government Act's [news media exception](https://www.law.cornell.edu/uscode/text/5/13107) explicitly permits dissemination of financial disclosures to the general public. Multiple for-profit companies (Capitol Trades, Quiver Quantitative, Unusual Whales) operate similarly with congressional data. No enforcement action has ever been brought against a disclosure aggregator.

For informational and journalism purposes only. Not investment advice.

## Extraction transparency

Models propose transaction records and can draft narrative text. Separate checks, source links and human review support those outputs; a model's confidence number is not an accuracy percentage. News links are curated manually; `check-news` prints search guidance rather than running an automated news search.

See the [About page](https://open-cabinet.org/about) for the public disclosure of these methods.

## Contributing

Found a data error? [Open an issue](https://github.com/tbrown034/open-cabinet/issues) or use the [feedback form](https://open-cabinet.org/about) on the site.

## License

[MIT](LICENSE)

## Built by

[Trevor Brown](https://trevorthewebdeveloper.com) — investigative data journalist turned web developer. 15 years of political reporting including six years covering elections, dark money, financial disclosures and government accountability at Oklahoma Watch. Built a statewide financial disclosure database for Oklahoma.

[GitHub](https://github.com/tbrown034) · [Portfolio](https://trevorthewebdeveloper.com) · [Email](mailto:trevorbrown.web@gmail.com)
