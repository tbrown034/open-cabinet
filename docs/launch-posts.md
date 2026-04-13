# Launch Posts — April 12, 2026

## Hacker News (post first — needs time for traction)

**Title:** Show HN: Open Cabinet – I built an executive branch stock tracker from OGE filings

**Body:**
I spent six years covering financial disclosures as an investigative reporter. Congress has Capitol Trades, Quiver Quantitative, Unusual Whales and a dozen others tracking stock trades. The executive branch — same law, same deadlines — had nothing comparable. So I built one.

Open Cabinet parses 278-T transaction reports from the Office of Government Ethics into searchable, sortable data with D3 visualizations. 34 officials, 2,320 transactions, 563 late filings.

The data is public record. The OGE has an undocumented JSON API that returns 16,800+ records with PDF links. Each PDF is a table I parse into structured JSON — asset name, ticker, type, date, amount range, late filing flag.

Some things the data shows: the FAA administrator held millions in airline stock five months past his ethics deadline. The deputy AG held crypto while ending DOJ crypto enforcement. 213 of Trump's 389 transactions were filed late.

I built this with Claude Code over a weekend. The PDF parsing pipeline uses Claude Sonnet with OpenAI cross-verification. I'm transparent about AI usage — there's a full disclosure on the About page. The code, data and research are MIT licensed.

Live: https://open-cabinet.vercel.app
Source: https://github.com/tbrown034/open-cabinet

Stack: Next.js 16, D3.js, TypeScript, Neon PostgreSQL, Drizzle ORM. Happy to answer questions about the data, the OGE API or the build process.

---

## Bluesky

Congress has 19+ stock trade trackers. The executive branch had nothing comparable.

I spent six years covering financial disclosures as a reporter. This weekend I built Open Cabinet — 34 officials, 2,320 trades, 563 late filings. All from public OGE data.

The FAA chief held airline stock months past his deadline. 213 of Trump's 389 trades were filed late. The data is the story.

MIT licensed, open source, AI-transparent.

open-cabinet.vercel.app

#datajournalism #OpenData #accountability

---

## r/SideProject

**Title:** Weekend project: stock tracker for the executive branch — built by a journalist who covered this beat for six years

**Body:**
I covered financial disclosures for six years at Oklahoma Watch. Congress has a dozen stock trackers. The executive branch has the same disclosure rules but nobody was tracking it in a searchable way.

Open Cabinet parses OGE filing PDFs into structured data with D3 visualizations. 34 officials, 2,320 transactions, 563 late filings. Each official gets a transaction timeline, there's a swim lane chart with every trade on one canvas, company reverse-lookup by ticker and a late filings accountability page.

Built over a weekend with Claude Code. I'm upfront about AI usage — PDF parsing uses Claude Sonnet, with OpenAI for cross-verification. There's a full AI transparency section on the About page. The journalism instinct — what to track, what matters, what to flag — that's mine.

The code and data are MIT licensed. The research directory has six sourced briefs on the STOCK Act, OGE structure and enforcement patterns.

Live: https://open-cabinet.vercel.app
GitHub: https://github.com/tbrown034/open-cabinet

---

## r/dataisbeautiful

**Title:** [OC] Every stock trade filed by 34 executive branch officials on one chart — 2,320 transactions since inauguration

**Body:**
Swim lane visualization of all publicly disclosed stock trades filed with the Office of Government Ethics. Each row is an official, each dot is a trade (red = sale, green = purchase, size = dollar amount range).

Some patterns: Bisignano (SSA Commissioner) has a dense cluster in mid-2025 — $530M in Fiserv divestitures. McMahon (Education) sold everything in one burst. Trump's row is a steady stream of 389 trades, mostly bond purchases.

Data: OGE 278-T Periodic Transaction Reports (public record under 5 U.S.C. Section 13107)
Tools: D3.js (d3-scale, d3-time), React 19, Next.js 16
Source: https://open-cabinet.vercel.app/all

Full site with individual timelines, company lookup and late filings tracker: https://open-cabinet.vercel.app

(Attach screenshot of the /all swim lane chart)

---

## LinkedIn (post in morning with Tribune email)

I spent six years covering financial disclosures as an investigative reporter at Oklahoma Watch. This weekend I built what that experience taught me was missing.

Congress has 19+ stock trade trackers. The executive branch — same STOCK Act rules — had nothing comparable.

Open Cabinet: 34 officials, 2,320 transactions, 563 late filings. D3 timelines, company lookups, late filing accountability. All from public OGE data, all open source.

Built with Claude Code. I'm transparent about where AI helps and where the journalism instinct drives the decisions. Full AI disclosure on the site.

open-cabinet.vercel.app

---

## Notes

- HN: technical audience, lead with the undocumented API discovery and the data
- Bluesky: journalism/accountability crowd, keep it punchy, lead with the gap
- r/SideProject: indie dev audience, emphasize weekend build and journalist background
- r/dataisbeautiful: needs a screenshot of the swim lane chart, focus on the viz
- LinkedIn: professional, connect journalism career to dev skills, for the morning

Fix the GitHub URL if the redirect from open-cabinet- to open-cabinet hasn't propagated yet.
