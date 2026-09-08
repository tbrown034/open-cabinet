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
| `pnpm seed-assets` | Rebuild the file-based asset registry | Writes the registry; this is different from `pnpm seed` |
| `pnpm rebuild-index` | Recalculate official index | Writes index JSON |
| `pnpm generate-exports` | Rebuild downloads | Writes public CSV/JSON files |
| `pnpm readme-stats` | Update README numbers | Writes README using current exports and public company lookup |
| `pnpm pipeline` / `pnpm seed` | Older database mirror workflows | Database writes; seed replaces mirror contents. Not the public JSON ingestion path |
| `pnpm check-news` | Print news-search guidance | Placeholder; news links are manually curated |

## Add a new filing

The scheduled path is `.github/workflows/oge-pipeline.yml`: check sources → ingest → rebuild index → validate → rebuild verification → resolve assets/registry → export → open a PR. Its dry-run option currently performs discovery only, not PDF parsing.

For a manual run, begin with discovery and inspect which URLs and officials are in scope. Approve the cost before ingestion, then inspect the changed official rows and their source evidence. Regenerate the supporting artifacts and README statistics, run checks, and review the entire diff before merging.

Do not treat `check-filings` without `--dry-run` as harmless preparation: it writes discovery state used by ingestion. Discovery/retry state still needs separation. A hand-written `--from-file` plan omits amendment metadata; it is not a safe general workaround for an amended report. Stop for review when a filing replaces or corrects existing records.

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
| Counts differ | Historical/former scope, score-zero exclusion, unknown dates, estimated amount ranges |
| Admin edit has no public effect | Determine whether the panel edits the DB mirror or the canonical JSON |
| Email failed or may have partially sent | `/admin`, digest run and delivery records; inspect before rerunning a real send |
| CI fails only on GitHub | Tracked files, Node/pnpm versions, environment requirements; private notes are absent from fresh clones |

## Publish a code change

Work on a branch. Run focused checks and the full test/lint/typecheck suite, then open a PR. Inspect GitHub CI and Vercel's preview build before merging. After merging, confirm the production deployment corresponds to the merge commit. A successful build and a browser smoke test are different checks; record which you performed.

Private working notes remain ignored. Only this guide and `architecture.md` are public under `docs/`. No secrets, audit working papers or interview notes belong in a release.
