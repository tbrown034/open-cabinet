/**
 * Monthly trade aggregation, shared by every chart that buckets by month.
 *
 * This is the single aggregation path. The homepage hero thumbnail (all
 * officials rolled up) and the per-official sparklines in the directory table
 * both call `bucketByMonth` against the same axis from `buildMonthAxis`, so a
 * reader comparing the two is comparing identical arithmetic.
 */

import { isChartableDate } from "./chart-dates";

/** One month of activity for one series (an official, or the whole roster). */
export interface MonthBucket {
  monthKey: string; // YYYY-MM
  sales: number;
  purchases: number;
}

interface DatedTransaction {
  date: string;
  type: string;
}

/**
 * The site's transaction window.
 *
 * A handful of filings disclose trades made before the administration began
 * (23 of 9,919 as of July 2026, mostly 2024 with three from 2020). The
 * homepage has always described the dataset as "January 2025 to present", so
 * the axis starts there and those outliers sit outside every monthly chart.
 * They are still counted in the totals and on the official's own page.
 */
export const ACTIVITY_START_MONTH = "2025-01";

/**
 * Sale-side classification, matching how the rest of the site splits the
 * palette. "Exchange" (6 transactions) is not a sale and falls to the
 * purchase side, which is the convention already used across the codebase.
 */
export function isSaleType(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

/** YYYY-MM from an ISO date, or null when the date is missing or malformed. */
export function monthKeyOf(isoDate: string): string | null {
  if (!isoDate || isoDate.length < 7) return null;
  const key = isoDate.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

function nextMonth(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const rolls = month === 12;
  const y = rolls ? year + 1 : year;
  const m = rolls ? 1 : month + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Every month from the window start through the latest month that actually
 * has a transaction. Derived from the data rather than hardcoded, so the axis
 * and the caption extend on their own as filings are ingested.
 */
export function buildMonthAxis(
  transactions: DatedTransaction[],
  startMonth: string = ACTIVITY_START_MONTH,
  today: Date = new Date()
): string[] {
  let endMonth = startMonth;
  for (const tx of transactions) {
    // A date the filing prints that cannot be real (see lib/chart-dates.ts)
    // stays in the table and never extends the axis.
    if (!isChartableDate(tx.date, today)) continue;
    const key = monthKeyOf(tx.date);
    if (key && key > endMonth) endMonth = key;
  }

  const months: string[] = [];
  let cursor = startMonth;
  while (cursor <= endMonth) {
    months.push(cursor);
    cursor = nextMonth(cursor);
  }
  return months;
}

/**
 * Counts per month along a supplied axis. Passing the axis in (rather than
 * deriving it per call) is what keeps every row in the directory table
 * aligned to the same shared month scale under the table.
 */
export function bucketByMonth(
  transactions: DatedTransaction[],
  months: string[]
): MonthBucket[] {
  const index = new Map<string, MonthBucket>();
  for (const monthKey of months) {
    index.set(monthKey, { monthKey, sales: 0, purchases: 0 });
  }

  for (const tx of transactions) {
    const key = monthKeyOf(tx.date);
    if (!key) continue;
    const bucket = index.get(key);
    if (!bucket) continue; // outside the window
    if (isSaleType(tx.type)) bucket.sales += 1;
    else bucket.purchases += 1;
  }

  return months.map((m) => index.get(m)!);
}

/**
 * Tallest single-side value in a series. Charts scale against this rather
 * than against sales + purchases, so the busiest one-sided month reaches full
 * height instead of only half.
 */
export function peakMonthlyCount(buckets: MonthBucket[]): number {
  let peak = 0;
  for (const b of buckets) {
    if (b.sales > peak) peak = b.sales;
    if (b.purchases > peak) peak = b.purchases;
  }
  return peak;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_NAMES_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-06" to "Jun 2026". */
export function formatMonthShort(monthKey: string): string {
  const monthIndex = Number(monthKey.slice(5, 7)) - 1;
  return `${MONTH_NAMES[monthIndex]} ${monthKey.slice(0, 4)}`;
}

/** "2026-06" to "June 2026", for prose and aria-labels. */
export function formatMonthLong(monthKey: string): string {
  const monthIndex = Number(monthKey.slice(5, 7)) - 1;
  return `${MONTH_NAMES_LONG[monthIndex]} ${monthKey.slice(0, 4)}`;
}
