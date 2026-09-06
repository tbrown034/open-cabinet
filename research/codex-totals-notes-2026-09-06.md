# Gate 2: exclude under-review rows from totals

**Implemented and validated on `gate2-totals-codex`. Changes are uncommitted because the session cannot write the shared Git directory. Nothing was pushed.**

## What changed

- `lib/format.ts` provides `rowsForTotals`: only score 0 is excluded. Scores 1–3 and missing verification continue to count. Callers attach verdicts in original row order, before filtering, sorting or grouping, preserving distinct verdicts for identical lots.

- `lib/data.ts` provides `officialForTotals`, a separate filtered view without changing the original official. Company trades retain every row and its original verification record.

- Official pages exclude score-0 rows from trade, purchase, sale, late and estimated-value totals. Estimated value is now displayed in the totals strip. The note below it reports excluded rows, with singular/plural wording. Daily/monthly density statistics, monthly bars, dot timelines and the transaction evidence passed to the divestiture ledger also use filtered rows. The table, filters and pagination still include disputed rows with their markers.

- Company pages and lookup calculate trade, purchase, sale, official and value totals from counted rows. Company bar charts use those totals. Notes appear below company-page totals, above the lookup and in affected lookup entries. Company trade tables keep every row and now display verification markers. A company with only disputed rows remains searchable with zero counted trades.

- Homepage headline count, estimated value, late count/rate, monthly hero chart, directory counts and sparklines use counted rows rather than cached index transaction totals. The headline totals have an exclusion note.

- The export generator sets `transactionCount` and `underReviewCount` both per official and at dataset level. JSON retains all transaction objects and their verification fields. The officials summary CSV excludes disputes from its totals and appends `under_review_count`; it retains all officials. The all-transactions CSV retains every row and its existing columns, including `verificationState`, and is byte-for-byte unchanged. Generated JSON and summary CSV are refreshed. The download page distinguishes physical row counts from counted totals and explains the exclusion.

- README statistics and their test now distinguish counted transactions from rows under review. Regression fixtures cover disputed purchases and sales, identical lots, scores 1–3, missing verdicts, all-disputed datasets, page notes, company grouping and actual export generation. The export fixture also checks repeat-run idempotence.

## Verified counts

| Scope | Counted transactions | Rows under review | Retained transaction rows | Counted late rows |
| --- | ---: | ---: | ---: | ---: |
| Full export, including former officials | 11,088 | 413 | 11,501 | 7,737 |
| Homepage current roster | 10,881 | 413 | 11,294 | 7,737 |

The full-export estimate still rounds to $4.5B. The existing roster policy accounts for the difference between homepage and export counts.

## What stayed unchanged

- No edits to `lib/row-verification.ts`, verification evidence, `data/**`, or scripts other than `scripts/generate-exports.ts`. No reparsing, model calls, adjudication, deployment or push.

- Original source filings, filed amounts, official prose summaries, fee-payment records and divestiture promises are unchanged. Only the transaction evidence supplied to the ledger is filtered; independent document/promise counts are unchanged.

- Official-page date coverage still describes all retained source rows. Its average trades/week uses the filtered numerator over that original coverage period. Ingest banners still count newly published rows, including rows under review; they describe publication activity. Table result counts still describe visible rows, including disputes.

- Changes are bounded to the requested official, company, homepage and download surfaces. Separate `/dashboard`, `/all`, `/late-filings`, `/methodology`, social-share images and official-page metadata were not changed; their existing source-row counts/aggregations may still include disputes. Admin operational counts are unchanged. `getAllOfficials()` deliberately continues returning complete source data, so other callers do not silently lose rows.

## Validation

- `pnpm typecheck`: passed.

- `pnpm lint`: passed with zero errors and one existing unused `sourceUrl` warning in the official-page chart payload helper.

- `pnpm test`: passed, 20 files and 201 tests.

- `pnpm build --webpack`: passed, 498 pages generated. Better Auth logged default-secret errors during page-data collection; the build exited 0. Auth configuration was not changed or validated.

- `git diff --check`: passed. Verified source data, verification implementation and other scripts are unchanged.

- Export generation: `node --import tsx scripts/generate-exports.ts` succeeded. The `tsx` CLI's IPC socket was blocked by the sandbox; loading the same TypeScript generator directly through Node succeeded.

## Commit blocker

The first small commit was attempted with title `Exclude under-review rows from page totals and charts`. Both staging and committing failed with:

```text
fatal: Unable to create '/Users/home/Desktop/dev/open-cabinet/.git/worktrees/open-cabinet-codex/index.lock': Operation not permitted
```

That shared Git directory is outside the session's writable roots, and this session cannot request expanded permissions. No commits were created. Suggested grouping when Git writes are available:

1. Page/data changes and their fixtures: `Exclude under-review rows from page totals and charts`.

2. Export generator, generated downloads, download page, README and export/README tests: `Separate disputed rows from download totals`.

3. This note: `Document Gate 2 changes and validation`.
