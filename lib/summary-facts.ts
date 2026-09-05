/**
 * The facts a summary may state, computed in code from an official's rows.
 *
 * The model that writes an official's summary never sees the transactions.
 * It sees this fact block and nothing else, so every number it could use
 * is one the code computed. The block's hash is stored beside a published
 * summary; when the facts change, the summary is known to be stale rather
 * than silently wrong. Pure: no I/O, no model.
 */
import { sumAmountEstimates, transactionEstimate, type AmountRange } from "./amounts";

/** The subset of an official file the summary facts are computed from. */
export interface SummaryInput {
  name: string;
  title?: string;
  agency?: string;
  transactions?: Array<{
    description: string;
    ticker?: string | null;
    type: string;
    date: string;
    amount: AmountRange | null;
    lateFilingFlag?: boolean;
  }>;
}
import { createHash } from "crypto";

// AP-style month names (Jan., Feb., March, April, May, June, July, Aug.,
// Sept., Oct., Nov., Dec.). Mirrors lib/format.ts formatDate.
const AP_MONTHS = [
  "Jan.", "Feb.", "March", "April", "May", "June",
  "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
];

export function apDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return `${AP_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Numbers in summaries must carry thousands separators (3,000 not 3000).
export function withCommas(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${withCommas(n)}`;
}

export interface Stats {
  last: string;
  total: number;
  sales: number;
  purchases: number;
  exchanges: number;
  late: number;
  latePct: number;
  estTotal: string;
  estSales: string;
  estPurchases: string;
  firstDate: string | null;
  lastDate: string | null;
  topAssets: { label: string; count: number }[];
  largest: string;
}

export function computeStats(d: SummaryInput): Stats {
  const txs = d.transactions || [];
  const sales = txs.filter((t) => t.type?.startsWith("Sale"));
  const purchases = txs.filter((t) => t.type === "Purchase");
  const exchanges = txs.filter((t) => t.type === "Exchange");
  const late = txs.filter((t) => t.lateFilingFlag).length;
  const sum = (arr: typeof txs) => sumAmountEstimates(arr).estimate;

  const dates = txs.map((t) => t.date).filter(Boolean).sort();
  const byAsset: Record<string, number> = {};
  for (const t of txs) {
    const key = t.ticker || t.description;
    byAsset[key] = (byAsset[key] || 0) + 1;
  }
  const topAssets = Object.entries(byAsset)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  // Largest single transaction by range midpoint.
  let largest = "n/a";
  let largestVal = -1;
  for (const t of txs) {
    const v = transactionEstimate(t) ?? -1;
    if (v > largestVal) {
      largestVal = v;
      largest = `${t.description} (${t.amount})`;
    }
  }

  return {
    last: d.name.split(",")[0].trim(),
    total: txs.length,
    sales: sales.length,
    purchases: purchases.length,
    exchanges: exchanges.length,
    late,
    latePct: txs.length ? Math.round((late / txs.length) * 100) : 0,
    estTotal: fmtMoney(sum(txs)),
    estSales: fmtMoney(sum(sales)),
    estPurchases: fmtMoney(sum(purchases)),
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
    topAssets,
    largest,
  };
}

// ── DETERMINISTIC MODE ──
export function buildDeterministic(s: Stats): string {
  const parts: string[] = [];
  const segments: string[] = [];
  if (s.sales)
    segments.push(
      `${withCommas(s.sales)} sale${s.sales === 1 ? "" : "s"} (est. ${s.estSales})`
    );
  if (s.purchases)
    segments.push(
      `${withCommas(s.purchases)} purchase${s.purchases === 1 ? "" : "s"} (est. ${s.estPurchases})`
    );
  if (s.exchanges)
    segments.push(`${withCommas(s.exchanges)} exchange${s.exchanges === 1 ? "" : "s"}`);
  parts.push(`${s.last} reported ${segments.join(" and ")}.`);
  if (s.late > 0) {
    parts.push(
      `${withCommas(s.late)} of ${withCommas(s.total)} transactions were filed late.`
    );
  }
  return parts.join(" ");
}

export function buildFactBlock(s: Stats, d: SummaryInput, extra?: string): string {
  const lines: string[] = [];
  lines.push(`Official: ${d.name} — ${d.title}, ${d.agency}`);
  lines.push(`Last name to use in prose: ${s.last}`);
  lines.push(`Total transactions: ${withCommas(s.total)}`);
  lines.push(`Sales (all Sale types): ${withCommas(s.sales)} (estimated ${s.estSales})`);
  lines.push(`Purchases: ${withCommas(s.purchases)} (estimated ${s.estPurchases})`);
  if (s.exchanges) lines.push(`Exchanges: ${withCommas(s.exchanges)}`);
  lines.push(`Estimated total value (all transactions, cumulative): ${s.estTotal}`);
  lines.push(
    `Late-filed transactions: ${withCommas(s.late)} of ${withCommas(s.total)} (${s.latePct} percent)`
  );
  if (s.firstDate && s.lastDate) {
    lines.push(
      `Transaction date range: ${apDate(s.firstDate)} to ${apDate(s.lastDate)}`
    );
  }
  lines.push(`Largest single transaction (by range midpoint): ${s.largest}`);
  lines.push(
    `Most-traded assets: ${s.topAssets.map((a) => `${a.label} (${a.count})`).join(", ")}`
  );
  if (extra) lines.push(`Additional verified context you MAY use: ${extra}`);
  return lines.join("\n");
}


/** SHA-256 of the fact block. Stored with a published summary. */
export function factHash(factBlock: string): string {
  return createHash("sha256").update(factBlock).digest("hex");
}

/**
 * Every number in a summary must appear in the fact block it was written
 * from. This is a rejection lint, not a proof: it cannot tell that a right
 * number was attached to the wrong subject. It does catch the common
 * failure, a figure the model introduced on its own.
 */
export function unwitnessedNumbers(summary: string, factBlock: string): string[] {
  const norm = (s: string) => s.replace(/,/g, "");
  const facts = norm(factBlock);
  const tokens = summary.match(/\$?\d[\d,]*(?:\.\d+)?[KMB]?%?/g) ?? [];
  const missing: string[] = [];
  for (const raw of tokens) {
    const t = norm(raw).replace(/%$/, "");
    if (!facts.includes(t)) missing.push(raw);
  }
  return missing;
}
