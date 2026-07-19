import type { AmountRange, SourceFiling, Transaction } from "./types";

/**
 * Returns the minimum dollar value from an amount range string.
 * Used for sorting and aggregation.
 */
export function amountRangeToMin(range: AmountRange): number {
  const map: Record<AmountRange, number> = {
    "$1,001-$15,000": 1001,
    "$15,001-$50,000": 15001,
    "$50,001-$100,000": 50001,
    "$100,001-$250,000": 100001,
    "$250,001-$500,000": 250001,
    "$500,001-$1,000,000": 500001,
    "$1,000,001-$5,000,000": 1000001,
    "$5,000,001-$25,000,000": 5000001,
    "$25,000,001-$50,000,000": 25000001,
    "Over $50,000,000": 50000001,
    "Over $1,000,000": 1000001,
  };
  return map[range];
}

/**
 * Returns a short human-readable label for an amount range.
 */
export function amountRangeLabel(range: AmountRange): string {
  const map: Record<AmountRange, string> = {
    "$1,001-$15,000": "$1K-$15K",
    "$15,001-$50,000": "$15K-$50K",
    "$50,001-$100,000": "$50K-$100K",
    "$100,001-$250,000": "$100K-$250K",
    "$250,001-$500,000": "$250K-$500K",
    "$500,001-$1,000,000": "$500K-$1M",
    "$1,000,001-$5,000,000": "$1M-$5M",
    "$5,000,001-$25,000,000": "$5M-$25M",
    "$25,000,001-$50,000,000": "$25M-$50M",
    "Over $50,000,000": "$50M+",
    "Over $1,000,000": "$1M+",
  };
  return map[range];
}

/**
 * Returns the midpoint dollar value from an amount range.
 * Used for estimated total value calculations.
 */
export function amountRangeToMidpoint(range: AmountRange): number {
  const map: Record<AmountRange, number> = {
    "$1,001-$15,000": 8000,
    "$15,001-$50,000": 32500,
    "$50,001-$100,000": 75000,
    "$100,001-$250,000": 175000,
    "$250,001-$500,000": 375000,
    "$500,001-$1,000,000": 750000,
    "$1,000,001-$5,000,000": 3000000,
    "$5,000,001-$25,000,000": 15000000,
    "$25,000,001-$50,000,000": 37500000,
    // Open-ended ranges have no true midpoint; both use 1.5x the floor,
    // an assumption disclosed on the methodology page.
    "Over $50,000,000": 75000000,
    "Over $1,000,000": 1500000,
  };
  return map[range];
}

/**
 * Formats a large number as compact currency: $1.2M, $500K, etc.
 */
export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

/**
 * Converts "Last, First" to "First Last" for display.
 */
export function displayName(name: string): string {
  const parts = name.split(",").map((s) => s.trim());
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`;
  return name;
}

/**
 * For a given transaction, returns the 278-T filing that disclosed it:
 * the earliest 278-T whose filed-date is on/after the transaction date.
 * Falls back to the most recent 278-T (covers late filings whose tx date
 * sits before the earliest filing in our list).
 */
export function getSourceFilingForTransaction(
  tx: Transaction,
  sourceFilings: SourceFiling[] | undefined
): SourceFiling | null {
  if (!sourceFilings || sourceFilings.length === 0) return null;
  const periodics = sourceFilings.filter((f) => f.url || f.label);
  if (periodics.length === 0) return null;
  const txTime = new Date(tx.date + "T00:00:00").getTime();
  const eligible = periodics.filter(
    (f) => new Date(normalizeDateString(f.date) + "T00:00:00").getTime() >= txTime
  );
  if (eligible.length > 0) {
    return eligible.reduce((earliest, f) =>
      new Date(normalizeDateString(f.date)).getTime() <
      new Date(normalizeDateString(earliest.date)).getTime()
        ? f
        : earliest
    );
  }
  return periodics.reduce((latest, f) =>
    new Date(normalizeDateString(f.date)).getTime() >
    new Date(normalizeDateString(latest.date)).getTime()
      ? f
      : latest
  );
}

function normalizeDateString(dateStr: string): string {
  return dateStr.includes("T") ? dateStr.slice(0, 10) : dateStr;
}

// AP style month names: Jan., Feb., Aug., Sept., Oct., Nov. and Dec. are
// abbreviated (with a period); March, April, May, June and July are spelled
// out. Indexed by JavaScript month number (0 = January).
const AP_MONTHS = [
  "Jan.",
  "Feb.",
  "March",
  "April",
  "May",
  "June",
  "July",
  "Aug.",
  "Sept.",
  "Oct.",
  "Nov.",
  "Dec.",
];

/**
 * Formats a date string (YYYY-MM-DD) as "Month DD, YYYY" using AP style
 * month names (e.g. "Sept. 4, 2026", "June 4, 2026").
 */
export function formatDate(dateStr: string): string {
  const normalized = normalizeDateString(dateStr);
  const date = new Date(normalized + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return `${AP_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
