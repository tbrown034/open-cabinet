# Gate 2 display work

Branch: `gate2-display-codex`. No push.

## Changes

- Official transaction tables show the exact score labels, expandable recorded notes, and a highlighted, bold "Under review" marker for score 0. Verification is attached before filtering, sorting and pagination. No client JavaScript was added.
- Methodology renders all five state counts and one overall checked share from the row verification summary. It explains single reads and rows awaiting a person's decision.
- Transaction CSV and JSON exports append `recordId`, `verificationScore`, and `verificationState`. All 11,501 source transactions and original CSV fields are preserved. The officials summary CSV was regenerated unchanged: it contains aggregate officials, not transaction records.
- README verification counts are checked against the verification file at test time. Pipeline documentation describes the recorded markers under "What a reader sees".

## Validation

- `pnpm typecheck`: passed.
- `pnpm lint`: passed with the existing unused `sourceUrl` warning in the official page's chart payload helper.
- `pnpm test`: 185 tests passed across 19 files. Added coverage includes all labels, full notes, missing records, summary counts, duplicate lots through filtering/sorting/pagination, and every exported row.
- `pnpm build`: failed because Turbopack rejects the worktree's `node_modules` symlink outside its filesystem root. `pnpm build --webpack` passed and generated 498 pages. It logged existing Better Auth default-secret configuration warnings.
- `pnpm generate-exports`: its `tsx` CLI hit a sandbox IPC socket restriction. The same script succeeded with `node --import tsx scripts/generate-exports.ts`.
- `git diff --check`: passed. Original CSV fields were also compared against the branch base and are unchanged.

## Integration dependency

`data/meta/row-verification.json` was absent from this worktree. The existing file was copied unchanged from `/Users/home/Desktop/dev/open-cabinet/data/meta/row-verification.json` and verified byte for byte. It remains untracked here so the verification builder retains ownership of the data artifact; integration must include that file. The README and export consistency tests require it.

The snapshot records 2,050 deterministic agreements, 0 human verified, 0 two-model agreements, 9,038 single reads, and 413 disputed rows. No verification derivation, source transactions, or other builder-owned code was edited.

## Commits

- `0d3edc5`: Show recorded verification markers and methodology coverage.
- `a14d57c`: Append record IDs and verification fields to transaction exports.
- Final documentation commit: verification counts, pipeline reader notes, and this handoff.
