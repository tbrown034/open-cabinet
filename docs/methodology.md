# How We Get the Data

## Initial Load

**Step 1: Get the PDFs**
The Office of Government Ethics has a public API. We query it, find every 278-T filing (the stock trade disclosure form) and download the PDFs. We found 111 PDFs across 34 officials.

**Step 2: Extract text from PDFs**
We use natural-pdf (a Python library by data journalist Jonathan Soma) to pull the raw text out of every page of every PDF. Some PDFs are clean text, some are scanned images with OCR. natural-pdf handles both. We now have 111 text files.

**Step 3: Parse the text into structured data**
We send each page of text to Claude Opus (the most accurate AI model available) and ask it to extract every transaction: asset name, buy or sell, date, amount range and whether it was filed late. The AI handles the OCR noise — "purehase" becomes "Purchase," "Vos" becomes "Yes."

**Step 4: Verify**
- Compare our parsed data against ProPublica's database (they have the same source documents)
- Run a validation suite: check every amount is a valid OGE range, every date makes sense, every type is valid
- Test against "golden files" — 5 officials where we manually verified every transaction
- Cross-check the count: did we get as many transactions as numbered rows in the PDF?
- Flag any discrepancies for human review

**Step 5: Deduplicate**
Amended filings restate earlier transactions. We deduplicate by (description, date, type, amount) — if all four match, it's a duplicate. If the amount differs, it's a distinct trade (same stock, different lot).

## Moving Forward (weekly cron)

Every Monday at 6 AM ET, a Vercel Cron job runs:

1. **Check** — hits the OGE API, compares against what we already have, finds new filings
2. **Download** — grabs any new PDFs
3. **Extract** — natural-pdf pulls text page by page
4. **Parse** — Claude Sonnet (cheaper than Opus, accurate enough for clean filings) extracts transactions. OpenAI GPT-5.4 can cross-verify if needed.
5. **Validate** — same validation suite runs. If it fails, the data doesn't go live.
6. **Insert** — new transactions go into the PostgreSQL database with dedup constraints
7. **Alert** — email notification tells Trevor what was found (or if something broke)

New filings are rare (1-2 per week), so most weeks the cron finds nothing and costs nothing. When it does find something, parsing one PDF costs about $0.02-0.08 depending on the model.
