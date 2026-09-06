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
| Transactions | 11,494 |
| Rows under review (not counted in totals) | 20 |
| Estimated value | ~$4.5B |
| Late filings | 7,731 |
| Companies searchable | 439 |
| News articles linked | 35 |
| Source filing PDFs linked | 189 |

Transaction counts, estimated value and late-filing totals exclude score-0 rows under review. The JSON and transaction CSV retain all 11,500 rows, including the 1,127 under review. JSON `transactionCount` is the counted total; `underReviewCount` is separate at both dataset and official level. The officials summary CSV uses the same exclusion and includes `under_review_count`.

Every number in this table is checked against `public/data/full-dataset.json` by an automated test (`lib/readme-stats.test.ts`). CI fails if the table drifts from the published dataset.

Rows by verification state: 11,253 checked; 75 human_verified; 0 deterministic_agree; 0 two_models_agree; 91 audit_only; 75 single_read; 20 disputed. Counts are checked against `data/meta/row-verification.json` at test time.

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
| Admin | `/admin` | Pipeline status, review queue, data validation (auth-gated) |

## Data source

All data comes from the U.S. Office of Government Ethics. Transaction reports (278-T Periodic Transaction Reports) are filed under the STOCK Act and the Ethics in Government Act ([5 U.S.C. Section 13107](https://www.law.cornell.edu/uscode/text/5/13107)). Federal government documents carry no copyright ([17 U.S.C. Section 105](https://www.law.cornell.edu/uscode/text/17/105)).

## Architecture

```
OGE API ──▶ scripts/ingest-new-filings.ts ──▶ data/officials/*.json   (source of truth)
                     │
                     ├─▶ scripts/rebuild-index.ts    ──▶ data/meta/officials-index.json
                     └─▶ scripts/generate-exports.ts ──▶ public/data/*.json, *.csv

Next.js App Router reads data/ at build time ──▶ static pages (650+ prerendered)
Neon PostgreSQL + Better Auth ──▶ /admin panel, email alerts (Resend)
```

The public site is served entirely from static JSON committed to this repo — no live database reads on public pages. The database backs the admin panel, pipeline run history and the email alert system.

## Data pipeline

Open Cabinet uses two scheduled paths:

1. **Monitor** — Vercel Cron polls the OGE API daily, diffs exact 278-T PDF URLs against tracked source filings, records the run and emails the result.
2. **Ingest** — GitHub Actions runs the static JSON ingest weekly (Mondays) or on demand, downloads new PDFs, parses them with Claude, checks them, regenerates exports and opens a PR for review.

The ingest path (`scripts/ingest-new-filings.ts`) runs seven stages, described stage by stage with what stops each one in [`research/pipeline.md`](research/pipeline.md):

1. **Find** — the OGE API is diffed against the filings already tracked.
2. **Fetch** — the PDF is downloaded and hashed.
3. **Read** — the whole PDF goes to a vision model (Claude Sonnet) as a document; there is no text-extraction step in front of it. Every returned row passes a shape and enum check (`lib/filing-validation.ts`) whether it came from the model or from a cache. Caches are keyed on the PDF bytes, source URL, page range, prompt, parser version and model (`lib/parse-cache.ts`).
4. **Check** — where the PDF has a text layer, `pdftotext` plus a column parser reads the same table and the two lanes are compared row for row on type, date, amount, late flag and printed row numbers (`scripts/text-layer-crosscheck.ts`). A mismatch stops the filing. A scan cannot be compared and is recorded as such. Every verdict is written to `data/meta/crosscheck-log.json`, which the methodology page renders.
5. **Merge** — rows are added to the official's JSON; identical rows an amendment repeats are not double-counted.
6. **Validate** — `scripts/validate.ts` checks schema and golden files and reports anomalies.
7. **Publish** — a pull request is opened for a person to merge; the site and exports rebuild from the JSON.

The Neon database is a mirror of the JSON used by the admin panel and alerts, not the source of what readers see. `scripts/pipeline.ts` writes to it and is not part of the scheduled ingest.

### Pipeline commands

```bash
pnpm run ingest-filings        # Update static JSON from new OGE PDF URLs (the scheduled path)
pnpm run plan-reparse          # List published filings a prompt change would re-read, with cost; never parses
pnpm run crosscheck-sweep      # Re-run the text-layer comparison over every filing; writes the log
pnpm run pipeline              # DB mirror path (not scheduled): check, download, parse, insert
pnpm run pipeline -- --dry-run # Check only; still records a run row
pnpm run check-filings -- --dry-run # URL-diff OGE without writing state
pnpm run validate              # Run validation suite against data
pnpm run parse-pdf <file>      # Parse a single PDF
pnpm run check-news            # News coverage search guidance
pnpm run seed                  # Seed database from JSON files
```

### Parser models

| Model | Provider | Cost/PDF | Role |
|-------|----------|----------|------|
| Claude Sonnet 4.6 | Anthropic | ~$0.02 | Default parser |
| Claude Haiku 4.5 | Anthropic | ~$0.01 | Budget option |
| Claude Opus 4.6 | Anthropic | ~$0.06 | Verification |
| GPT-5.4-mini | OpenAI | ~$0.01 | Cross-provider check |
| GPT-5.4-nano | OpenAI | ~$0.003 | Cheapest fallback |

## Tech stack

- **Next.js 16** (App Router, static generation, 650+ pages prerendered)
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

The `research/` directory contains six internally sourced research briefs (180+ pages) covering:

1. STOCK Act and federal ethics law
2. Case law and legal precedent
3. News coverage of executive branch financial conflicts
4. OGE structure and data landscape
5. Late filing patterns and enforcement
6. The divestiture process

All briefs follow SPJ Code of Ethics standards with inline citations. See `research/README.md` for the index.

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
