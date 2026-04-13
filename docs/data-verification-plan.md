# Data Verification Plan — Open Cabinet

*Created April 13, 2026. This is the master plan for achieving 100% verified data.*

## The Problem

Our AI-parsed transaction data has known issues:
- **Trump**: 384 of ~1,500 transactions (25% complete) — large multi-page PDFs exceeded AI token limits
- **McMahon**: Had a $47M parsing error (Angleton ISD bond — fixed)
- **Mody**: Had 43 stale duplicates from amended filings (fixed)
- **Bisignano**: Summary had wrong purchase count (fixed)
- **Sitewide**: 83 amended filing duplicates were removed

We cannot ship data we don't trust. The goal is 100% verified, complete data for all 34 officials.

## What We Found Today (April 13)

### Issues Caught and Fixed
1. **McMahon Angleton ISD**: Parsed as "Over $50,000,000" — actual is "$1,000,001-$5,000,000" (saving ~$47M inflation)
2. **83 amended filing duplicates**: Same transaction with different amounts from original + amended filings
3. **5 stale summaries**: Transaction counts in summaries didn't match actual data after dedup
4. **Miran 58 missing tickers**: Well-known public companies with null tickers (53 resolved)
5. **Wright 74 missing ETF tickers**: Schwab/Vanguard funds without obvious tickers (resolved)
6. **Bondi missing DJT ticker**: Trump Media sales had null ticker

### Issues Still Open
1. **Trump incomplete**: 384 of ~1,500 transactions. PDFs are OCR'd scans — pdfplumber table extraction fails, text extraction is noisy ("purchase" → "purehase", "ourchase")
2. **McMahon missing 9 transactions**: 147 in JSON vs 156 in source PDFs
3. **Wright possible LBRT duplicates**: 41 sales across two label variants from overlapping PDFs
4. **Landau count discrepancy**: 86 transactions vs ProPublica's 69

## Verification Approach: Dual-Lane

### Lane 1: AI Parser (existing)
- Claude Sonnet parses PDFs into structured JSON
- Good at: ticker extraction, handling messy formatting, confidence scoring
- Bad at: large PDFs (token limits), OCR artifacts

### Lane 2: Programmatic Extraction (new)
- pdfplumber for text extraction from PDFs
- Good at: no token limits, deterministic, free, processes entire document
- Bad at: OCR quality (Trump's PDFs are scans), can't extract tables from scanned docs

### Lane 3: Hybrid (recommended)
For each PDF:
1. pdfplumber extracts raw text page by page (no token limits)
2. Send each PAGE's text to Claude Sonnet for structured extraction (small input, stays within limits)
3. Merge results across pages with deduplication
4. Compare against existing data — flag discrepancies

This solves the token limit problem (page-by-page) while keeping AI's ability to handle OCR noise.

## Execution Plan

### Stage 1: Trump Re-parse (Priority — most incomplete)
1. Download all 12 Trump PDFs
2. For each PDF, extract text per page with pdfplumber
3. Send each page's text to Claude Sonnet with parsing prompt
4. Merge all transactions, deduplicate by (description, date, type)
5. Compare new complete set against existing 384 — report additions
6. Write verified data back to trump-donald-j.json
7. Expected result: ~1,500 transactions (up from 384)

### Stage 2: Verify All Other Officials
For each of the remaining 33 officials:
1. Download source PDFs (111 total URLs already in sourceFilings)
2. Extract with pdfplumber → page-by-page Claude parse
3. Compare against existing JSON data
4. Report: matches, mismatches, missing, extras
5. Fix any discrepancies found

### Stage 3: Cross-Reference Against ProPublica
For each official where ProPublica has data:
1. Compare our verified transaction count against ProPublica's
2. Verify our 278-T filing count matches OGE API
3. Flag any official where ProPublica has data we don't
4. Document results in research/07-propublica-cross-check.md

### Stage 4: Final Sanity Checks
1. Run `pnpm run validate` — golden files, schema, anomaly detection
2. Verify all amounts are valid OGE ranges
3. Verify all dates are within expected ranges
4. Verify no "Over $50,000,000" amounts that shouldn't be (McMahon-type errors)
5. Verify no stale summaries (counts match actual data)
6. Verify source filing count per official matches OGE API
7. Cross-check total transaction count: JSON = DB = exports

### Stage 5: Database + Site Update
1. Re-seed DB with verified data
2. Switch site to read from DB at build time (remove JSON-as-cache)
3. Pipeline writes to DB → triggers rebuild → site always current
4. Remove "partial extraction" notes from any official
5. Final deploy and visual verification

## ProPublica Cross-Reference Results (April 13)

### Where We Match
13 officials have exact 278-T filing count match with ProPublica.

### Where We're Ahead
14 officials: we have more recent filings than ProPublica (they lag on ingestion).
- Kupor: 7 vs 0 (PP hasn't ingested any)
- Trump: 12 vs 3
- McMaster: 5 vs 1
- Mody: 1 vs 0

### Where We May Be Behind
- Duffy: PP shows 3 docs, we have 1 — but PP's extras are likely 278e/ethics agreements, not 278-T
- Lawrence: Same pattern
- Verified via OGE API: our 278-T coverage is complete

### Biden-Era Officials (Not in ProPublica)
3 officials (Criswell, Dixon, Whitaker) are Biden-era holdovers not in PP's Trump database. Expected.

## OCR Challenge (Trump-Specific)

Trump's PDFs are scanned with RICOH IM C4510. OCR quality varies:
- "Purchase" appears as: purehase, ourchase, ourehase, curchaso, ourchasc, purchaso
- "Yes" appears as: Vos, Yos, Vas, VOS
- Amounts: "$100,001 • $250,000", "$100.001 -$250.000", "S1 ooo 001-Ss ooo ooo"
- Dates: "7/17/25" and "10/15/2025" mixed

Solution: Send raw OCR text to Claude Sonnet page-by-page. Claude handles OCR noise well — it's the token limit that was the problem, not the OCR quality.

## Success Criteria
- [ ] Trump: ~1,500 transactions (up from 384)
- [ ] All 34 officials: pdfplumber extraction count matches JSON count
- [ ] Zero amount mismatches between pdfplumber and JSON
- [ ] Zero "Over $50,000,000" errors
- [ ] All summaries match actual data
- [ ] ProPublica cross-check: no 278-T filings they have that we don't
- [ ] `pnpm run validate` passes
- [ ] DB count matches JSON count matches export count
- [ ] No "partial extraction" disclaimers remaining

## Cost Estimate
- Trump re-parse (12 PDFs × ~8 pages × $0.003/page): ~$0.30
- All other officials (111 PDFs × ~3 pages avg × $0.003/page): ~$1.00
- Total: ~$1.30 in API costs
- Time: 2-3 hours for full verification

## Files
- `scripts/verify-pdfplumber.py` — verification script (to be created)
- `data/officials/*.json` — transaction data (to be updated)
- `research/07-propublica-cross-check.md` — cross-reference results
- `docs/data-verification-plan.md` — this document
