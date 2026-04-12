# Development Log

A chronological record of development sessions and significant changes.

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
