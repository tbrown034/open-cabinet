# Open Cabinet — Holdings Expansion Plan

**Status:** draft for review
**Authored:** April 28, 2026
**Synthesized from:** four parallel agent investigations (claims audit, schema/pipeline design, divestiture visualization, rollout/copy plan)
**Top constraint:** do no harm. Site is in front of Texas Tribune editors. Every change is reversible. Honest under-claiming is the default.

---

## Why we're doing this

The site currently ingests one document type: **OGE Form 278-T (Periodic Transaction Report)** — individual stock trades over $1,000. Three other public document types exist for our 34 officials and we ingest none of them:

- **Nominee 278** (entry holdings, filed before confirmation) — what each official walked in owning. ~30 publicly downloadable PDFs.
- **Annual 278e** — comprehensive yearly disclosure. **First Trump-2 wave drops May 15, 2026** — 17 days from now.
- **Termination 278e** — end-of-service comprehensive disclosure. ~3-5 relevant officials so far.

**The problem this creates:** the site shows what officials *traded* but not what they *held*. Buy-and-hold conflicts of interest are invisible. Divestiture compliance can't actually be verified — yet copy on the site implies it can.

**The fix is two-part:**
1. **Right now:** revise copy that overclaims and ship a small honesty pass to production. No new data needed.
2. **Over the next two weeks:** ingest Nominee 278 holdings for our 34 officials. Build a divestiture compliance visualization. Be ready for the May 15 Annual wave.

This work also positions us well for Biden / multi-administration coverage later — the same parser handles all 278e variants — but Biden is explicitly out of scope for this initiative.

---

## Risk assessment of current site

A claims audit produced a confidence score of **6/10 — high risk if a Tribune editor scrutinized claims against data.** The most exposed places, in priority order:

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | CRITICAL | `app/officials/[slug]/page.tsx:177-181` | Hard-coded "All transactions were sales — consistent with ethics agreement divestitures." This is unverifiable without baseline holdings data. |
| 2 | CRITICAL | `app/components/transaction-timeline.tsx:165` | Same divestiture-consistency claim repeated in tooltip |
| 3 | CRITICAL | `app/page.tsx:205` + `app/dashboard/page.tsx:118` + `app/layout.tsx:37` | "$2.7B est. value" reads as net worth or exposure. Actually transaction volume (buys + sells double-counted). |
| 4 | MEDIUM | `app/page.tsx:140` hero | "What is Trump's Cabinet Buying and Selling?" implies fuller scope than 278-T-only data |
| 5 | MEDIUM | `app/companies/page.tsx:57` | "Most widely held" should be "Most traded by officials" — held implies current ownership |
| 6 | MEDIUM | `app/components/sector-treemap.tsx` titles | "Transaction volume by asset category" needs "(combined buys and sells)" qualifier |
| 7 | MEDIUM | `app/components/explainer.tsx:37-41` | Explainer says OGE reviews compliance without noting the site cannot verify it |

Phase 0 ships fixes for all of these.

---

## Phased rollout

Each phase is independently shippable and independently revertible. Phase boundaries are gates: do not move on until the current phase is verified live.

### Phase 0 — Honesty pass (today)

**Scope:** copy edits and the `is278T` matcher bug fix (`"278T"` substring matches `"278TERM"`). No new data files. No new pipelines.

**Branch:** `copy/honesty-pass-phase-0`

**Files touched:**
- `app/page.tsx` — hero sub-headline, stats bar relabel
- `app/methodology/page.tsx` — new "What we ingest, and what we don't" section
- `app/about/page.tsx` — new "What this site covers" paragraph
- `app/officials/[slug]/page.tsx` — replace lines 177-182 divestiture claim with honest version
- `app/components/transaction-timeline.tsx` — tooltip same fix
- `app/components/sector-treemap.tsx` — title qualifier
- `app/companies/page.tsx` — "Most widely held" → "Most traded by officials"
- `scripts/check-new-filings.ts` — `is278T()` regex tightening (already done, push as part of this PR)

