/**
 * Re-derive the `summary` line for one or more officials.
 *
 * Two modes:
 *   1. Claude generation (default) — sends the official's computed stats to
 *      Claude with a hardened, journalism-standards prompt and writes the
 *      returned 2–4 sentence summary. This is the mode the site relies on.
 *   2. Deterministic template (`--deterministic`) — builds the count sentence
 *      from the data with zero model calls. Useful offline / as a fallback.
 *
 * Whichever mode runs, the numbers come from the data file, not the model:
 * counts, buy/sell split, estimated totals (range midpoints), date range,
 * late-filed counts/rates, largest transactions, and most-traded assets are
 * all computed here and handed to Claude as facts. Claude only writes prose
 * around those facts — it is explicitly forbidden from inventing figures or
 * drawing compliance/ethics conclusions the data cannot support.
 *
 * Usage:
 *   npx tsx scripts/refresh-summaries.ts <slug1> [slug2 ...]
 *   npx tsx scripts/refresh-summaries.ts --deterministic <slug1> [slug2 ...]
 *   npx tsx scripts/refresh-summaries.ts --dry-run <slug1> [slug2 ...]
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Range midpoints must match lib/format.ts amountRangeToMidpoint. "Over
// $50,000,000" is scored at $75M there, so we mirror that here — the summary
// total must equal what the site displays.
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
  "Over $50,000,000": 75_000_000,
};

// AP-style month names (Jan., Feb., March, April, May, June, July, Aug.,
// Sept., Oct., Nov., Dec.). Mirrors lib/format.ts formatDate.
const AP_MONTHS = [
  "Jan.", "Feb.", "March", "April", "May", "June",
  "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
];

function apDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return `${AP_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Numbers in summaries must carry thousands separators (3,000 not 3000).
function withCommas(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${withCommas(n)}`;
}

interface Stats {
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

function computeStats(d: any): Stats {
  const txs: any[] = d.transactions || [];
  const sales = txs.filter((t) => t.type?.startsWith("Sale"));
  const purchases = txs.filter((t) => t.type === "Purchase");
  const exchanges = txs.filter((t) => t.type === "Exchange");
  const late = txs.filter((t) => t.lateFilingFlag).length;
  const sum = (arr: any[]) =>
    arr.reduce((s, t) => s + (AMOUNT_MIDPOINTS[t.amount] || 0), 0);

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
    const v = AMOUNT_MIDPOINTS[t.amount] || 0;
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
function buildDeterministic(s: Stats): string {
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

// ── CLAUDE GENERATION MODE ──
//
// The system prompt is FROZEN. It encodes the site's journalism standards and
// the methodology page's explicit promise that summaries do not make
// compliance/ethics conclusions. Do not weaken these rules — they exist to
// keep every generated summary defensible from the data file alone.
const SYSTEM_PROMPT = `You write one short factual summary for an executive-branch stock-trade tracker (Open Cabinet). The reader is a journalist. You are given only pre-computed facts about one official's disclosed transactions. Write 2 to 4 sentences of neutral, factual prose.

ALLOWED CLAIMS — only statements computable from the supplied facts:
- transaction counts (total, sales, purchases, exchanges)
- buy/sell split
- estimated dollar totals (these are midpoints of federally reported ranges — always call them "estimated")
- date range of the transactions
- late-filed counts and rates
- the largest transaction(s) and most-traded assets
- plainly factual, verifiable descriptions of specific named trades that appear in the facts

BANNED — never write any of these:
- compliance or ethics-agreement conclusions of ANY kind. NEVER write "consistent with ethics agreement", "consistent with ethics agreement divestitures", "divestiture", "in compliance", "fulfilling his ethics agreement", or any claim about whether the official met, missed, or satisfied an obligation. The site cannot support these from data alone.
- any number, fact, or characterization not present in the supplied facts. Do not invent tickers, dates, dollar figures, or context.
- editorializing or loaded words: "notably", "remarkably", "significantly", "raising questions", "raising concerns", "controversial", "suspicious", "aggressive", or similar.
- financial or legal advice.

FORMAT RULES:
- Numbers 1,000 and above MUST use thousands separators (write 3,000 not 3000; 7,699 not 7699).
- Dates in AP style exactly as supplied (e.g. "March 17, 2026"). NEVER use ISO format (2026-03-17).
- Use "percent" spelled out OR "%"; be consistent within the summary. Prefer "percent".
- Describe dollar totals as CUMULATIVE across all tracked filings. NEVER say "in the latest filing" or "in the latest tracked 278-T filing" — the totals span every filing on record.

STOCK ACT FRAMING (only if you mention lateness):
- A late-filing flag means OGE was notified of the trade more than 30 days after the official was notified of it. Federal law requires filing within 30 days of that notification and no more than 45 days after the transaction (5 U.S.C. 13105(l)).
- NEVER say "30 days after the trade occurred is the legal threshold." The 30-day clock runs from notification, not from the trade date.

Return ONLY the summary text — no preamble, no quotation marks, no trailing commentary.`;

function buildFactBlock(s: Stats, d: any, extra?: string): string {
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

async function generateWithClaude(
  s: Stats,
  d: any,
  extra?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set in .env.local");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write the summary from these facts:\n\n${buildFactBlock(s, d, extra)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }
  return textBlock.text.trim();
}

async function refresh(
  slug: string,
  mode: "claude" | "deterministic",
  dryRun: boolean
) {
  const p = path.resolve(`data/officials/${slug}.json`);
  const d = JSON.parse(await readFile(p, "utf-8"));
  const s = computeStats(d);

  const newSummary =
    mode === "deterministic"
      ? buildDeterministic(s)
      : await generateWithClaude(s, d);

  const oldSummary = d.summary || "";
  console.log(`\n[${slug}]`);
  console.log(`  was: ${oldSummary}`);
  console.log(`  now: ${newSummary}`);

  if (!dryRun) {
    d.summary = newSummary;
    await writeFile(p, JSON.stringify(d, null, 2) + "\n");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--deterministic") ? "deterministic" : "claude";
  const dryRun = args.includes("--dry-run");
  const slugs = args.filter((a) => !a.startsWith("--"));
  if (slugs.length === 0) {
    console.log(
      "Usage: npx tsx scripts/refresh-summaries.ts [--deterministic] [--dry-run] <slug> [slug ...]"
    );
    process.exit(1);
  }
  for (const slug of slugs) await refresh(slug, mode as any, dryRun);
}

export { computeStats, buildDeterministic, SYSTEM_PROMPT };

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
