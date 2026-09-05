import type { SourceFiling, Transaction } from "./types";

export {
  amountRangeToMin,
  amountRangeToMax,
  amountRangeLabel,
  amountRangeToMidpoint,
  transactionEstimate,
  sumAmountEstimates,
  isOpenEnded,
  NOT_ASCERTAINABLE_NOTE,
} from "./amounts";

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
 * For a given transaction, returns the 278-T filing that disclosed it.
 * Exact when the row carries a stamped sourceUrl (set at ingest, or by
 * backfill-tx-source.ts from parse caches). Otherwise falls back to a
 * heuristic: the earliest 278-T whose filed-date is on/after the
 * transaction date, then the most recent 278-T (covers late filings whose
 * tx date sits before the earliest filing in our list). The heuristic can
 * be wrong when a trade was disclosed later than the first eligible
 * filing — which is exactly the late-disclosure case — so stamped rows
 * always win.
 */
export function getSourceFilingForTransaction(
  tx: Transaction,
  sourceFilings: SourceFiling[] | undefined
): SourceFiling | null {
  if (!sourceFilings || sourceFilings.length === 0) return null;
  if (tx.sourceUrl) {
    const exact = sourceFilings.find((f) => f.url === tx.sourceUrl);
    if (exact) return exact;
  }
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

/**
 * Days between a transaction and the OGE posting of the filing that
 * disclosed it — the trade-to-public lag. This is the gap readers actually
 * care about on late filings; the form's own "over 30 days" flag only
 * certifies one leg of it. Null when either date is unparseable or the
 * filing (per our earliest-on-or-after heuristic) predates the trade.
 */
export function disclosureLagDays(
  txDate: string,
  filingDate: string
): number | null {
  const tx = new Date(normalizeDateString(txDate) + "T00:00:00").getTime();
  const filed = new Date(
    normalizeDateString(filingDate) + "T00:00:00"
  ).getTime();
  if (Number.isNaN(tx) || Number.isNaN(filed)) return null;
  const days = Math.round((filed - tx) / 86_400_000);
  return days >= 0 ? days : null;
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
