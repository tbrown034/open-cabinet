/**
 * Compare a fresh reading of an official's filings to the published rows.
 * Pure. Used by scripts/reverify.ts to build the report and by tests.
 *
 * Matching runs in passes, each consuming what it pairs:
 *   1. the full tuple (filing, date, type, amount, late flag, ticker,
 *      description);
 *   2. the same asset with a different trade or wording: same filing and
 *      the same ticker or the same normalized description (case,
 *      punctuation and a trailing "(SYM)" ignored);
 *   3. the same trade with different words (filing, date, type, amount,
 *      late flag), only when the pairing is unambiguous: exactly one
 *      leftover on each side for that trade. Sixty-three $1,001-$15,000
 *      sales on one day are never paired to each other at random;
 *   4. the same row attributed to a different filing (an official who
 *      filed twice on one day): everything but the source URL equal.
 * Pairs from passes 2 and 3 are "changed", each labeled with the fields
 * that differ. What remains is removed or added.
 */
export interface RowLike {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string | null;
  lateFilingFlag: boolean;
  sourceUrl?: string;
}

/** Full-tuple key: everything a reader can see on the row. */
export function fullKey(t: RowLike): string {
  return [t.sourceUrl ?? "", t.date, t.type, t.amount ?? "unknown", t.lateFilingFlag ? 1 : 0, (t.ticker ?? "").toUpperCase(), t.description.trim().toLowerCase()].join("|");
}

/** Loose key: the trade without description or ticker, to pair "changed" rows. */
export function looseKey(t: RowLike): string {
  return [t.sourceUrl ?? "", t.date, t.type, t.amount ?? "unknown", t.lateFilingFlag ? 1 : 0].join("|");
}

