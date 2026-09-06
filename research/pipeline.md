# How a filing becomes a row on the site

Seven stages. Each one says what happens, what stops it, and what a person does. Three words are used for every check and nothing fuzzier: **enforced** means the pipeline stops; **recorded** means a verdict is written to a file a person reviews; **advisory** means a line is printed and nothing else.

All seven stages are functions with these exact names: fetch, read, check and merge in `lib/ingest-stages.ts` (shared with the re-read tool), find, validate and publish in `scripts/ingest-new-filings.ts`. Stage six runs `scripts/validate.ts` and stops on its exit code. Stage seven hands off to the pull request `.github/workflows/oge-pipeline.yml` opens; the script cannot publish. A test (`lib/pipeline-doc.test.ts`) fails if a stage named here is missing from the code.

## 1. Find (`findNewFilings`)

**What happens.** Every Monday the workflow asks the Office of Government Ethics API for 278-T filings and compares each PDF URL against the filings already tracked in `data/officials/*.json`. New URLs are grouped by official. With `--from-file`, the list comes from a plan file instead, which is how a deliberate re-read of published filings is run.

**What stops it.** An API failure. Enforced.

**What a person does.** Nothing, unless re-reading published filings: then a person runs `pnpm plan-reparse`, reads the estimated cost, and approves it before the ingest runs with `--force-reparse`.

## 2. Fetch (`fetchFiling`)

**What happens.** The PDF is downloaded to `data/pdfs/` and hashed with SHA-256. The certification page is scanned for a reviewer's late-fee note; a hit goes to `data/meta/fee-annotations-pending.json`.

**What stops it.** An HTTP error. Enforced.

**What a person does.** Reviews the fee-annotation file before anything in it reaches the site. Recorded.

## 3. Read (`readFiling`)