**Definition of done:** preview deploy verified on `/`, `/methodology`, `/about`, three `/officials/[slug]` (Lutnick, Trump, Bisignano). Stats-bar dollar number is byte-identical to current production. PR squash-merged. Production verified live.

**Trigger to move on:** PR merged, production verified live by clicking through the same five pages within 5 minutes of deploy.

### Phase 1 — Single test official: Lutnick

**Scope:** prove the entire holdings pipeline end-to-end on one official before backfilling anyone else.

**Branch:** `data/holdings-lutnick-test` (off `main` after Phase 0)

**Why Lutnick:** large, public, contentious divestiture (Cantor Fitzgerald / BGC / Newmark). ProPublica has hosted his Nominee 278 — gives us an external cross-check. Existing 278-T data is rich enough to spot regressions.

**What ships in Phase 1:**
- New TypeScript types: `Holding`, `HoldingsFiling`, `IncomeAmountRange` in `lib/types.ts`
- `data/officials/lutnick-howard.json` gains a new optional `holdings` array (existing `transactions` array byte-unchanged)
- New section on Lutnick's official page: "Entry holdings (Nominee 278)" with simple sortable table
- Phase-1 derived summary string replaces the Phase 0 honest-but-static one *for Lutnick only*
- The divestiture visualization (see "Visualization" section below) renders for Lutnick

**What does NOT ship:**
- No homepage stats changes (holdings ≠ transactions; counts and dollar totals must be byte-identical)
- No `/all`, `/dashboard`, `/companies` changes
- No download/CSV export changes
- No other officials touched

