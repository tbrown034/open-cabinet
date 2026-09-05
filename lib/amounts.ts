/**
 * The one place OGE 278-T amount bands are defined.
 *
 * A 278-T discloses each transaction as a dollar range, never an exact
 * figure. This catalog is the only source for the eleven legal range strings,
 * their bounds, their display labels and the site's estimate policy. Every
 * other file (format helpers, exports, summaries, the parser's enum check)
 * imports from here. Before this module existed there were three copies of
 * the midpoint table and two of them were missing "Over $1,000,000", which
 * put seventeen rows into the public CSV at $0.
 *
 * Estimate policy: bounded ranges use the arithmetic midpoint. Open-ended
 * ranges have no midpoint; the site uses 1.5x the floor and says so on the
 * methodology page. An unknown amount (the filing says "value not readily
 * ascertainable") is null, contributes nothing to any total, and is counted
 * separately so a reader can see how many rows were excluded.
 */

export interface AmountBand {
  readonly key: string;
  /** Lower bound in whole dollars. */
  readonly min: number;
  /** Upper bound in whole dollars, or null for an open-ended range. */
  readonly max: number | null;
  /** Compact display label, e.g. "$1K-$15K". */
  readonly label: string;
  /** The site's estimate for this band under the policy above. */
  readonly estimate: number;
}

export const AMOUNT_BANDS = [
  { key: "$1,001-$15,000", min: 1_001, max: 15_000, label: "$1K-$15K", estimate: 8_000 },
  { key: "$15,001-$50,000", min: 15_001, max: 50_000, label: "$15K-$50K", estimate: 32_500 },
  { key: "$50,001-$100,000", min: 50_001, max: 100_000, label: "$50K-$100K", estimate: 75_000 },
  { key: "$100,001-$250,000", min: 100_001, max: 250_000, label: "$100K-$250K", estimate: 175_000 },
  { key: "$250,001-$500,000", min: 250_001, max: 500_000, label: "$250K-$500K", estimate: 375_000 },
  { key: "$500,001-$1,000,000", min: 500_001, max: 1_000_000, label: "$500K-$1M", estimate: 750_000 },
  { key: "$1,000,001-$5,000,000", min: 1_000_001, max: 5_000_000, label: "$1M-$5M", estimate: 3_000_000 },
  { key: "$5,000,001-$25,000,000", min: 5_000_001, max: 25_000_000, label: "$5M-$25M", estimate: 15_000_000 },
  { key: "$25,000,001-$50,000,000", min: 25_000_001, max: 50_000_000, label: "$25M-$50M", estimate: 37_500_000 },
  // Open-ended. No true midpoint; 1.5x the floor, disclosed on /methodology.
  { key: "Over $50,000,000", min: 50_000_001, max: null, label: "$50M+", estimate: 75_000_000 },
  // OGE caps spouse- and dependent-held asset values at this open-ended
  // range, so some filings report it instead of a bounded bracket.
  { key: "Over $1,000,000", min: 1_000_001, max: null, label: "$1M+", estimate: 1_500_000 },
] as const satisfies readonly AmountBand[];

export type AmountRange = (typeof AMOUNT_BANDS)[number]["key"];

export const AMOUNT_RANGE_KEYS: readonly AmountRange[] = AMOUNT_BANDS.map((b) => b.key);

const BY_KEY: ReadonlyMap<string, AmountBand> = new Map(
  AMOUNT_BANDS.map((b) => [b.key, b] as const)
);

/** The exact phrase OGE prints when a filer cannot state a value. */
export const NOT_ASCERTAINABLE_NOTE = "Value not readily ascertainable";

export function isAmountRange(value: unknown): value is AmountRange {
  return typeof value === "string" && BY_KEY.has(value);
}

/**
 * Looks up a band. Throws on anything that is not one of the eleven legal
 * strings. A thrown error at build or ingest time is the point: the old
 * lookups returned undefined, which became NaN in a sum and "$NaN" on the
 * homepage with green CI.
 */
export function amountBand(range: string): AmountBand {
  const band = BY_KEY.get(range);
  if (!band) {
    throw new Error(
      `Unknown amount range "${range}". Legal values: ${AMOUNT_RANGE_KEYS.join(", ")}`
    );
  }
  return band;
}

export function amountRangeToMin(range: AmountRange): number {
  return amountBand(range).min;
}

export function amountRangeToMax(range: AmountRange): number | null {
  return amountBand(range).max;
}

export function amountRangeLabel(range: AmountRange): string {
  return amountBand(range).label;
}

export function amountRangeToMidpoint(range: AmountRange): number {
  return amountBand(range).estimate;
}

export function isOpenEnded(range: AmountRange): boolean {
  return amountBand(range).max === null;
}

/**
 * Estimate for one transaction, or null when the amount is unknown.
 * Callers that sum should use sumAmountEstimates so unknown rows are
 * counted, not silently dropped.
 */
export function transactionEstimate(tx: { amount: AmountRange | null }): number | null {
  return tx.amount === null ? null : amountRangeToMidpoint(tx.amount);
}

export interface AmountTotals {
  /** Sum of the site's estimates over rows with a known range. */
  estimate: number;
  /** Sum of range floors over rows with a known range. */
  floor: number;
  /** Rows in an open-ended range; their estimate is a policy, not a midpoint. */
  openEndedCount: number;
  /** Rows whose amount is unknown; excluded from estimate and floor. */
  unknownCount: number;
  /** Rows with a known range. */
  knownCount: number;
}

export function sumAmountEstimates(
  txs: ReadonlyArray<{ amount: AmountRange | null }>
): AmountTotals {
  const totals: AmountTotals = {
    estimate: 0,
    floor: 0,
    openEndedCount: 0,
    unknownCount: 0,
    knownCount: 0,
  };
  for (const tx of txs) {
    if (tx.amount === null) {
      totals.unknownCount += 1;
      continue;
    }
    const band = amountBand(tx.amount);
    totals.estimate += band.estimate;
    totals.floor += band.min;
    totals.knownCount += 1;
    if (band.max === null) totals.openEndedCount += 1;
  }
  return totals;
}
