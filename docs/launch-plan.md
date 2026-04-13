# Open Cabinet Launch Plan

Created: April 12, 2026

## Show HN Draft

**Title (78 chars):**

> Show HN: Open Cabinet -- Stock tracker for the executive branch (Congress has 19, the cabinet had zero)

**Body:**

Congress has at least 19 stock trade trackers -- Capitol Trades, Quiver Quantitative, Unusual Whales, etc. The executive branch, which is subject to the same STOCK Act disclosure rules, has had zero. Open Cabinet fills that gap.

The site tracks 34 senior officials -- cabinet secretaries, agency heads, deputy secretaries -- who file 278-T Periodic Transaction Reports with the Office of Government Ethics. Right now that's 2,283 individual trades worth an estimated $2.9B, with 563 late filings.

The data comes from OGE's public API, which returns metadata for ~17,000 disclosure records. Transaction reports are published as PDFs. I parse those into structured JSON -- asset name, ticker, transaction type, date, amount range, and whether the filing was late.

Each official gets a D3 transaction timeline showing their trading pattern relative to career events (confirmation date, 90-day divestiture deadline). There's also a swim lane chart showing all 2,283 trades across all officials on one canvas, a company reverse-lookup (search by ticker to see who in government traded it), and downloadable CSV/JSON exports of the full dataset.

Some things the data surfaces: Trump made 170+ purchases of bank preferred securities in 2025, most filed late. The FAA administrator held millions in airline stock months past his ethics deadline. The deputy AG held crypto while shutting down DOJ crypto enforcement.

Stack: Next.js, D3.js, TypeScript, Tailwind. Data pipeline: TypeScript scripts polling the OGE API, Claude API for PDF parsing. No paywall, no login required. The source data is public record under the Ethics in Government Act.

Code: https://github.com/tbrown034/open-cabinet

---

## Where to Post

### High Value (Do These)

**Hacker News (Show HN)**
- Post Monday 9-10 AM ET
- Government transparency + open source + data viz is HN catnip
- Include deployed URL and GitHub link
- Don't mention AI in the title -- fine in the body as a technical detail

**LinkedIn**
- Short personal update, not an article
- "I built the first stock tracker for the executive branch. Congress has 19 -- the cabinet had zero. [URL]"
- Tag: #datajournalism #accountability #opensource
- NICAR connections and potentially Tribune panelists will see it

**News Nerdery Slack**
- The NICAR/news nerd community -- direct audience
- Post in #showcase or #tools
- Join at newsnerdery.org if not already in

**NICAR-L Mailing List**
- The IRE/NICAR listserv
- Short announcement, link to site
- Scott Klein reads this

### Medium Value (Do If Time)

**Bluesky**
- Hashtag-driven algorithm, followers don't matter as much
- Use: #datajournalism #OpenData #accountability #NICAR #journalism

**Reddit -- Subreddits That WON'T Pull Your Post:**

| Subreddit | How to frame it |
|-----------|-----------------|
| r/SideProject | "I built a stock tracker for the executive branch" |
| r/dataisbeautiful | Screenshot of swim lane chart with [OC] tag |
| r/reactjs | "Show: D3 + React data viz for government financial disclosures" |
| r/nextjs | "Built with Next.js 16 + Neon Postgres -- executive branch stock tracker" |
| r/opensource | Lead with the GitHub repo |
| r/opendata | "I structured 2,200+ stock trades from OGE PDF disclosures into searchable data" |

**Reddit -- Subreddits That WILL Pull Your Post (SKIP):**
- r/webdev (strict self-promo rules outside megathread)
- r/programming (no self-promo)
- r/politics (no self-promo)
- r/technology (no self-promo)
- r/news (no self-promo)

### Timing

- **Sunday night**: Bluesky, r/SideProject, r/dataisbeautiful
- **Monday 9 AM ET**: Hacker News, LinkedIn, News Nerdery Slack
- **Monday morning**: Tribune email with deployed URL

### Pre-Launch Checklist

- [ ] Site deployed on Vercel with real URL
- [ ] GitHub repo public with clean README
- [ ] Show HN posted
- [ ] LinkedIn post up
- [ ] All stats in HN post match live site (update numbers before posting)