/** Description with case, punctuation and a trailing symbol removed. */
export function normalizedDescription(d: string): string {
  return d
    .replace(/\s*\([A-Za-z.]{1,7}\)\s*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ChangedField = "type" | "date" | "amount" | "lateFilingFlag" | "ticker" | "description" | "sourceUrl";

export interface Change {
  before: RowLike;
  after: RowLike;
  fields: ChangedField[];
  /** True when only the ticker or the description wording moved; the
   * trade itself (type, date, amount, late flag) is the same. */
  wordingOnly: boolean;
}

export function changedFields(a: RowLike, b: RowLike): ChangedField[] {
  const f: ChangedField[] = [];
  if (a.type !== b.type) f.push("type");
  if (a.date !== b.date) f.push("date");
  if ((a.amount ?? null) !== (b.amount ?? null)) f.push("amount");
  if (!!a.lateFilingFlag !== !!b.lateFilingFlag) f.push("lateFilingFlag");
  if ((a.ticker ?? "").toUpperCase() !== (b.ticker ?? "").toUpperCase()) f.push("ticker");
  if (a.description.trim().toLowerCase() !== b.description.trim().toLowerCase()) f.push("description");
  if ((a.sourceUrl ?? "") !== (b.sourceUrl ?? "")) f.push("sourceUrl");
  return f;
}

export interface Diff {
  published: number;
  fresh: number;
  matched: number;
  changed: Change[];
  removed: RowLike[];
  added: RowLike[];
  /** Changes where the trade fields moved: the ones a person must read. */
  tradeChanged: number;
  /** Changes where only the ticker or wording moved. */
  wordingChanged: number;
}

function assetKeys(t: RowLike): string[] {
  const keys: string[] = [];
  if (t.ticker) keys.push(`${t.sourceUrl ?? ""}|T|${t.ticker.toUpperCase()}`);
  const d = normalizedDescription(t.description);
  if (d) keys.push(`${t.sourceUrl ?? ""}|D|${d}`);
  return keys;
}

function makeChange(before: RowLike, after: RowLike): Change {
  const fields = changedFields(before, after);
  return { before, after, fields, wordingOnly: fields.every((f) => f === "ticker" || f === "description" || f === "sourceUrl") };
}

export function diffRows(published: RowLike[], fresh: RowLike[]): Diff {
  const pubBy = new Map<string, RowLike[]>();
  for (const r of published) (pubBy.get(fullKey(r)) ?? pubBy.set(fullKey(r), []).get(fullKey(r))!).push(r);
  let matched = 0;
  let unmatchedFresh: RowLike[] = [];
  for (const r of fresh) {
    const bucket = pubBy.get(fullKey(r));
    if (bucket && bucket.length) {
      bucket.pop();
      matched++;
    } else unmatchedFresh.push(r);
  }
  let unmatchedPub = [...pubBy.values()].flat();
  const changed: Change[] = [];

  // Pass 2: same asset in the same filing. Prefer the candidate with the
  // fewest differing fields so a same-asset repeat pairs with its twin.
  {
    const pubByAsset = new Map<string, Set<RowLike>>();
    for (const r of unmatchedPub) for (const k of assetKeys(r)) (pubByAsset.get(k) ?? pubByAsset.set(k, new Set()).get(k)!).add(r);
    const taken = new Set<RowLike>();
    const stillFresh: RowLike[] = [];
    for (const r of unmatchedFresh) {
      const candidates = new Set<RowLike>();
      for (const k of assetKeys(r)) for (const c of pubByAsset.get(k) ?? []) if (!taken.has(c)) candidates.add(c);
      let best: RowLike | null = null;
      for (const c of candidates) {
        if (!best || changedFields(c, r).length < changedFields(best, r).length) best = c;
      }
      if (best) {
        taken.add(best);
        changed.push(makeChange(best, r));
      } else stillFresh.push(r);
    }
    unmatchedFresh = stillFresh;
    unmatchedPub = unmatchedPub.filter((r) => !taken.has(r));
  }

  // Pass 3: same trade, different words, only when unambiguous.
  {
    const pubByTrade = new Map<string, RowLike[]>();
    for (const r of unmatchedPub) (pubByTrade.get(looseKey(r)) ?? pubByTrade.set(looseKey(r), []).get(looseKey(r))!).push(r);
    const freshByTrade = new Map<string, RowLike[]>();
    for (const r of unmatchedFresh) (freshByTrade.get(looseKey(r)) ?? freshByTrade.set(looseKey(r), []).get(looseKey(r))!).push(r);
    const taken = new Set<RowLike>();
    const stillFresh: RowLike[] = [];
    for (const r of unmatchedFresh) {
      const p = pubByTrade.get(looseKey(r)) ?? [];
      const f = freshByTrade.get(looseKey(r)) ?? [];
      if (p.length === 1 && f.length === 1) {
        taken.add(p[0]);
        changed.push(makeChange(p[0], r));
      } else stillFresh.push(r);
    }
    unmatchedFresh = stillFresh;
    unmatchedPub = unmatchedPub.filter((r) => !taken.has(r));
  }

  // Pass 4: same row, different filing attribution.
  {
    const noUrl = (t: RowLike) => fullKey({ ...t, sourceUrl: "" });
    const pubByRow = new Map<string, RowLike[]>();
    for (const r of unmatchedPub) (pubByRow.get(noUrl(r)) ?? pubByRow.set(noUrl(r), []).get(noUrl(r))!).push(r);
    const taken = new Set<RowLike>();
    const stillFresh: RowLike[] = [];
    for (const r of unmatchedFresh) {
      const bucket = pubByRow.get(noUrl(r));
      const p = bucket?.pop();
      if (p) {
        taken.add(p);
        changed.push(makeChange(p, r));
      } else stillFresh.push(r);
    }
    unmatchedFresh = stillFresh;
    unmatchedPub = unmatchedPub.filter((r) => !taken.has(r));
  }

  const wordingChanged = changed.filter((c) => c.wordingOnly).length;
  return {
    published: published.length,
    fresh: fresh.length,
    matched,
    changed,
    removed: unmatchedPub,
    added: unmatchedFresh,
    tradeChanged: changed.length - wordingChanged,
    wordingChanged,
  };
}
