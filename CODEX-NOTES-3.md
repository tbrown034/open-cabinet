# Local review UI handoff

Implemented on `gate2-review-ui-codex`, based on `a178b4e`.

## Use

Run `pnpm dev`, then open `http://localhost:3003/admin/review`.

- Held filings show every open queue item, its OGE link, located problems, and lane/model readings. Recording a decision calls `decideReview(id, text, "trevor")`.
- Disputed rows show every score-0 record, grouped by official. Published rows and check evidence appear side by side. Each decision requires evidence and replaces any previous decision for that record ID in `data/review/decisions.json`.
- The count includes open held items, score-0 rows, and saved decisions across the held queue and row decisions file.
- Rebuild row states runs `pnpm row-verification` at the repo root and displays the last 12 output lines. Saved confirmations take effect after rebuilding; rejected rows still need a patch.

## Implementation boundaries

- Page and all three server actions check the actual Host header. Only `localhost` and `127.0.0.1`, optionally with a port, are accepted; other hosts call `notFound()` before review I/O. Forwarded headers do not bypass the guard.
- The route is dynamic and uses the Node.js runtime. The new UI has no client component or client state; native forms submit server actions, then redirect back with status/output.
- Candidate lookup uses the same PDF hash, source URL, parser version, prompt hash, and default model as `scripts/build-row-verification.ts`.
- `recordIdsFor()` matches published rows. `locateInParseRecord()` runs on all rows within each filing before selecting disputes, preserving duplicate-lot positions. Lane details require matching candidate/PDF provenance.
- Missing parse records, unmatched rows, stale lane logs, and missing officials are explained visibly. Unmatched published records cannot receive decisions through the UI.
- Only `app/**` and this handoff file changed. No protected library or script edits, auth changes, real review decisions, row-state rebuilds, paid model calls, or pushes occurred.

## Verification

- `pnpm typecheck`: passed.
- `pnpm lint`: passed with one existing warning at `app/officials/[slug]/page.tsx:323` (`sourceUrl` unused).
- `pnpm test`: 227 tests passed in 22 files, including 31 new review tests.
- `pnpm build --webpack`: passed; `/admin/review` appears as a dynamic route. The worktree lacks `BETTER_AUTH_SECRET`, so existing auth initialization emits errors during the otherwise successful build. Auth configuration was left unchanged.
- `git diff --check`: passed.
- Live HTTP smoke verification was attempted against a temporary production server, but the sandbox rejected the loopback connection with `EPERM`. The server was stopped. Page rendering, host rejection, and action behavior were verified with fixtures; no real decision forms were submitted.

The first build exposed an existing methodology-page crash: the checked-in verification summary predates the audit gate and lacks newer state counts. A small fix in `app/components/verification-summary.tsx` shows a rebuild-needed message for that older schema, avoiding both the crash and a false full-audit coverage claim. A regression test covers it. The source data was preserved.

## Commits

- `299f421` — Local review forms and guarded repository actions.
- `9a92bf9` — Host, evidence mapping, and action tests.
- `08a54cc` — Compatibility rendering for pre-audit verification summaries.

Git writes succeeded. Changes are committed locally; nothing was pushed.