**Definition of done:**
- Every BGC, Newmark, Cantor entry holding line is matched by description text to the corresponding 278-T sale row already in the file
- Parsed entry-holding count matches ProPublica's hosted version of the same PDF within ±1 row
- Cross-check: every divested asset in `transactions[]` is present in `holdings[]` (you cannot sell what you didn't own)
- OpenAI gpt-5.4-mini cross-check agreement ≥ 95% on `(section, itemNumber, value)` tuples
- Zero changes to existing `transactions`, `summary`, or any other field of Lutnick's JSON
- `pnpm validate` passes; less than 5% of holding rows flagged `needsReview`
- Cross-validation log entry added to `docs/devlog.md`

**Trigger to move on:** explicit user OK after viewing Lutnick on production. Not before.

### Phase 2 — Backfill remaining 33 officials

**Branch:** `data/holdings-backfill` (rebased onto Phase 1 branch after merge)

**Order:** Cabinet first (Bessent, Bondi, Hegseth, Kennedy, Burgum, Noem, Wright, Zeldin, Duffy, McMahon, Chavez-DeRemer, Turner) → Sub-Cabinet → Senior Staff. **Trump last** (zero-holdings edge case, exempt from divestiture, viz must not render for him).

**Strategy:** batches of 5 officials per PR. Each batch gets its own preview deploy and ProPublica spot-check.

**Definition of done per batch:** preview reviewed, ProPublica spot-check logged, no regression on any other page, homepage stats bar unchanged.

**Trigger to move on:** all 34 officials have `holdings`. CSV/JSON exports regenerated to include the new data. Download page copy updated.

### Phase 3 — Divestiture visualization rollout

The compliance ribbon (see "Visualization" section). Shipped in two stages:

**3a:** ribbon renders for Lutnick only as part of Phase 1.
**3b:** once Phase 2 completes, ribbon renders for every eligible official (rule: `entryHoldings.length > 0 AND confirmedDate exists AND totalEntryValue > $250K`). Trump never renders.

### Phase 4 — May 15 Annual readiness

**Why this is its own phase:** the first Trump-2 Annual cycle lands in 17 days. Same parser, same form layout, but now Part 7 (Transactions) will be non-empty and must route to the existing 278-T transaction pipeline.

**Pre-May 1 work:**
- Add Part 7 routing to the holdings sectioner (Annual 278e Part 7 → existing transaction pipeline; Parts 2/5/6 → holdings pipeline)
- Add `is278Annual()` filter to `check-new-filings.ts`
- Set up daily cron in `vercel.json` running April 15 → June 30
- `lib/notify.ts` alert when ≥ 3 new 278 Annual filings detected in one day ("Annual 278e wave detected — N new filings")
- Dry-run on a 2024 Biden-era Annual already in OGE so we catch parser surprises before May 15

**May 15+:** ingest Annuals as they drop. The "diff vs Nominee 278" view becomes the journalism payoff: what each official acquired, divested, or revalued in their first year.

---

## Data model (additive, non-breaking)

Append to `lib/types.ts`:

```ts
export type IncomeAmountRange =
  | "None (or less than $201)" | "$1-$200" | "$201-$1,000"
  | "$1,001-$2,500" | "$2,501-$5,000" | "$5,001-$15,000"
  | "$15,001-$50,000" | "$50,001-$100,000" | "$100,001-$1,000,000"
  | "$1,000,001-$5,000,000" | "Over $5,000,000";

export type HoldingsSource =
  | "nominee_278" | "annual_278e" | "termination_278e" | "new_entrant_278e";

export type HoldingSection = "Part 2" | "Part 5" | "Part 6";

export interface Holding {
  section: HoldingSection;
  itemNumber: string;            // "1", "1.1", "1.2" — preserve OGE structure
  parentItemNumber: string | null;
  description: string;
  ticker: string | null;
  assetType: string | null;       // "EIF", "IRA", "Common Stock", etc.
  value: AmountRange | "None (or less than $1,001)" | null;
  incomeType: string | null;
  incomeAmount: IncomeAmountRange | null;
  isEIF: boolean;
  notes: string | null;
  confidence: number;
  needsReview: boolean;
}

export interface HoldingsFiling {
  source: HoldingsSource;
  asOfDate: string;               // ISO
  filingDate: string;
  pdfUrl: string;
  pdfSha256: string;              // stable identity across URL changes
  extractedAt: string;
  extractor: string;              // "natural-pdf+claude-code-subagent@v1"
  holdings: Holding[];
  filingConfidence: number;
  warnings: string[];
}

// Extension to existing OfficialData — additive
export interface OfficialData {
  // ...all existing fields unchanged...
  holdings?: HoldingsFiling[];   // Optional. Multiple per official (Nominee + Annual + Termination).
}
```

**Key design decisions:**
- Preserve OGE parent/sub-item structure (1, 1.1, 1.2) — never flatten. Sub-items are sub-holdings of an umbrella account; flattening loses the account container.
- `holdings` is an *array of filings*, not a flat array of holdings. One official accumulates Nominee → Annual → Annual → Termination over their tenure.
- `pdfSha256` is the stable identity. URLs and titles change; bytes don't.

Drizzle schema additions (in `lib/schema.ts`) follow the same shape with a unique constraint on `(officialId, pdfSha256, section, itemNumber, description)` for idempotent re-parsing.

---

## Pipeline (zero Anthropic API cost)

The Trump-2 pipeline used Claude Sonnet API at ~$0.05/PDF. The new pipeline uses **Claude Code subagents under the Max plan ($0)** with **gpt-5.4-mini cross-checks at ~$0.01/PDF** as a safety net. Total cost for the full Nominee 278 backfill: **~$0.30**.

**Architecture:**

1. **Download** (`scripts/download-nominee-pdfs.ts`) — poll OGE API, filter for Nominee 278 records belonging to our 34 officials, download to `data/pdfs/nominee/`, compute SHA-256.

2. **Section** (`scripts/holdings/section-text.py`) — natural-pdf `extract_text()` per page, then split by Part 2/5/6/7 anchor headers. Output JSON with raw text per part.

3. **Skeleton** (`scripts/holdings/skeleton.py`) — regex pre-pass extracts item-number lines (`^\d+(?:\.\d+)?`) so subagents have a structural seed.

4. **Subagent extraction** — slash command `/extract-holdings` spawns Task subagents in parallel, each handling one PDF's pre-sectioned JSON. Returns structured `Holding[]`. Free under Max plan.

5. **OpenAI cross-check** (`scripts/holdings/verify-openai.ts`) — second pass via gpt-5.4-mini for diff. Never auto-overwrites; flags mismatches for review.

6. **Validate** (`scripts/holdings/validate.ts`) — schema rules + cross-row sanity (sub-items don't sum past parent value bucket × 2, etc.).

7. **Merge** (`scripts/holdings/merge-into-official.ts`) — write final `holdings` array into `data/officials/<slug>.json` with `.bak` backup.

8. **Index rebuild** — extend `scripts/rebuild-index.ts` to compute `holdingsCount` and `hasNomineeHoldings` per official.

**Critical: staging is gitignored.** All intermediate artifacts (sections JSON, raw subagent output, OpenAI diffs) live in `data/holdings-staging/` which never gets committed. Only the merged `holdings` array on each official lands in git.

---

## Visualization: the compliance ribbon

**Decision: not a Sankey.** Sankey diagrams imply mass conservation, but disclosure data is range-based and deliberately lossy — entry holdings reported as "Over $50M" can't reconcile to specific sale amounts within ±50%. A Sankey would visibly leak and a literal-minded reader would treat the gap as fact ("$28M unaccounted for!"). That's a journalism liability.

**Decision: a paired horizontal "compliance ribbon."** Two stacked bars at full container width, with thin connector lines between matching tickers:

```
ENTRY HOLDINGS (Jan 2025)
┌────────────────────────────────────────────────────────────┐
│ BGC Group         │ Cantor/Newmark │ Nasdaq │ Disney │ ... │  ~$500M+
└────────────────────────────────────────────────────────────┘
  ╲      ╲ ╲          ╲    ╲           ╲       │
   ╲      ╲ ╲          ╲    ╲           ╲      │  thin gray
    ╲      ╲ ╲          ╲    ╲           ╲     │  connectors,
     ╲      ╲ ╲          ╲    ╲           ╲    │  one per ticker
┌────────────────────────────────────────────────────────────┐
│ BGC SOLD          │ Newmark SOLD   │ NDAQ S │ DIS S │░░░░░│
└────────────────────────────────────────────────────────────┘
  SOLD: $474.9M (May–Nov 2025, 51 transactions)
  ░░ amount unclear / still held
```

**Visual language:**
- Solid stone-700 fill = definitively divested (matched sale exists)
- Cross-hatched gray = "amount unclear" or partial sale where remainder can't be computed
- Outlined-only = "still held per most recent filing"
- "Over $50M" segments get a right-edge fade arrow to signal "value extends beyond what's shown"

**Headline above chart:** "Sold $474.9M in 51 transactions over six months." That's the takeaway.

**Mobile (375px):** stack vertically, drop connectors, add a "top 5 divested positions" list below.

**Eligibility rule** — render whenever both data sources are present:
- `holdings.length > 0` (we have a Nominee 278 parsed)
- `transactions.length > 0` (we have at least one 278-T)

No dollar threshold. No editorial gating. The chart shows the data we have; readers draw their own conclusions. Officials with no parsed Nominee 278 simply don't get the section. Trump won't render because he has no Nominee 278 (President is exempt from filing one), not because of any subjective "too small" rule.

**Placement:** new section on `/officials/[slug]` between the stat row and the transaction timeline. The timeline becomes the *evidence*; the ribbon becomes the *thesis*.

**Modules:** `d3-scale`, `d3-array`, `d3-shape` (with `curveBumpY` for connectors), `d3-format`. **Do not install d3-sankey.**

Implementation closely mirrors `app/components/sector-treemap.tsx` for layout, ResizeObserver, hover state, and palette.

---

## Phase 0 copy revisions (draft, ready to ship)

### Hero — `app/page.tsx:139-143`

```tsx
<h1>What is Trump's Cabinet Buying and Selling?</h1>
<p>
  Individual stock trades disclosed to the Office of Government Ethics —
  the slice of executive financial activity the public is allowed to see.
</p>
```

Keeps the punch, adds the scope line.

### Stats bar — `app/page.tsx:203-208`

Change label: `"est. value"` → `"trade volume (est.)"`

Add visible microcopy directly under the stats bar (don't bury in a footnote):

> Trade volume is the midpoint of the reporting ranges, summed across all disclosed transactions. It is not portfolio value, net worth, or exposure — and a single position bought and sold counts twice.

### Methodology — `app/methodology/page.tsx`, new section after hero

> **What we ingest, and what we don't**
>
> Senior executive branch officials file three different financial disclosure documents with the Office of Government Ethics. Open Cabinet ingests one of them today, and is in the process of adding a second.
>
> - **OGE Form 278-T (Periodic Transaction Report).** Filed within 30 to 45 days of any individual-security transaction over $1,000. This is what powers the trades, dollar volume and late-filing counts on this site.
> - **OGE Form 278 (Nominee/Entry Report).** Filed once, before Senate confirmation, listing every asset the official held going in. This is the baseline against which divestitures should be measured. Nominee 278 ingestion is in progress; until it is complete, this site cannot tell you whether an official has fully divested a holding — only what they have traded.
> - **OGE Form 278e (Annual Report).** Filed every May 15 by every covered official, restating holdings and transactions for the prior year. We will ingest these as the May 2026 cycle lands.
>
> Until Nominee 278 data is in, statements like "consistent with ethics agreement divestitures" are not something this site can support from data alone — only from a side-by-side reading of the ethics agreement and the trades on file.

### About — `app/about/page.tsx`, new "What this site covers" section

> Open Cabinet shows individual-security trades disclosed via OGE Form 278-T — the periodic transaction reports senior officials must file within 30 to 45 days of a trade. It does not show every financial move an official makes. It does not show holdings inside diversified mutual funds, exempt trust assets, real estate, private equity not actively traded, or anything that falls below the statutory $1,000 reporting threshold. Entry-disclosure holdings (Nominee 278) are being added next; annual reports (278e) follow in May.

### Per-official summary — `app/officials/[slug]/page.tsx:177-182`

**Phase 0 (today, before any holdings data):**

> Every transaction on file is a sale. This is the pattern you would expect from an official liquidating positions to comply with an ethics agreement, but Open Cabinet does not yet ingest the entry-disclosure baseline needed to confirm which holdings have been fully divested.

**Phase 1+ (once `holdings` is on the official, derived from data):**

> Of the {N} individual-security positions disclosed on the entry Nominee 278, {M} have at least one matching sale on file. The remaining {N-M} are not visible in transaction data — they may have been sold below the $1,000 reporting threshold, transferred, or not yet reported.

Never says "divested" or "complied." Says "matching sale on file."

### Other quick fixes (Phase 0)

| File | Change |
|---|---|
| `app/components/transaction-timeline.tsx:165` | Tooltip: replace "consistent with a coordinated divestiture" with "consistent with a coordinated divestiture pattern (compliance verification requires baseline data)" |
| `app/components/sector-treemap.tsx:59,113` | Title: append "(combined buys and sells)" |
| `app/companies/page.tsx:57` | "Most widely held" → "Most traded by officials" |
| `app/components/explainer.tsx:37-41` | Compliance step: add caveat that this site shows transactions only |

---

## Stress test scenarios (Phase 1)

| Scenario | Test against | What to verify |
|---|---|---|
| Standard case | Lutnick | Every divested asset matches an entry holding; ProPublica row count within ±1 |
| Zero holdings | Trump | Page renders with no empty "Entry holdings" section. Conditional rendering works. |
| Large holdings count | Bisignano (golden file already exists, known-large filer) | Layout doesn't break; build time stays under 30s yellow flag |
| Very large position values | Lutnick (multiple "Over $50,000,000") | "Over $50M" row renders the right-edge fade; doesn't overflow table |
| Holding-not-traded | Officials whose Nominee 278 lists positions never appearing in any 278-T sale | Status logic returns "no matching sale on file" — never "failed to divest" |
| Spousal-only holdings | Pick official whose Nominee 278 has Part 5 entries | Part 5 holdings render distinctly; spousal flag visible |

---

## Cross-validation

For each official:

1. Open OGE-hosted Nominee 278 and ProPublica-hosted version side-by-side
2. Count rows on the holdings schedule (Schedule A or equivalent)
3. Compare to `holdings.length` in parsed JSON
4. Spot-check three rows: first, largest dollar value, one with a missing ticker (private LLC, retirement account)
5. Description string and amount range must match exactly
6. Log result in `docs/devlog.md` under "Nominee 278 ingest" with date and reviewer

---

## Kill criteria

Stop and re-plan if any of these fire:

1. **The matcher bug fix changes any transaction count on any official by more than zero.** The fix should reclassify, not delete or duplicate.
2. **After Lutnick's holdings land on a preview, his transactions array shows any change.** It must not.
3. **ProPublica row count vs parsed row count differs by >5% on Lutnick.** Stop and review the parser before touching anyone else.
4. **Homepage build time grows by more than 50%** after holdings rollout to all officials.
5. **A reader email or Tribune editor question references "the holdings number is wrong" or "the trade volume jumped."** Roll back via Vercel within the same session and diagnose offline.
6. **The pipeline emits a holding row with a `transactionType` field, or a transaction row with a `holdingValue` field.** Type confusion → stop, fix the type, re-parse from scratch.
7. **Any factual claim on the live site that the underlying data cannot support.** This is the bright line.

---

## Reversibility checklist

- [ ] Phase 0 PR: copy edits + matcher fix; preview-reviewed; merge to main
- [ ] Phase 1 branch: never merged until Lutnick test passes; `.bak` of Lutnick JSON committed alongside change
- [ ] Vercel "instant rollback" available for first 24 hours after each deploy
- [ ] `git revert <sha>` is the durable rollback path; never `--force` push to main
- [ ] Holdings staging is gitignored; abandoning a parse leaves no committed artifacts
- [ ] DB migration for `holdings` table is reversible (drop the table)

---

## What this plan deliberately does NOT do

- **No Biden ingest.** Stays out of scope. Notes in pipeline that the same parser handles Biden Annuals if we want them later.
- **No homepage rework.** The hero stays "What is Trump's Cabinet Buying and Selling?" — just gets a sub-headline. The user's stashed homepage WIP is unrelated and ships separately.
- **No design system overhaul.** The compliance ribbon reuses sector-treemap's palette and ResizeObserver pattern.
- **No Form 201 requests.** Form-201-only officials (most Biden cabinet 278-Ts) stay out of scope; the asymmetry between Trump-2 and Biden coverage is acknowledged in the methodology page.

---

## Decisions locked in (April 28, 2026)

1. **Hero copy:** Option A — keep "What is Trump's Cabinet Buying and Selling?" + add a scope sub-headline.
2. **Trade volume label:** `"trade volume (est.)"`.
3. **Lutnick test sign-off:** preview-deploy eyeball + one-line log entry in `docs/devlog.md` ("Lutnick test passed, X holdings parsed, ProPublica row count match: Y/Z").
4. **May 15 Annual announcement:** silent data update for now. Revisit after the initial wave is ingested.
5. **Compliance ribbon eligibility:** no threshold, no editorial gating. Render whenever both `holdings` and `transactions` are present. Trump won't render because he has no Nominee 278 (President is exempt from filing one), not because of any "too small" judgment call.

---

## Files this plan touches (full inventory)

**Phase 0 only (today):**
- `app/page.tsx`
- `app/methodology/page.tsx`
- `app/about/page.tsx`
- `app/officials/[slug]/page.tsx`
- `app/components/transaction-timeline.tsx`
- `app/components/sector-treemap.tsx`
- `app/components/explainer.tsx`
- `app/companies/page.tsx`
- `scripts/check-new-filings.ts` (matcher fix already in working tree)

**Phase 1+:**
- `lib/types.ts` (add types)
- `lib/schema.ts` (add holdings table)
- `data/officials/lutnick-howard.json` (new `holdings` array, `.bak` saved)
- `data/golden/lutnick-howard-nominee.golden.json` (regression baseline)
- `app/components/divestiture-ribbon.tsx` (new)
- New scripts under `scripts/holdings/` (sectioner, skeleton, subagent prompt, validator, merger, OpenAI verifier)
- `scripts/parse-holdings.ts`, `scripts/download-nominee-pdfs.ts` (new top-level)
- `.claude/commands/extract-holdings.md` (new slash command)
- `package.json` (new scripts)
- `drizzle/` (new migration)
