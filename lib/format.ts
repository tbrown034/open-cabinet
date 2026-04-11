import type { AmountRange } from "./types";

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
  };
  return map[range];
}

/**
 * Formats a date string (YYYY-MM-DD) as "Mon DD, YYYY".
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
