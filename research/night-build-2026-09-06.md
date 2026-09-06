# Night build, Sep 5 to 6, 2026: the story of the verification work

Written as it happened, for the record and for Wednesday. Plain English; the commits carry the detail.

## Why

The site had been built over months with a lot of AI help at lower model tiers. Before Wednesday's interview, and before any "ask the data" feature, Trevor wanted every published row re-examined: read twice by independent means, scored, and any disagreement sent to a person. His words: bad data in, bad data out.

## What existed at 7 PM Saturday

One vision model (Claude Sonnet 4.6) read every filing. A text-layer lane compared type, date, amount and late flag row for row where a PDF had a text layer. That covered about 2,050 of 11,501 rows. Scans, which hold most of Trump's rows, had no second read at all. Verification was recorded per filing, not per row, and a reader could not tell whether a row had been checked.

## What was built overnight, in order

1. **Asset registry.** Every stock symbol on the site looked up in the SEC's own company list, with the filed variants recorded. Found one wrong company page (a business development company grouped under Belden).

2. **OCR lane.** Scanned filings rendered to images and read with tesseract, ignoring the scanner's garbage text layer, then compared row for row with the same code as the text lane. On Trump's three big 2026 scans it read 90 to 97 percent of rows and agreed with the model on more than 98 percent of those. It caught two rows the site had wrong (Motorola Solutions and Procter & Gamble amounts) and was itself wrong once (Apple), which is the point: disagreement goes to a person.

3. **Re-read of every non-Trump official**, about $5.86. Fourteen officials reproduce exactly. Most other changes were wording (the new prompt appends tickers). Real trade-field differences were rare. The site is missing about 100 rows, 66 of them Kupor's. Three filings held for a person (Kennedy's 2225 typo, MacGregor's PDF removed by OGE, Mody too dense for one read).

4. **Tooling that the re-read exposed as wrong, fixed:** the diff paired identical trades at random; a deterministic validation failure was retried three times at cost; a tripped gate emailed on every rerun; dense filings overran the output cap. Each fixed with a test.

5. **Spend ceiling.** Every paid call counts; crossing the ceiling stops the run and emails Trevor. Rejected model reads are kept as evidence so nobody pays twice.

6. **Per-row verification.** A stable ID per row and a state per row: 3 when an independent program agreed or a person decided, 2 when a second company's model agreed, 1 for a single read, 0 for a live disagreement. Written to a file the pages and exports read.

7. **Second-read lane.** OpenAI's gpt-6-astra reads only what no program could confirm, paired by asset name never by position. Trevor's idea: two frontier labs checking each other.

8. **The publication rule.** New in the ingest: a filing merges only when two independent reads agree on every row. Otherwise it is held, a person is emailed with the page and printed rows, and the rest of the run continues.

9. **Trump re-read** (in progress at the time of writing) and the second-read batch over the scans.

## What stays with a person

Every held filing. Every disputed row. Every data change to the site. The adjudication list with page and row numbers is in data/meta/adjudication-notes-2026-09-06.md.
