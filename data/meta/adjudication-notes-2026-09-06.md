# Your decisions, Sep 6, 2026

How this works. Each item below is one thing to look at. Click the local link, which opens the PDF on the right page in your browser (in VS Code preview, Cmd-click; if a link does not open, paste the path after "Path:" into Chrome). Find the printed row number in the left column. Compare what the page shows with what the site says. Then do the one action listed. Nothing on the site changes until you say so; my recommendation is only a recommendation.

Where to click decisions: run `pnpm dev` in the open-cabinet folder and open http://localhost:3003/admin/review. Every held filing and every disputed row is listed there with Confirm and Reject buttons. Confirm means "the site is right as published." Reject means "the site is wrong; patch it." For the patches themselves, tell me the item number and "apply" and I make the exact change in one commit with the original recorded.

## 1. DONE. Trump, Motorola Solutions sale, June 18, 2026 (applied Sep 6, 11:15 AM on your yes)

Open: [local PDF, page 10](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Donald-J-Trump-08.12.2026-278T.pdf#page=10>) or [OGE](<https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/2BF91F890F718ACB85258E5B002DE16B/$FILE/Donald-J-Trump-08.12.2026-278T.pdf>)
Path: file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Donald-J-Trump-08.12.2026-278T.pdf#page=10
Look at: printed row 276, MOTOROLA SOLUTIONS INC, amount column.
Site says: $500,001 - $1,000,000. Page shows (my eye, OCR and the fresh model read agree): $1,000,001 - $5,000,000.
Do: if the page says $1,000,001 - $5,000,000, reply "1 apply".

## 2. DONE. Trump, Procter & Gamble sale, June 3, 2026 (applied Sep 6 on your yes)

Open: [local PDF, page 25](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Donald-J-Trump-08.12.2026-278T.pdf#page=25>) or the OGE link above.
Path: file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Donald-J-Trump-08.12.2026-278T.pdf#page=25
Look at: printed row 781, PROCTER & GAMBLE CO, amount column.
Site says: $1,001 - $15,000. Page shows (my eye, OCR and the fresh model read agree): $15,001 - $50,000.
Do: if the page says $15,001 - $50,000, reply "2 apply".

## 3. DONE. Trump, Apple purchase, May 5, 2026 (confirmed as published, Sep 6)

Open: [local PDF, page 2](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Donald-J-Trump-06.25.2026-278T (2).pdf#page=2>)
Path: file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Donald-J-Trump-06.25.2026-278T (2).pdf#page=2
Look at: printed row 4, Apple Inc, amount column.
Site says: $1,000,001 - $5,000,000. OCR read something else; my eye says the site is right.
Do: confirm the row on the review page, or reply "3 confirm".

## 4. DONE. Kennedy, NIKE sale with a 2225 date (published as printed with a note, Sep 6)

Open: [local PDF, page 2](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Robert-F-Kennedy-Jr-05.09.2025-278T.pdf#page=2>) or [OGE](<https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/B410FFBD2E16727285258C8D002C7DC5/$FILE/Robert-F-Kennedy-Jr-05.09.2025-278T.pdf>)
Path: file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Robert-F-Kennedy-Jr-05.09.2025-278T.pdf#page=2
Look at: printed row 9, NIKE, Inc. (NKE), date column. The page prints 04/04/2225. Four checks read it that way.
Site says: 2025-04-04 (the old model silently corrected it).
Do: pick one. "4 keep 2025 with a note" publishes 2025-04-04 and a note that the filing prints 2225 (my recommendation: the filing was posted May 2025 and row 7 above it is 04/04/2025). "4 as printed" publishes 2225 with a note.

## 5. Chavez-DeRemer, three company names printed as two rows each

Open: [local PDF, page 2](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Lori-Chavez-DeRemer-07.02.2025-278T.pdf#page=2>) and [page 6](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Lori-Chavez-DeRemer-07.02.2025-278T.pdf#page=6>) or [OGE](<https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/B8D0AFF6500BD71F85258D00002BFAF9/$FILE/Lori-Chavez-DeRemer-07.02.2025-278T.pdf>)
Path: file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Lori-Chavez-DeRemer-07.02.2025-278T.pdf#page=2
Look at: page 2 rows 17 and 18 (BRIGHT HORIZONS FAMILY / SOLUTIONSINC), rows 21 and 22 (BROADRIDGE FINANCIAL / SOLUTIONS INC), page 6 rows 90 and 91 (WEST PHARMACEUTICAL / SERVICES INC). Each half carries the full trade columns: Sale, 04/28/2025, No, $1,001 - $15,000.
Site says: 98 rows; one of the three pairs is counted as two trades.
Do: "5 one trade per pair" (my recommendation: it is a name wrap in the filer's upload) drops the double-counted half and closes the review item. "5 two trades per pair" keeps both halves for all three.

## 6. Mody, two rows the model could not type or date

Open: [local PDF, pages 1 to 8](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Arjun-Mody-02.27.2026-278T.pdf#page=1>) or [OGE](<https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/3F589CB2A272619D85258DD5002DC58C/$FILE/Arjun-Mody-02.27.2026-278T.pdf>)
Path: file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Arjun-Mody-02.27.2026-278T.pdf#page=1
Look at: the rejected read at data/pdfs/Arjun-Mody-02.27.2026-278T.pages1-8.*.parsed.rejected.json names row 36 (type Unstated, no note) and row 48 (no date). Find those two rows on the pages.
Do: tell me what the page shows for each ("6 row 36 says X, row 48 says Y") and I patch and re-run the read.

## 7. MacGregor, filing removed from OGE

OGE now returns 404 for Katharine-MacGregor-08.07.2025-278T.pdf. Our copy is intact: [local PDF](<file:///Users/home/Desktop/dev/open-cabinet/data/pdfs/Katharine-MacGregor-08.07.2025-278T.pdf>).
Do: "7 keep" keeps the rows with a note that the source was withdrawn (my recommendation). "7 withdraw" removes them.

## 8. Missing rows the re-read found (no PDF check needed to start)

The re-read of each official is a report at data/meta/reverify-reports/<slug>-2026-09-06.md. Rows the site is missing: Kupor 66, Bisignano 12, Criswell 5, Miran 5, McMahon 4, Burgum 2, Wright 2, Bedford 2, Duffy 1, McMaster 1. Each report lists them.
Do: "8 apply kupor" (and so on per official) replaces that official's rows with the fresh read, keeping the old set in data/meta/reverify-history/. Or "8 show kupor" and I print the added rows first.

## 9. Trump re-read (the big one, read the report before deciding)

Report: data/meta/reverify-reports/trump-donald-j-2026-09-06.md. 8,173 of 8,940 rows reproduce exactly. 245 differ on trade fields, mostly in the May 14, 2026 scan, which reads poorly. 372 would be removed, 376 added.
Do: nothing today. I recommend applying only after the May 14 scan has its second read and audit, so the disagreements are narrowed to a list you can check.

## Follow-up, not built: a fourth, low-weight lane

Cross-reference Trump's rows against other trackers that parse the same OGE filings (Capitol Markets, Quiver Quantitative, Tracefour). None publishes a dataset; it would be a scrape, Trump-only, internal confidence only, never a publication gate.