**What happens.** The whole PDF, or each page range for a large filing (more than 500 KB, or more than eight pages, since a dense text filing overran the output cap whole), goes to a vision model as a document with a prompt that fixes the output contract: six transaction types (the five trade types and "Unstated", allowed only with the filing's own wording), eleven dollar ranges or an explicit unknown, dates as YYYY-MM-DD, a late flag, a self-reported confidence. The PDF is declared third-party data in the system prompt; text inside it is never an instruction. A ticker is taken from a parenthetical only when it is symbol-shaped and not a name suffix. Every row, from the model or from a cache, passes `lib/filing-validation.ts`. Caches are keyed on the PDF bytes, the source URL, the page range, the prompt, the parser version and the model (`lib/parse-cache.ts`); a prompt change never reuses an old parse.

**What stops it.** A row that fails validation (not retried: the same page reads the same way, so the rejected read is kept beside the PDF as `.parsed.rejected.json` evidence and the filing is held for a person). A response cut off at the token limit. Three failed attempts on a transport error. The spend ceiling: every paid call counts toward a per-run dollar ceiling, and the next call past it stops the run and emails a person; what was already read stays cached. Enforced.

**What a person does.** Reads a rejected read against the PDF and decides. Otherwise nothing at this stage. The confidence the model reports is a review signal, not a measurement; carrying it into a review file is Gate 2 work.

## 4. Check (`checkFiling`)

**What happens.** A second program that never sees the model's output runs `pdftotext` on the same PDF, parses the columns, and compares type, date, amount, late flag and printed row numbers, row for row, in document order. The verdict, whatever it is, is written to `data/meta/crosscheck-log.json` with the PDF hash, the hash of the compared rows and the checker version. The methodology page renders the counts from that file.

**What stops it.** The publication rule, enforced in `checkFiling` since Sep 6, 2026: a filing merges only when two independent reads agree on every row. The first read is always the model. The second is, in order of strength, the text layer, then the OCR lane, then a second company's vision model (`lib/second-read.ts`, OpenAI gpt-6-astra) when no program could read the page. Any disagreement, and any row the second read could not reach, holds the whole filing: a review item is written, an email goes out naming the page and printed rows, and nothing from that filing merges. The rest of the run continues. Enforced.

**The OCR lane, for scans (`lib/ocr-lane.ts`).** When the text lane cannot read a filing (a scan, or a scan whose embedded text is garbage from the scanner, which the text lane records as `unsupported_layout`), a third program renders each page to an image with `pdftoppm`, runs our own optical character recognition on the image with `tesseract`, and hands the result to the same column parser and the same row-for-row comparison. The embedded text is ignored. The verdict is recorded as `ocr_tuple_agreement` or `ocr_tuple_mismatch`, with the OCR engine version, settings, the raw OCR text under `data/ocr/`, and which printed rows agreed and which did not. Recorded. The sweep (`pnpm crosscheck-sweep --ocr`) runs it over every scan already published.

**The second-read lane, for what no program can read (`lib/second-read.ts`).** A second vision model from a different company reads the same page ranges under the same prompt contract. Its rows are paired with the model's by asset name, never by position, so a skipped row cannot line up with an invented one. Agreement on every row lets the filing merge with the state "two models agree", which scores lower than a program's agreement because two models can share a mistake. Anything less holds the filing. Recorded and enforced. The batch form (`pnpm second-read`) runs it over published scans; every call counts against a spend ceiling that stops the run and emails a person.

**The audit lane (`lib/grok-audit.ts`).** A third model, from a third company (xAI grok-4.6), is shown the page images beside the numbered rows the site holds for those pages and answers, row by row, whether the page shows the row as written, and lists anything on the page the rows lack. That is the check a person makes with the PDF open next to the site. Its verdicts are recorded per filing in `data/meta/grok-audit-log.json`. A row is "Checked" only when a program (or a second model on unreadable scans) agreed and this audit confirmed it: three gates. A row the audit disputes or cannot find is under review whatever the other lanes said. Recorded; it runs over published filings by batch (`pnpm grok-audit`) and is not yet part of the weekly ingest.

**What a person does.** Decides every held filing against the PDF, because every checker can be wrong too (the text layer has read a year as 2225 and an amount as "$57"; OCR has read row 1 as row 4; the model has read $1,000,001-$5,000,000 as $500,001-$1,000,000). Records the decision with `pnpm review row` or `pnpm review decide`. A person's decision is the only thing that publishes a held filing or lifts a disputed row to verified.

## 5. Merge (`mergeRows`)

**What happens.** New rows are added to the official's rows. The count for each description, date, type and amount is the largest any single filing asserts, so a filing that prints the same trade on three numbered rows adds three, and an amended filing that repeats rows adds none. Every added row is stamped with the URL of the filing that disclosed it.

**What stops it.** Nothing. Advisory.

**What a person does.** Reviews cross-filing repeats that stage six reports: the same trade in two different filings is either an amendment or a real second trade, and only a person can tell.

## 6. Validate (`validateDataset`, running `scripts/validate.ts`)

**What happens.** The whole dataset is checked. Fatal: a row with an illegal type, amount or date, or a golden file (hand-verified rows for five officials) that no longer matches. Review-required: a stored ticker that is a name suffix, or a trade repeated across two filings. Informative: same-filing lots, unusual volumes, single-day clusters.

**What stops it.** Fatal exits 1 and the workflow stops. Review-required exits 2 and, today, also stops the workflow. Enforced.

**What a person does.** Fixes a fatal problem at its source. Decides each review-required item and, for a data change, approves the exact patch.

## 7. Publish (`handOffForPublish`, then `.github/workflows/oge-pipeline.yml`)

**What happens.** The script records which filings it processed in `data/meta/last-check.json` and stops. The workflow rebuilds the index and the exports, and a pull request is opened on the `automation/oge-filing-updates` branch with the changed JSON. Merging it deploys the site; every public page and every download is built from the same JSON files.

**What stops it.** Nothing in code. The pull request is the stop. Enforced only as far as a person honors it: one pull request has been opened this way, and two ingests were committed directly. That is the honest state.

**What a person does.** Reads the diff and merges. This is the publication decision.

## What a reader sees

Each transaction row on an official's page has a visible text marker: "Checked", "Checked by two models", "Not yet checked" or "Under review", with its full note available in an expandable detail. The marker comes from the recorded per-row verdict in `data/meta/row-verification.json`, loaded by `verificationForOfficial`; it reports recorded evidence, not an enforced publication gate or an advisory console warning.

Every row shows the range the filing reported, or "Not ascertainable" with the filing's words. Every row links to the filing PDF. The methodology page states, from the log, how many rows the deterministic check agreed on, how many are in disagreement awaiting a person, how many are scans it could not read, how many of those the OCR lane agreed on or disputes, and how many are in layouts it cannot yet parse. The summary on each official's page is either a labeled template or model prose a person approved against the computed facts.

## What stays with a person

Whether a trade broke a rule. Whether a disagreement between the model and the checker is the model's error or the checker's. Whether a scanned filing was read correctly. Whether a mapping from a brokerage string to a company is right. Whether a correction is warranted. Which summary goes live. Whether to merge.
