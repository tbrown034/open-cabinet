/**
 * Where every number in an answer comes from.
 *
 * This module runs a validated plan over the published rows and returns the
 * result. No model is involved and no model output reaches it. It is ordinary
 * filtering and arithmetic against the same amount catalog the rest of the
 * site uses (lib/amounts.ts), which means an answer and the page a reader can
 * open agree by construction.
 *
 * Two things come back beside the data: `numbers`, every raw figure the result
 * contains, and `displayStrings`, the preformatted way the site would print
 * them. The phrasing check in check.ts compares the model's sentence against
 * those two lists, so a rounded figure is allowed only when this file produced
 * the rounding.
 */
import { amountRangeToMin, sumAmountEstimates, amountRangeLabel } from "../amounts";
import { formatCompactCurrency, formatDate } from "../format";
import type { PendingRow, PublishedRow, PublishedRowsData } from "../published-rows";
import type { Aggregate, QueryPlan } from "./plan";

export interface ResultRow {
  officialName: string;
  officialSlug: string;
  agency: string;
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  dateDisplay: string;
  amount: string | null;
  amountLabel: string | null;
  lateFilingFlag: boolean;
  sourceUrl: string | null;
  verificationState: string;
}

export interface RankedOfficial {
  name: string;
  slug: string;
  count: number;
  estimate: number;
  estimateDisplay: string;
}

export interface RankedAsset {
  ticker: string | null;
  label: string;
  count: number;
  estimate: number;
  estimateDisplay: string;
}

export interface MonthCount {
  month: string;
  count: number;
}

export interface ExecuteResult {
  aggregate: Aggregate;
  /** Rows the filters matched, before any display cap. */
  matchedRows: number;
  /** Rows shown, when the aggregate lists or ranks. */
  shownRows?: number;
  count?: number;
  totals?: {
    estimate: number;
    estimateDisplay: string;
    estimateCompact: string;
    knownCount: number;
    unknownCount: number;
    openEndedCount: number;
  };
  rows?: ResultRow[];
  topOfficials?: RankedOfficial[];
  topAssets?: RankedAsset[];
  byMonth?: MonthCount[];
  firstDate?: string | null;
  lastDate?: string | null;
  /** Every raw figure in this result. */
  numbers: number[];
  /** Every preformatted figure or date string in this result. */
  displayStrings: string[];
}

const DEFAULT_LIST_LIMIT = 10;
const DEFAULT_RANK_LIMIT = 5;

/**
 * "Sale" in a question means every sale the form records, including
 * "Sale (Partial)" and "Sale (Full)". Matching the exact string only would
 * quietly undercount, which is worse than being explicit about the family.
 */
function typeMatches(rowType: string, wanted: string[]): boolean {
  return wanted.some((w) => {
    if (w === rowType) return true;
    if (w === "Sale") return rowType.startsWith("Sale");
    return false;
  });
}

export function filterRows(plan: QueryPlan, rows: PublishedRow[]): PublishedRow[] {
  const f = plan.filters;
  const officials = f.officials ? new Set(f.officials) : null;
  const tickers = f.tickers ? new Set(f.tickers) : null;
  const needle = f.descriptionContains?.toLowerCase() ?? null;

  return rows.filter((row) => {
    if (officials && !officials.has(row.officialSlug)) return false;
    if (tickers && (!row.ticker || !tickers.has(row.ticker))) return false;
    if (needle && !row.description.toLowerCase().includes(needle)) return false;
    if (f.types && f.types.length > 0 && !typeMatches(row.type, f.types)) return false;
    if (f.dateFrom && row.date < f.dateFrom) return false;
    if (f.dateTo && row.date > f.dateTo) return false;
    if (f.lateOnly && !row.lateFilingFlag) return false;
    if (f.amountAtLeast !== undefined) {
      // An unknown amount cannot clear a dollar floor, so it is excluded here
      // the same way it is excluded from every total.
      if (row.amount === null) return false;
      if (amountRangeToMin(row.amount) < f.amountAtLeast) return false;
    }
    return true;
  });
}

/**
 * The same filters over the rows no check has cleared. This is what separates
 * "we do not track that" from "we track it and none of it is verified yet."
 */
export function countPending(
  plan: QueryPlan,
  pendingRows: PendingRow[]
): { underReview: number; notYetChecked: number } {
  const matched = filterRows(plan, pendingRows) as PendingRow[];
  return {
    underReview: matched.filter((r) => r.pending === "underReview").length,
    notYetChecked: matched.filter((r) => r.pending === "notYetChecked").length,
  };
}

