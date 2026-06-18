# Development Log

A chronological record of development sessions and significant changes.

---

## 2026-06-18 - Visitor Capture and Referral Surface

**Session Summary:**
- Added database-backed filing-alert signups with source-page and official-page metadata.
- Added a stronger homepage/footer cross-promo block for Capitol Releases and Delegation Decoded with UTM-tagged referral links.
- Added reporter/researcher contact CTAs on About and Download, plus an authenticated admin alert-signup list and CSV export.

**Notable Changes:**
- New public signup route: `POST /api/alerts`; it creates the `alert_signups` table if needed, validates email/preference, rate-limits by IP and sends an admin notification.
- New admin route: `GET /api/admin/alerts` and `GET /api/admin/alerts?format=csv`; both require admin auth.
- Pushed in separate tested slices: `a2407cb`, `f317865`, `e769c08` and `71fe91b`.
- Verification across slices: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm run build`, `pnpm run test:data` and `git diff --check` passed. Runtime smoke checks covered `/api/alerts`, `/api/admin/alerts`, `/`, `/officials/trump-donald-j`, `/about`, `/download` and `/admin`.
- Production checks confirmed the alert form, cross-promo links and contact CTA are live on `open-cabinet.org`.

---

## 2026-06-18 - Post-Deploy Hardening and Regression Checks

**Session Summary:**
- Reduced Vercel deployment payload by excluding local PDF caches and mirrored source-document PDFs from production uploads.
- Switched source-document links to prefer OGE URLs so public pages no longer depend on the excluded local PDF mirror.
- Cleared the remaining ESLint warnings and added an explicit data regression check for the Trump single-disclosure versus aggregate-total counts.

**Notable Changes:**
- Added `.vercelignore` for `data/pdfs/**` and `public/data/source-docs/**`; follow-up production deploy uploaded 627 KB instead of roughly 213 MB.
- Added `pnpm run test:data`, which verifies the May 8, 2026 Trump part-two parsed count is 3,642, the Trump aggregate profile count is 5,185 and the full export is 37 officials / 7,513 transactions.
- Verified the OGE dry-run still reports no new filings and the GitHub Actions pipeline still runs ingest, rebuild-index, validate and generate-exports without the exact-count regression check blocking legitimate future data growth.
- Verification: `pnpm run validate`, `pnpm run test:data`, `pnpm run check-filings -- --dry-run`, `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm run build` passed. Production checks returned 200 for key pages and data exports after redeploy.

---

## 2026-06-18 - Production Deploy and Public Stats Verification

**Session Summary:**
- Deployed the refreshed Open Cabinet dataset and clarity fixes to production with `vercel deploy . --prod -y`.
- Verified `https://open-cabinet.org` now serves the updated data instead of the stale 33-official / 7,001-transaction build.
- Confirmed public pages explain transaction-row counts, main-directory scope and single-disclosure versus aggregate-filing totals more clearly.

**Notable Changes:**
- Production homepage now shows 34 main-directory officials, 7,306 transactions, Sara Bailey and Jared Isaacman in the new-ingest banner and "late-filed transactions" wording.
- Trump's production page now shows 5,185 transactions, 4,757 late-filed transactions and the note that totals aggregate every source filing listed below.
- Methodology now shows 37 total officials, 34 in the main directory and 7,306 main-directory transactions.
- Download page now shows the full exported dataset as 37 officials and 7,513 transactions.
- Verification: local `pnpm exec tsc --noEmit` and `pnpm run build` passed before deploy; live checks returned HTTP 200 for `/`, `/officials/trump-donald-j`, `/methodology`, `/download`, `/late-filings`, `/all`, `/data/full-dataset.json`, `/data/officials-summary.csv` and `/data/all-transactions.csv`.

---

## 2026-06-18 - Live OGE Data Refresh and Ingest Hardening

**Session Summary:**
- Ran a live OGE URL-diff audit and found two untracked 278-T PDFs: Jared Isaacman and Sara Bailey.
- Ingested Isaacman's May 27, 2026 filing and bootstrapped Sara Bailey from OGE metadata before parsing her April 1, 2026 filing.
- Updated static JSON data, source filing metadata, generated exports and `data/meta/last-check.json`.

**Notable Changes:**
- `scripts/ingest-new-filings.ts` now carries OGE title/agency/level metadata through ingest, bootstraps newly discovered Level I/II officials, dedupes source filing URLs and recomputes summaries after merges.
- `scripts/check-new-filings.ts` now handles redirects/status failures when downloading PDFs.
- Follow-up site review fixed stale public counts/copy, ISO OGE timestamp formatting, per-transaction PDF source links and source-document sections that lagged newly ingested 278-T filings.
- Current dataset is 37 officials, 7,513 transactions and 132 source-filing entries.
- Verification: live `pnpm run check-filings -- --dry-run` now reports no new filings; `pnpm run validate`, `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm run build` passed. Lint still reports 24 pre-existing warnings.
- Additional checks: extracted text from the two new PDFs matched parsed rows; 131 non-null source URLs returned OK.

---

## 2026-06-09 - OGE Pipeline Freshness Fix

**Session Summary:**
- Fixed the weekly filing monitor so it diffs exact OGE PDF URLs instead of comparing per-official counts.
- Kept Vercel cron as a lightweight monitor and added a GitHub Actions workflow for static JSON ingest, validation and PR creation.
- Centralized OGE fetch, filtering, URL extraction and last-check state handling in `lib/oge-filings.ts`.

**Notable Changes:**
- `scripts/check-new-filings.ts` now supports `--dry-run` and `--no-download`; dry runs do not advance `data/meta/last-check.json`.
- `app/api/cron/route.ts` now fails closed when `CRON_SECRET` is missing, treats zero-record OGE responses as failures, and reports real new-filing counts.
- `.github/workflows/oge-pipeline.yml` runs weekly and manually, then runs `pnpm run ingest-filings`, rebuilds the index, validates data and opens a PR for generated changes.
- Verification: `pnpm run check-filings -- --dry-run` found the 10 missing OGE filings; `pnpm exec tsc --noEmit`, `pnpm run build`, `pnpm run validate`, and `git diff --check` passed.

---

## 2026-04-11 - Full Build: MVP to Production

**Session Summary:**
- Built Open Cabinet from scratch in one evening across 5 continuous sessions
- Went from empty Next.js scaffold to 617-page production app deployed on Vercel
- Parsed 56 OGE PDFs for 29 executive branch officials, extracting 2,118 financial transactions
- Built 7 page types: Directory, Dashboard, All Trades (swim lane), Companies, Official Detail, About, Download

**Key Decisions:**
- Next.js 16 App Router with static generation (SSG) for all pages
- D3.js sub-modules (not full bundle) for all visualizations — "D3 for math, React for DOM" pattern
- Instrument Serif headlines + DM Sans body for editorial/journalism aesthetic
- Static JSON data files instead of database for transaction data — simplicity over complexity
- Neon PostgreSQL only for auth (Better Auth + Drizzle adapter)
- Wikipedia API for official portrait photos (public domain government portraits)

**What Was Built:**

Phase 1-5 (Session 1):
- Data foundation: TypeScript types, 6 official JSON files, D3 dependencies
- Landing page with sortable directory table
- Official detail pages with transaction tables
- D3 transaction timeline with tooltips, jittering for same-day clusters
- About/methodology page

Phase 6-11 (Session 2):
- Design polish: compact grid for single-day clusters, hover states, estimated value stat
- Parsed 56 PDFs from OGE API for 22 new officials (29 total, 2,118 transactions)
- AI-generated summaries for all officials
- Company reverse lookup: /companies search + /companies/[ticker] with D3 bar charts
- Dashboard: buy/sell ratio, D3 treemap (asset categories), official rankings

Phase 12-16 (Session 3):
- Bug fixes: whitespace, company names, dashboard rendering
- Educational explainer section below directory table
- Downloadable data exports (CSV + JSON at /download)
- Mobile responsive: hamburger menu, swim lane scroll wrapper
- SEO metadata + Open Graph tags on all page types
- README with project overview

Phase 17-29 (Session 4):
- OGE filing monitor script (check-new-filings.ts)
- Landing page improvements: late filing stat, coverage note, most recent filing date
- Official page improvements: context notes, OGE source links
- Swim lane improvements: stat row, size legend, filter tabs (Cabinet/Sub-Cabinet/All)
- Companies page: featured "most widely held" chips, regulatory context for 15 companies
- Data quality audit: 86 dupes removed, 15 tickers resolved
- Content polish: About page limitations, summary review
- News coverage: 34 articles across 18 officials from ProPublica, CNBC, Bloomberg, NOTUS, etc.
- Career event dates for all 29 officials with D3 timeline markers (Confirmed + 90-day deadline)

Phase 30+ (Session 5):
- Better Auth with Google OAuth, Neon PostgreSQL, admin page at /admin
- Mobile hamburger menu + auth button in header
- Official photos: 27 portraits from Wikipedia API, avatar component with fallback initials
- Party affiliation tags (R badges) on all officials
- Editorial logo (bracket motif) and filing cabinet favicon
- Names fixed: "First Last" display everywhere (was "Last, First")
- Swim lane: titles under names, 44px lanes (56px for Cabinet filter)
- Auth debugging: schema fix, trustedOrigins wildcard, manual redirect

**Notable Technical Details:**
- Tailwind CSS 4 does NOT apply fill-* utilities to SVG elements — must use inline fill attributes
- Next.js 16 params are Promise-based (must await)
- Better Auth Drizzle adapter requires schema object passed explicitly
- scaleSqrt for circle sizing (area perception scales linearly with value)
- treemapSquarify for asset category visualization
- Log scale for rankings bars when one official dominates ($2.1B Bisignano vs $3M others)
- Wikipedia API rate limits at ~15 requests — need 2-5s delays between calls

**Files Changed:** ~100+ files across app/, lib/, data/, public/, scripts/

**Final Stats:**
- 29 officials tracked
- 2,118 transactions parsed from OGE filings
- ~$2.9B estimated total transaction value
- 563 late filings flagged
- 578 company tickers searchable
- 34 news articles across 18 officials
- 27 official portrait photos
- 617 static pages generated
- 0 build errors, 0 console errors

---

## 2026-04-12 - Design Overhaul, Fact-Check, Research Vault, Data Expansion

**Session Summary:**
- Major design polish pass across all pages
- Font swap: Instrument Serif to Source Serif 4 (eliminated AI tell)
- Fact-checked all site content against 6 research briefs, fixed 9 issues
- Expanded from 29 to 34 officials (2,118 to 2,320 transactions)
- Built 180+ pages of internal research knowledge base
- Added AI transparency section, MIT license, open source infrastructure

**Design Changes:**
- Source Serif 4 headlines (institutional weight, no AI signal)
- Hero: abstract swim lane graphic, asterisk link to coverage note
- Scrollytelling explainer (Tribune-style) for filing process
- Scrollytelling About page (law + deadlines, how it was built)
- "By the numbers" infographic section (dark background, stat cards with citations)
- Footer: redesigned with nav, GitHub, issues, contact, MIT license
- CTA cards with arrows between directory and explainer
- Company lookup: red sells / green buys columns
- Swim lane: time range filters, dual x-axis, solid dots, inauguration marker
- Dashboard renamed to "Overview," moved down in nav
- Directory: expandable table (show 10, "Show all" button)
- Single-day filing callouts (Chavez-DeRemer)
- Treemap: distinct category colors replacing monochrome
- Auth button removed from public nav

**Content/Accuracy Fixes:**
- Section 208 description corrected (official action while conflicted, not trading)
- 30/45-day deadlines described as "whichever comes first"
- "Every stock trade" corrected to "individual stock trades" (ETFs exempt)
- Late filing "fine" corrected to "fee"
- "Congress wrote the rules in 2012" to "strengthened" (1978 predates)
- "For the first time" hedged re: ProPublica
- In the News: AI-assisted search disclosure + last updated dates

**Data Expansion:**
- Added: Dixon (111 tx), MacGregor (23), Whitaker (15), Criswell (13), Lawrence (3)
- Updated 9 officials with current filing dates
- +37 new Mody transactions
- Photos for all 34 officials

**Research Knowledge Base (research/):**
- 01: STOCK Act and federal ethics law
- 02: Case law and legal precedent
- 03: News coverage tracker (official-by-official)
- 04: OGE structure and data
- 05: Late filing patterns
- 06: Divestiture process

**Infrastructure:**
- MIT LICENSE, port pinned to 3003, open source ready
- Blog Part 6 written

**Next:** Database migration (Neon PostgreSQL), automated OGE polling pipeline, daily PDF parsing with Claude API, Form 201 requests for high-priority officials.

---

## 2026-04-12 (Evening) - Pipeline + Polish + Mission Critical Session

**Session Summary:**
- Built the complete automated data pipeline across 4 planned sessions (A-D)
- Database schema designed and migrated to Neon PostgreSQL (5 new tables)
- PDF parser with multi-provider support (Claude Sonnet + OpenAI GPT-5.4)
- Validation suite with 6 layers and golden file regression tests
- Pipeline orchestrator that chains OGE polling through DB insertion
- Admin dashboard with OAuth, live DB stats, review queue, pipeline history
- GitHub Actions daily cron at 6 AM ET

**Pipeline Architecture:**
- Session A: Schema (officials, transactions, news_coverage, pipeline_runs, validation_results) + seed from JSON
- Session B: PDF parser (Sonnet default, Haiku/Opus/GPT-5.4 options, --verify for cross-provider check) + validation suite (5/5 golden files pass)
- Session C: Pipeline orchestrator (check OGE -> download -> parse -> validate -> insert, with batchId for rollback)
- Session D: Admin UI (stats, pipeline history, review queue) + GitHub Actions cron + API routes

**Key Decisions:**
- Sonnet 4.6 as default parser ($0.02/PDF) — better accuracy than Haiku for messy PDFs
- OpenAI GPT-5.4-mini as cross-provider verification — two companies agreeing = highest confidence
- JSON files remain as build cache — site still statically generated from JSON, DB is authoritative store
- Pipeline runs locally or in GitHub Actions, NOT Vercel functions (timeout too short)
- drizzle-kit pull before generate to baseline existing auth tables
- batchId on transactions for "revert this pipeline run" rollback capability

**Testing Results:**
- Parser: Bessent (2tx, $0.007), Bisignano (14tx, $0.013) — both 0 errors
- Cross-verify: Claude Sonnet + GPT-5.4-mini = 100% agreement on Bessent
- Validation: 2,320 tx validated, 0 schema failures, 5/5 golden files pass
- Pipeline dry-run: successfully polled OGE (12K records), found 306 filings, downloaded and parsed

**Files Created:**
- lib/db.ts, lib/schema.ts — shared DB connection + Drizzle schema
- scripts/seed-from-json.ts — JSON to DB seeder
- scripts/parse-pdf.ts — multi-model PDF parser with verification
- scripts/validate.ts — 6-layer validation suite
- scripts/pipeline.ts — end-to-end pipeline orchestrator
- data/golden/*.json — 5 golden reference files
- app/api/admin/{pipeline,review,stats}/route.ts — admin API
- .github/workflows/daily-pipeline.yml — daily cron

**Costs:**
- Bessent parse: $0.007 (Haiku), $0.022 (Sonnet)
- Cross-verify (Sonnet + GPT): $0.025 total
- Projected monthly: $1-3 for daily operations
- Full re-parse of all filings: ~$15-25 one-time

**Next:** Configure GitHub repo secrets for Actions, run first real pipeline, update .env.example (currently gitignored by .env* pattern — needs !.env.example exception), Form 201 requests for Oz/Pirro/Loeffler/Patel.

---

## 2026-04-13 - Verification Marathon + Tribune Email

**Session Summary:**
- Complete data verification of all 34 officials using natural-pdf + Claude Opus page-by-page extraction
- Trump data expanded from 384 to 1,315 transactions (was 25% complete, now full)
- Fixed McMahon $47M parsing error (Angleton ISD bond: Over $50M should have been $1M-$5M)
- Dedup key corrected from (description, date, type) to (description, date, type, amount) — restored 34 legitimate transactions
- Removed 83 amended filing duplicates
- Resolved missing tickers: Miran (58), Wright (74 ETFs)
- ProPublica cross-reference confirmed our 278-T data is more complete
- Four parallel audits: copy review (SPJ/AP), security scan, visual/mobile, ProPublica cross-check
- Email sent to Texas Tribune editor Chris at 1:20 PM EDT
- 27 commits, all pushed and deployed

**Data Changes:**
- Total transactions: 2,320 → 3,283 (+963, mostly Trump)
- Late filings: 563 → 1,217 (37.1% rate)
- Trump: 384 → 1,315 transactions (858 late, 65% rate)
- Criswell: 13 → 80 transactions
- All 34 officials at HIGH or MEDIUM confidence

**Key Fixes:**
- McMahon $47M→$1-5M parsing error
- Dedup key: added amount to prevent deleting legitimate same-day trades
- "FormerAdministrator" spacing bug
- sm:truncate-none invalid Tailwind 4 class
- new Date() showing dynamic "Last updated" instead of hardcoded date
- "1 sales" singular/plural grammar on 2 official pages
- "Opus-verified" jargon removed from user-facing summaries
- README $2.9B → $2.7B estimated value correction
- ProPublica added back to coverage note
- Jonathan Soma / natural-pdf credited and linked in about + scrollytelling

**Infrastructure:**
- natural-pdf verification script (scripts/verify-naturalpdf.py)
- Data verification plan (docs/data-verification-plan.md)
- Blog Part 8 written (The Verification Marathon)

**Next:** Launch posts (HN, Bluesky, LinkedIn, Reddit). Update launch-posts.md numbers. Vercel Cron secrets. Form 201 requests for Oz/Pirro/Loeffler.

---

## 2026-04-17 - Reddit Launch Reception + About/Methodology Split + Filing Banners

**Session Summary:**
- Reddit r/dataisbeautiful post hit #1 of all time: 476K views, 1.1K upvotes, 97.3% ratio
- Vercel analytics: 1,411 visitors, 4,600 page views, 34% bounce rate
- Analyzed 49 Reddit comments for actionable feedback
- Split About page into /about and /methodology based on user confusion
- Built new filing banner system (landing page + official detail pages)
- Moved swim lane legend, created reception tracking

**What Changed:**

UX improvements from Reddit feedback:
- Moved swim lane chart legend above SVG (multiple users missed it below)
- Added "Data checked daily" to landing page hero
- Split /about into two routes: /methodology (scrollytelling, known limitations, AI transparency, data download) and /about (developer bio, resources, open source, feedback form)
- Added "Methodology" to desktop nav, mobile nav, and footer
- Updated all internal links from /about#known-limitations to /methodology#known-limitations

New filing banner system:
- Landing page: dark banner at top listing officials with OGE filings in the last 7 days, with links to their profiles
- Official detail page: matching dark banner explaining: who filed, when, transaction count, date range, and why transaction dates differ from filing date (30-45 day reporting window)
- Fixed "Last filing" line on official pages to show both OGE filing date and transaction date range separately
- Key distinction: mostRecentFilingDate (OGE report submission) vs transaction dates (when trades happened). Banner triggers on filing date (the news event) but clearly explains the transaction dates inside

Infrastructure:
- Created /reception directory (gitignored) for tracking feedback and inbound inquiries
- Logged all Reddit comments, feature requests, and analytics in reception/feedback-log.md
- Bought open-cabinet.org domain ($9) because Reddit filters blocked Vercel URLs

**Key Feedback from Reddit:**
1. Filter by security type (bonds vs stocks vs ETFs) — most requested feature
2. Rate-of-change analysis / correlation with policy events — stretch goal
3. Gains/losses tracking — not possible with statutory ranges
4. Real-time alerts — weekly cron exists but users don't know
5. Trump municipal bond purchases fascinated people — asset-type breakdowns have audience demand

**Inbound:**
- Jonathan Alpart (Powerback.us, FEC Committee C00909036) — civic-tech builder, asked about alternative data sources after OpenSecrets API sunset, interested in lobbying/legislation visualization

**Notable Technical Detail:**
- mostRecentFilingDate vs transaction dates caused confusion: OGE filing dates (April 9-10 for Bedford/Mody) are when the 278-T report was submitted, but transactions inside are from weeks earlier (Feb). The banner system now makes this explicit on both pages.

**Files Changed:**
- app/about/page.tsx (rewritten — developer/project focus only)
- app/methodology/page.tsx (new — scrollytelling, limitations, AI, data)
- app/components/swim-lane-chart.tsx (legend moved above chart)
- app/page.tsx (new filing banner, "Data checked daily", CTA updated)
- app/officials/[slug]/page.tsx (new filing banner, fixed "Last filing" date display)
- app/layout.tsx (Methodology added to desktop nav + footer)
- app/components/mobile-nav.tsx (Methodology added)
- app/late-filings/page.tsx (methodology link updated)
- app/all/page.tsx (methodology link updated)
- .gitignore (/reception added)
- reception/feedback-log.md (new, gitignored)

**Next:** Security type filter on official pages. Respond to Jonathan Alpart email. Continue monitoring Reddit thread for new feedback.

---
