# Open Cabinet

The first interactive stock tracker for the executive branch.

Congress has 19 stock trackers (Capitol Trades, Quiver Quantitative, Unusual Whales). The executive branch -- same STOCK Act rules, same 30/45-day filing requirements -- has had zero. Open Cabinet fills that gap.

## Key Stats

- **29 officials** tracked, from the President to deputy commissioners
- **2,100+ transactions** extracted from OGE filing PDFs
- **~$3.6B** estimated total transaction value
- **578 companies** searchable by ticker or name
- **564 late filings** flagged (213 from Trump alone)

## Pages

| Page | Description |
|------|-------------|
| **Directory** (`/`) | All officials with transaction counts, sortable table |
| **Dashboard** (`/dashboard`) | Aggregate buy/sell ratio, asset category treemap, official rankings |
| **All Trades** (`/all`) | Swim lane visualization -- every transaction on one canvas |
| **Companies** (`/companies`) | Search by ticker or company name across all officials |
| **Company Detail** (`/companies/[ticker]`) | Who in government trades this stock, with D3 bar chart |
| **Official Detail** (`/officials/[slug]`) | Transaction timeline, trade table, news coverage, summary |
| **About** (`/about`) | Methodology, legal basis, limitations, disclaimers |

## Data Source

All data comes from the U.S. Office of Government Ethics. Transaction reports (278-T Periodic Transaction Reports) are filed under the STOCK Act and the Ethics in Government Act (5 U.S.C. Section 13107). Federal government documents carry no copyright (17 U.S.C. Section 105).

Transaction data is extracted from OGE filing PDFs and stored as static JSON in the `data/` directory.

## Tech Stack

- **Next.js 16** (App Router, static generation)
- **React 19**
- **D3.js** v7 sub-modules (d3-scale, d3-hierarchy, d3-time, d3-array, d3-shape, d3-format)
- **TypeScript**
- **Tailwind CSS 4**
- **pnpm**

## Setup

```bash
git clone https://github.com/tbrown034/open-cabinet-.git
cd open-cabinet-
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Legal

This tool aggregates public records. The Ethics in Government Act's news media exception explicitly permits dissemination of financial disclosures to the general public. No enforcement action has ever been brought against a disclosure aggregator. This tool is for informational and journalism purposes only -- it does not constitute investment advice.

## Built By

[Trevor Brown](https://trevorthewebdeveloper.com) -- investigative data journalist turned web developer. 15 years of political reporting at Oklahoma Watch. Built Oklahoma's first statewide financial disclosure database.

[GitHub](https://github.com/tbrown034) | [Portfolio](https://trevorthewebdeveloper.com)