/** Long form, "$4.5 million", for figures a sentence would round. */
export function spellDollars(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)} billion`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)} million`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)} thousand`;
  return `$${value.toLocaleString("en-US")}`;
}

function moneyStrings(value: number): string[] {
  return [
    `$${value.toLocaleString("en-US")}`,
    formatCompactCurrency(value),
    spellDollars(value),
  ];
}

function toResultRow(row: PublishedRow): ResultRow {
  return {
    officialName: row.officialName,
    officialSlug: row.officialSlug,
    agency: row.agency,
    description: row.description,
    ticker: row.ticker,
    type: row.type,
    date: row.date,
    dateDisplay: formatDate(row.date),
    amount: row.amount,
    amountLabel: row.amount ? amountRangeLabel(row.amount) : null,
    lateFilingFlag: row.lateFilingFlag,
    sourceUrl: row.sourceUrl,
    verificationState: row.verificationState,
  };
}

export function execute(plan: QueryPlan, data: PublishedRowsData): ExecuteResult {
  const matched = filterRows(plan, data.rows);
  const numbers = new Set<number>();
  const displayStrings = new Set<string>();

  const addNumber = (n: number) => {
    numbers.add(n);
    displayStrings.add(n.toLocaleString("en-US"));
  };
  const addMoney = (n: number) => {
    numbers.add(n);
    for (const s of moneyStrings(n)) displayStrings.add(s);
  };
  const addDate = (d: string) => {
    displayStrings.add(d);
    displayStrings.add(formatDate(d));
  };

  const result: ExecuteResult = {
    aggregate: plan.aggregate,
    matchedRows: matched.length,
    numbers: [],
    displayStrings: [],
  };
  addNumber(matched.length);

  // The query's own figures. A sentence may restate the date range or the
  // dollar floor it was given, and those came from the validated plan, not
  // from the model's arithmetic.
  if (plan.filters.dateFrom) addDate(plan.filters.dateFrom);
  if (plan.filters.dateTo) addDate(plan.filters.dateTo);
  if (plan.filters.amountAtLeast !== undefined) addMoney(plan.filters.amountAtLeast);

  const limit = Math.min(
    plan.limit ??
      (plan.aggregate === "list" ? DEFAULT_LIST_LIMIT : DEFAULT_RANK_LIMIT),
    25
  );

  switch (plan.aggregate) {
    case "count": {
      result.count = matched.length;
      break;
    }
    case "sum_estimate": {
      const totals = sumAmountEstimates(matched);
      result.totals = {
        estimate: totals.estimate,
        estimateDisplay: `$${totals.estimate.toLocaleString("en-US")}`,
        estimateCompact: formatCompactCurrency(totals.estimate),
        knownCount: totals.knownCount,
        unknownCount: totals.unknownCount,
        openEndedCount: totals.openEndedCount,
      };
      addMoney(totals.estimate);
      addNumber(totals.knownCount);
      addNumber(totals.unknownCount);
      addNumber(totals.openEndedCount);
      break;
    }
    case "list": {
      const shown = matched.slice(0, limit);
      result.rows = shown.map(toResultRow);
      result.shownRows = shown.length;
      addNumber(shown.length);
      for (const row of shown) addDate(row.date);
      break;
    }
    case "top_officials": {
      const groups = new Map<string, { name: string; slug: string; rows: PublishedRow[] }>();
      for (const row of matched) {
        const g = groups.get(row.officialSlug) ?? {
          name: row.officialName,
          slug: row.officialSlug,
          rows: [],
        };
        g.rows.push(row);
        groups.set(row.officialSlug, g);
      }
      const ranked = Array.from(groups.values())
        .map((g) => {
          const estimate = sumAmountEstimates(g.rows).estimate;
          return {
            name: g.name,
            slug: g.slug,
            count: g.rows.length,
            estimate,
            estimateDisplay: `$${estimate.toLocaleString("en-US")}`,
          };
        })
        .sort((a, b) => b.estimate - a.estimate || b.count - a.count)
        .slice(0, limit);
      result.topOfficials = ranked;
      result.shownRows = ranked.length;
      for (const r of ranked) {
        addNumber(r.count);
        addMoney(r.estimate);
      }
      break;
    }
    case "top_assets": {
      const groups = new Map<string, { ticker: string | null; label: string; rows: PublishedRow[] }>();
      for (const row of matched) {
        const key = row.ticker ?? row.description.trim().toLowerCase();
        const g = groups.get(key) ?? {
          ticker: row.ticker,
          label: row.ticker ?? row.description.trim(),
          rows: [],
        };
        g.rows.push(row);
        groups.set(key, g);
      }
      const ranked = Array.from(groups.values())
        .map((g) => {
          const estimate = sumAmountEstimates(g.rows).estimate;
          return {
            ticker: g.ticker,
            label: g.label,
            count: g.rows.length,
            estimate,
            estimateDisplay: `$${estimate.toLocaleString("en-US")}`,
          };
        })
        .sort((a, b) => b.count - a.count || b.estimate - a.estimate)
        .slice(0, limit);
      result.topAssets = ranked;
      result.shownRows = ranked.length;
      for (const r of ranked) {
        addNumber(r.count);
        addMoney(r.estimate);
      }
      break;
    }
    case "by_month": {
      const counts = new Map<string, number>();
      for (const row of matched) {
        const month = row.date.slice(0, 7);
        counts.set(month, (counts.get(month) ?? 0) + 1);
      }
      const byMonth = Array.from(counts.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month));
      result.byMonth = byMonth;
      for (const m of byMonth) {
        addNumber(m.count);
        displayStrings.add(m.month);
      }
      break;
    }
    case "first_last_dates": {
      const dates = matched.map((r) => r.date).sort();
      result.firstDate = dates[0] ?? null;
      result.lastDate = dates[dates.length - 1] ?? null;
      if (result.firstDate) addDate(result.firstDate);
      if (result.lastDate) addDate(result.lastDate);
      break;
    }
  }

  result.numbers = Array.from(numbers);
  result.displayStrings = Array.from(displayStrings);
  return result;
}
