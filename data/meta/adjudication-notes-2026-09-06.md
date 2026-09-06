# Adjudication notes, prepared Sep 6, 2026 (night build)

Findings a person must decide. Nothing here has been applied. Each item names the PDF page and printed row so the decision takes a minute, not a reading.

## Chavez-DeRemer, Lori-Chavez-DeRemer-07.02.2025-278T.pdf (text lane 100 rows, model 97, site 98)

The government filing prints three wrapped company names as two numbered rows each, and each half carries the full trade columns (Sale, 04/28/2025, No, $1,001 - $15,000):

- page 2, rows 17 and 18: "BRIGHT HORIZONS FAMILY" / "SOLUTIONSINC"
- page 2, rows 21 and 22: "BROADRIDGE FINANCIAL" / "SOLUTIONS INC"
- page 6, rows 90 and 91: "WEST PHARMACEUTICAL" / "SERVICES INC"

The model reads each pair as one trade (97). The text layer counts each printed row (100). The site has 98, so one pair is currently counted twice. Decision needed: one trade per pair (97) or two. Recommendation: one trade per pair; the split is a name wrap in the filer's upload, and the amount range is identical on both halves. If accepted, the site drops one row (the double-counted half) and the review item chavez-deremer-lori-lane_disagreement-2026-09-06-002 closes with that reason.

## Trump, Donald-J-Trump-08.12.2026-278T.pdf (OCR lane)

Checked by eye against the page image on Sep 5:

- page 10, printed row 276, MOTOROLA SOLUTIONS INC, sale 6/18/2026: filing prints $1,000,001 - $5,000,000. Site publishes $500,001 - $1,000,000. Model wrong. Patch: amount to "$1,000,001-$5,000,000".
- page 25, printed row 781, PROCTER & GAMBLE CO, sale 6/3/2026: filing prints $15,001 - $50,000. Site publishes $1,001 - $15,000. Model wrong. Patch: amount to "$15,001-$50,000".

## Trump, Donald-J-Trump-06.25.2026-278T (2).pdf (OCR lane)

- page 2, printed row 4, Apple Inc, purchase 5/5/2026: filing prints $1,000,001 - $5,000,000, as published. OCR wrong. No change.

## Kennedy, Robert-F-Kennedy-Jr-05.09.2025-278T.pdf

- page 2, printed row 9, NIKE: the filing prints 04/04/2225. The model reads 2225 faithfully now and validation refuses a future date, so the filing is held. Decision: publish the row with the date as printed and a note, or as 2025-04-04 with a note that the filing's year is a typo. Recommendation: 2025-04-04 with dateNote "Filing prints 04/04/2225", because the filing was posted 2025-05-17 and the row sits among April 2025 trades.

## Mody, Arjun-Mody-02.27.2026-278T.pdf

- pages 1-8 chunk: one row typed "Unstated" with no note, one row with no date. The rejected read is kept at data/pdfs/Arjun-Mody-02.27.2026-278T.pages1-8.*.parsed.rejected.json. Decision needed on those two rows against the PDF.

## MacGregor, Katharine-MacGregor-08.07.2025-278T.pdf

- OGE now returns 404 for this PDF. The local copy is intact and unchanged (hash in the cross-check log). Decision: keep publishing from the local copy with a note that the source was removed, or withdraw. Recommendation: keep, note it on the source-documents line.

## Follow-up, not built tonight: a fourth, low-weight lane

Cross-reference Trump's rows against other trackers that parse the same OGE filings (Capitol Markets, Quiver Quantitative, Tracefour). None publishes a downloadable dataset; it would be a scrape, Trump-only, and internal confidence only, never a publication gate. ProPublica's Trump Team disclosure project publishes the documents, not parsed rows.
