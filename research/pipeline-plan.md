# Open Cabinet: Automated Data Pipeline Plan

*Approved April 12, 2026. Implementation across 4 sessions.*

## Approach

DB is the authoritative store. JSON remains the build cache. Pipeline writes both. Git push after every step for rollback safety.

## Session A: Database Schema + Seed

1. Create `lib/db.ts` — shared Neon connection → **commit + push**
2. Create `lib/schema.ts` — officials, transactions, news_coverage, pipeline_runs, validation_results → **commit + push**
3. Run `drizzle-kit pull` to baseline auth tables → **commit + push**
4. Update `drizzle.config.ts` for both schema files → **commit + push**
5. Run `drizzle-kit generate` + `drizzle-kit migrate` → **commit + push**
6. Build + run `scripts/seed-from-json.ts` → **commit + push**
7. Build verification script, confirm data matches → **commit + push**

## Session B: PDF Parser + Validation

1. Install @anthropic-ai/sdk → **commit + push**
2. Build `scripts/parse-pdf.ts` → **commit + push**
3. Test against 5 known PDFs → **commit + push**
4. Create golden files in `data/golden/` → **commit + push**
5. Build `scripts/validate.ts` → **commit + push**

## Session C: Pipeline Orchestrator

1. Build `scripts/pipeline.ts` (check → download → parse → validate → insert) → **commit + push**
2. Add DB transaction wrapping + batchId rollback → **commit + push**
3. Add JSON regeneration after successful insert → **commit + push**
4. End-to-end test → **commit + push**

## Session D: Admin UI + Scheduling

1. Admin API routes → **commit + push**
2. Expand admin dashboard (pipeline status, review queue) → **commit + push**
3. GitHub Actions scheduled workflow → **commit + push**
4. Methodology page with real accuracy numbers → **commit + push**

## Key Constraints

- Pipeline runs locally or in GitHub Actions (NOT Vercel functions — timeout too short)
- Site keeps reading JSON at build time (no Neon dependency at deploy)
- drizzle-kit pull BEFORE generate (baseline auth tables)
- batchId on transactions for rollback
- DB transactions — COMMIT only if validation passes
- Push after every step for rollback safety
