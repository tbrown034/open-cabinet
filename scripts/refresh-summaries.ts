/**
 * Re-derive the `summary` line for the officials we just ingested
 * new filings for. Keeps existing prose where the official has hand-
 * tuned phrasing — only regenerates the count sentence at the start.
 *
 * Usage: npx tsx scripts/refresh-summaries.ts <slug1> [slug2 ...]
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";

const AMOUNT_MIDPOINTS: Record<string, number> = {
  "$1,001-$15,000": 8_000,
  "$15,001-$50,000": 32_500,
  "$50,001-$100,000": 75_000,
  "$100,001-$250,000": 175_000,
  "$250,001-$500,000": 375_000,
  "$500,001-$1,000,000": 750_000,
  "$1,000,001-$5,000,000": 3_000_000,
  "$5,000,001-$25,000,000": 15_000_000,
  "$25,000,001-$50,000,000": 37_500_000,
  "Over $50,000,000": 50_000_000,
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

async function refresh(slug: string) {
  const p = path.resolve(`data/officials/${slug}.json`);
  const d = JSON.parse(await readFile(p, "utf-8"));
  const txs: any[] = d.transactions || [];

  const sales = txs.filter((t) => t.type?.startsWith("Sale"));
  const purchases = txs.filter((t) => t.type === "Purchase");
  const exchanges = txs.filter((t) => t.type === "Exchange");
  const late = txs.filter((t) => t.lateFilingFlag).length;

  const sumValue = (arr: any[]) =>
    arr.reduce((s, t) => s + (AMOUNT_MIDPOINTS[t.amount] || 0), 0);

  const parts: string[] = [];
  const last = d.name.split(",")[0].trim();
  const segments: string[] = [];
  if (sales.length) segments.push(`${sales.length} sale${sales.length === 1 ? "" : "s"} (est. ${fmtMoney(sumValue(sales))})`);
  if (purchases.length) segments.push(`${purchases.length} purchase${purchases.length === 1 ? "" : "s"} (est. ${fmtMoney(sumValue(purchases))})`);
  if (exchanges.length) segments.push(`${exchanges.length} exchange${exchanges.length === 1 ? "" : "s"}`);
  parts.push(`${last} reported ${segments.join(" and ")}.`);
  if (late > 0) {
    parts.push(`${late} of ${txs.length} transactions were filed late.`);
  }

  const newSummary = parts.join(" ");
  const oldSummary = d.summary || "";
  d.summary = newSummary;
  await writeFile(p, JSON.stringify(d, null, 2) + "\n");
  console.log(`[${slug}]`);
  console.log(`  was: ${oldSummary.slice(0, 100)}`);
  console.log(`  now: ${newSummary}`);
}

async function main() {
  const slugs = process.argv.slice(2);
  if (slugs.length === 0) {
    console.log("Usage: npx tsx scripts/refresh-summaries.ts <slug> [slug ...]");
    process.exit(1);
  }
  for (const s of slugs) await refresh(s);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
