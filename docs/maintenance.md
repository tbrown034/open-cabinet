# Maintaining Open Cabinet

Start with [the architecture map](architecture.md). Use **Node 24 and pnpm 10**, matching CI. `pnpm-lock.yaml` is the dependency lock; do not generate a second npm lockfile.

## Run the site and checks

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The local site runs at `http://localhost:3003`. Public transaction pages read committed data; live service credentials are needed for login, email and provider-backed operations, not simply to inspect those pages.

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm validate
pnpm test:data
```

Tests use fixtures and mocks. The Ask route tests can write a local diagnostic log; run the suite in a disposable checkout when preserving local operational logs matters. Do not use production credentials for tests. `pnpm build` checks the production build; it does not deploy.

### What validation means

- `lib/validation/parsed-rows.ts` checks an extraction response before ingest uses it: allowed fields, types, ranges and dates.
- `lib/validation/published-data.ts` reads the saved JSON, checks schema rules and selected reference fixtures, and reports suspicious repeats and anomalies.
- `scripts/validate.ts` runs the second module. Exit **0** means its checks passed, **1** means a fatal failure, and **2** means human review is required. Both nonzero results stop the workflow.
- These validators have different input contracts. A published row does not carry all the model response fields. Do not blindly merge their rules into one generic validator.
- Existing date/golden-reference limitations remain. A PASS is not certification of every printed source value.

## Commands and their effects

| Command | Purpose | Effects to expect |
|---|---|---|
| `pnpm check-filings -- --dry-run` | Discover candidate filing URLs | External OGE requests; no check-state write |
| `pnpm check-sources` | Check saved original PDF links | External requests; writes source-availability report |
| `pnpm ingest-filings` | Ingest new filings into JSON | Downloads, possible paid reads, cache/evidence/state and official-file writes; notification paths |
| `pnpm ingest-filings --parse-only` | Read/check candidates without merging official rows | Can still pay for reads and write caches/logs/state; not a no-effect preview |
| `pnpm plan-reparse` | Inspect the reparse plan and cost estimate | Does not itself run the model; review emitted command suggestions carefully |
| `pnpm reverify <slug> --dry-cost` | Estimate an existing official's reread | Cost-planning mode; inspect the selected filing scope |
| `pnpm reverify <slug>` | Compare new readings with published rows | Can make paid reads and write logs/reports; no official-row replacement without `--apply` |
| `pnpm reverify <slug> --apply` | Apply a reviewed correction | Replaces official rows and writes history; requires deliberate review of the proposed changes |
| `pnpm row-verification` | Derive public row labels | Writes verification artifact from saved evidence; does not itself call a model |
| `pnpm asset-resolution` | Derive classifications and ticker matches | Writes asset-resolution artifact |
| `pnpm seed-assets` | Rebuild the file-based asset registry | Writes the file-based registry; does not seed PostgreSQL |
| `pnpm rebuild-index` | Recalculate official index | Writes index JSON |
| `pnpm generate-exports` | Rebuild downloads | Writes public CSV/JSON files |
| `pnpm readme-stats` | Update README numbers | Writes README using current exports and public company lookup |
| `pnpm check-news` | Print news-search guidance | Placeholder; news links are manually curated |

## Add a new filing

The scheduled path is `.github/workflows/oge-pipeline.yml`: check sources → ingest → rebuild index → validate → rebuild verification → resolve assets/registry → export → open a PR. Its dry-run option currently performs discovery only, not PDF parsing.

For a manual run, begin with discovery and inspect which URLs and officials are in scope. Approve the cost before ingestion, then inspect the changed official rows and their source evidence. Regenerate the supporting artifacts and README statistics, run checks, and review the entire diff before merging.

`check-filings` without `--dry-run` can download PDFs and writes discovery state. That state is only a monitor baseline: normal ingestion skips URLs saved in official `sourceFilings`, so checking first cannot hide an unimported filing. Failed and held filings remain candidates; caches and existing publication gates still apply. Before retrying, inspect the prior failure/hold and expected cost.

A hand-written `--from-file` plan omits amendment metadata and bypasses normal discovery selection; it is not a safe general retry workaround. Use the normal ingest path for new filings and the correction workflow for existing records. Stop for review when a filing replaces or corrects earlier rows.

## PDF size and incomplete answers

`lib/pdf/chunks.ts` splits filings into at most eight pages per unit and checks the actual saved chunk size against a 500 KB target. It divides oversized multi-page chunks again. A single oversized page stays intact with a warning; the target is not a provider rejection limit. Original PDFs and page rotation are preserved.

The normal Claude parser checks the whole encoded request against the documented 32 MB limit before sending it. Base64 encoding makes the request larger than the PDF on disk. This guard does not cover the separate OpenAI or legacy batch paths.

Input size and answer length are different limits. If Claude's answer reaches the output limit, ingestion still stops for smaller-page review; it does not automatically retry with more paid requests. A large scanned filing may already have one page per unit. Do not assume smaller file sizes alone solve that failure. Changed chunk boundaries can also require new reads when existing cache entries no longer match.

## Correct an existing filing

Use the candidate comparison in `scripts/reverify.ts`. Read the report against the original PDF before applying. `--force-reparse` pays for fresh reads; using the ingestion merge path on existing data can append rows rather than replace them. If testing a fresh parse through ingest, use `--parse-only` and review the effects listed above.

A correction may change computed row IDs. Inspect attached human decisions and regenerate supporting artifacts after an approved change. Stable stored IDs and split/merge rules are future work, not a guarantee of the current workflow.

## When something looks wrong

| Symptom | First places to inspect |
|---|---|
| A transaction value looks wrong | Official JSON → `sourceUrl` PDF → saved parse and comparison evidence |
| A verification label looks wrong | `data/meta/row-verification.json`, `lib/row-verification.ts`, original lane logs |
| A company match looks wrong | Asset-resolution entry, reference snapshot/dictionary, printed description and name evidence |
| New filing is missing | OGE URL, `data/meta/last-check.json`, official source URLs, pipeline logs; discovery is not proof of publication |
| Counts differ | Start at `officialForTotals` / `rowsForTotals`. Check official/company/date scope; under-review and historical rows do not count. Undated counted rows appear in headlines but cannot appear on a timeline |
| Need to correct a public transaction | Use the JSON correction/review workflow; the retired DB mirror controls no longer exist |
| Email failed or may have partially sent | `/admin`, digest run and delivery records; inspect before rerunning a real send |
| Old Ask tab asks you to refresh | Refresh and submit a written question. Raw plans and retired follow-up tokens are rejected before model spending |
| Ask reused an unexpected translation | Inspect `/admin/askai` and the displayed query. Cache candidates carry a `plan-cache-v2` reason with model/date/page scope; follow-ups and legacy untagged rows are excluded |
| CI fails only on GitHub | Tracked files, Node/pnpm versions, environment requirements; private notes are absent from fresh clones |

## Retired database tools

`pnpm pipeline`, `pnpm seed`, the mirror stats/review/validation endpoints, and their admin panels have been removed. Use `pnpm ingest-filings` for new JSON filings and `pnpm validate` for published-data checks. `pnpm seed-assets` still builds the file-based asset registry.

Existing mirror rows, table declarations and migrations are preserved. Do not drop them or rewrite migration history as part of application cleanup. Login, subscriptions, email delivery, monitor history and Ask records still use the operational database.

## Publish a code change

Work on a branch. Run focused checks and the full test/lint/typecheck suite, then open a PR. Inspect GitHub CI and Vercel's preview build before merging. After merging, confirm the production deployment corresponds to the merge commit. A successful build and a browser smoke test are different checks; record which you performed.

Private working notes remain ignored. Only this guide and `architecture.md` are public under `docs/`. No secrets, audit working papers or interview notes belong in a release.

### Ask interaction smoke check

On `/askai`, click an example: it should fill and focus the input without submitting. Click Ask or press Enter to run it. Edit the draft after an answer: the answer must retain its original “You asked” text. Check “Interpreted as” and the official/date scope against your intent.

Try a company count, an official-specific question, a year, a list with filing links, a question with no matches, and an unsupported profit question. Compare numeric results against `getPublishedRows()` using explicit filters. Test cancellation and a failed connection. Examples are independent questions; Ask does not remember prior answers. Cached translations must still run over current records.

The planning request uses a 20-second timeout and `maxRetries: 0`, following the [Anthropic SDK configuration](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript#timeouts). This bounds the model request, not the full database/request lifecycle. A timeout or provider failure produces a recovery message; the optional model phraser remains off by default. If planning instructions change, increment the `plan-cache-v2` contract tag so earlier translations are not silently reused.

Compound history questions (for example, “who bought Apple but never sold it?”) are unsupported. Test their refusal and a nearby supported question such as “who bought Apple?” together. The free intent gate must run before the cache lookup. Feedback failure must retain the form and show “not saved”; a success message requires an actual updated log record.
