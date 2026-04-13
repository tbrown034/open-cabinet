# Open Cabinet

An interactive financial disclosure and conflict-of-interest tracker for the executive branch.

Congress has 19+ stock trackers. The executive branch — same STOCK Act rules, same 30/45-day filing requirements — has had no comparable public tool. Open Cabinet fills that gap.

**Live:** [open-cabinet.vercel.app](https://open-cabinet.vercel.app)

## What it does

- Tracks financial transactions filed by cabinet secretaries, agency heads and senior government officials
- Parses OGE filing PDFs into searchable, sortable data with D3 visualizations
- Flags late filings, tracks compliance and surfaces potential conflicts of interest

## Current data

| Metric | Value |
|--------|-------|
| Officials tracked | 34 |
| Transactions | 3,332 |
| Estimated value | ~$2.7B |
| Late filings | 1,339 |
| Companies searchable | 620+ |
| News articles linked | 34 |
| Source filing PDFs linked | 111 |

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

## Data pipeline

The automated pipeline checks for new filings weekly:

1. **Check** — Vercel Cron polls the OGE API for new 278-T filings
2. **Download** — New PDFs are downloaded from OGE's public portal
3. **Extract** — natural-pdf (by Jonathan Soma) extracts text page by page
4. **Parse** — Claude Opus/Sonnet structures each page into transaction data
5. **Validate** — Automated checks: schema, tickers, regression tests, anomaly detection
6. **Store** — Neon PostgreSQL with UNIQUE deduplication and batchId for rollback
7. **Alert** — Email notifications for errors, credit exhaustion or new filings via Resend

### Pipeline commands

```bash
pnpm run pipeline              # Full run: check, download, parse, validate, insert
pnpm run pipeline -- --dry-run # Check only, no inserts
pnpm run pipeline -- --verify  # Parse then cross-check with OpenAI
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
- **Vercel** (Pro) for hosting and cron
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

See the [About page](https://open-cabinet.vercel.app/about) for full AI transparency disclosure.

## Contributing

Found a data error? [Open an issue](https://github.com/tbrown034/open-cabinet/issues) or use the [feedback form](https://open-cabinet.vercel.app/about) on the site.

## License

[MIT](LICENSE)

## Built by

[Trevor Brown](https://trevorthewebdeveloper.com) — investigative data journalist turned web developer. 15 years of political reporting including six years covering elections, dark money, financial disclosures and government accountability at Oklahoma Watch. Built Oklahoma's first statewide financial disclosure database.

[GitHub](https://github.com/tbrown034) · [Portfolio](https://trevorthewebdeveloper.com) · [Email](mailto:trevorbrown.web@gmail.com)
