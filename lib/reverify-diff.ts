/**
 * Compare a fresh reading of an official's filings to the published rows.
 * Pure. Used by scripts/reverify.ts to build the report and by tests.
 *
 * Matching is by the full tuple first (filing, date, type, amount, late
 * flag, ticker, description). Leftovers on both sides are paired by the
 * trade alone (filing, date, type, amount, late flag) and reported as
 * "changed": the same trade, different words. What remains is removed or
 * added.
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

export interface Diff {
  published: number;
  fresh: number;
  matched: number;
  changed: Array<{ before: RowLike; after: RowLike }>;
  removed: RowLike[];
  added: RowLike[];
}

export function diffRows(published: RowLike[], fresh: RowLike[]): Diff {
  const pubBy = new Map<string, RowLike[]>();
  for (const r of published) (pubBy.get(fullKey(r)) ?? pubBy.set(fullKey(r), []).get(fullKey(r))!).push(r);
  let matched = 0;
  const unmatchedFresh: RowLike[] = [];
  for (const r of fresh) {
    const bucket = pubBy.get(fullKey(r));
    if (bucket && bucket.length) {
      bucket.pop();
      matched++;
    } else unmatchedFresh.push(r);
  }
  const unmatchedPub = [...pubBy.values()].flat();
  // Pair leftovers that share the loose key: same trade, different words.
  const looseBy = new Map<string, RowLike[]>();
  for (const r of unmatchedPub) (looseBy.get(looseKey(r)) ?? looseBy.set(looseKey(r), []).get(looseKey(r))!).push(r);
  const changed: Array<{ before: RowLike; after: RowLike }> = [];
  const added: RowLike[] = [];
  for (const r of unmatchedFresh) {
    const bucket = looseBy.get(looseKey(r));
    if (bucket && bucket.length) changed.push({ before: bucket.pop()!, after: r });
    else added.push(r);
  }
  const removed = [...looseBy.values()].flat();
  return { published: published.length, fresh: fresh.length, matched, changed, removed, added };
}

