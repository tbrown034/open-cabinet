/**
 * Holdings data loader (PILOT — Lutnick only).
 *
 * Reads parsed entry-disclosure (Nominee 278) data from data/holdings/<slug>.json.
 * Returns null if the file does not exist for an official, so the UI can render
 * conditionally without breaking.
 *
 * Data shape is the raw parser output — value buckets may be inaccurate while
 * column-aware extraction is being refined. Tickers, descriptions and item
 * numbers are reliable enough for ticker-level reconciliation.
 */
import { readFile } from "fs/promises";
import path from "path";
import type { Transaction } from "./types";

export interface HoldingRow {
  section: string;
  itemNumber: string;
  parentItemNumber: string | null;
  description: string;
  ticker: string | null;
  isEIF: boolean;
  eif: string | null;
  value: string | null;
  incomeType: string | null;
  incomeAmt: { bucket: string | null; exact: string | null } | null;
}

const VALUE_MIDPOINT: Record<string, number> = {
  "None (or less than $1,001)": 500,
  "$1,001 - $15,000": 8000,
  "$15,001 - $50,000": 32500,
  "$50,001 - $100,000": 75000,
  "$100,001 - $250,000": 175000,
  "$250,001 - $500,000": 375000,
  "$500,001 - $1,000,000": 750000,
  "$1,000,001 - $5,000,000": 3000000,
  "$5,000,001 - $25,000,000": 15000000,
  "$25,000,001 - $50,000,000": 37500000,
  "Over $50,000,000": 75000000,
};

export function holdingValueMidpoint(value: string | null): number {
  if (!value) return 0;
  return VALUE_MIDPOINT[value] ?? 0;
}

export interface TickerReconciliation {
  ticker: string;
  description: string;
  saleCount: number;
  status: "sold" | "no-sale-on-file" | "exempt";
  note: string;
  entryValueMidpoint: number; // sum of value-bucket midpoints across all holdings of this ticker
}

const HOLDINGS_DIR = path.join(process.cwd(), "data", "holdings");

export async function getHoldingsForOfficial(
  slug: string
): Promise<HoldingRow[] | null> {
  try {
    const raw = await readFile(path.join(HOLDINGS_DIR, `${slug}.json`), "utf-8");
    return JSON.parse(raw) as HoldingRow[];
  } catch {
    return null;
  }
}

// Tickers that are statutorily exempt from 278-T reporting (mutual funds, money-market
// funds, diversified ETFs). A position in one of these "held but no 278-T sale on file"
// is expected, not a compliance flag.
const EXEMPT_FUND_TICKERS = new Set(["FDRXX"]);

/**
 * Compare entry holdings against 278-T transactions to produce a per-ticker
 * reconciliation. Returns one row per unique ticker that appears in either set.
 */
export function reconcileHoldingsAgainstTrades(
  holdings: HoldingRow[],
  transactions: Transaction[]
): TickerReconciliation[] {
  const sales = transactions.filter((t) => t.type.startsWith("Sale"));

  // Map ticker -> first description + sum of value-bucket midpoints across
  // every holding row that mentions this ticker (e.g. BGC appears in many
  // trust entities — we sum them).
  const heldTickerInfo = new Map<
    string,
    { description: string; entryValueMidpoint: number }
  >();
  for (const h of holdings) {
    if (!h.ticker) continue;
    const existing = heldTickerInfo.get(h.ticker);
    const valueAdd = holdingValueMidpoint(h.value);
    if (existing) {
      existing.entryValueMidpoint += valueAdd;
    } else {
      heldTickerInfo.set(h.ticker, {
        description: h.description,
        entryValueMidpoint: valueAdd,
      });
    }
  }

  // Map ticker -> count of sale transactions
  const saleCounts = new Map<string, number>();
  for (const t of sales) {
    if (t.ticker) saleCounts.set(t.ticker, (saleCounts.get(t.ticker) ?? 0) + 1);
  }

  const allTickers = new Set([
    ...heldTickerInfo.keys(),
    ...saleCounts.keys(),
  ]);

  const out: TickerReconciliation[] = [];
  for (const ticker of allTickers) {
    const held = heldTickerInfo.get(ticker);
    const saleCount = saleCounts.get(ticker) ?? 0;
    const isHeld = held !== undefined;

    let status: TickerReconciliation["status"];
    let note = "";

    if (EXEMPT_FUND_TICKERS.has(ticker)) {
      status = "exempt";
      note = "Mutual fund — exempt from 278-T reporting (5 CFR §2640.201)";
    } else if (saleCount > 0 && isHeld) {
      status = "sold";
      note = `${saleCount} sale${saleCount === 1 ? "" : "s"} on file`;
    } else if (saleCount > 0 && !isHeld) {
      status = "sold";
      note = "Sold via 278-T — not in parsed entry holdings (parser miss or post-entry acquisition)";
    } else {
      status = "no-sale-on-file";
      note =
        "No 278-T sale on file. May be still held, sold via Form 201 Certificate of Divestiture, or not yet reported.";
    }

    out.push({
      ticker,
      description: held?.description || `Sold via 278-T (${ticker})`,
      saleCount,
      status,
      note,
      entryValueMidpoint: held?.entryValueMidpoint ?? 0,
    });
  }

  // Order: sold first (alphabetical), then no-sale-on-file, then exempt
  const order: Record<TickerReconciliation["status"], number> = {
    sold: 0,
    "no-sale-on-file": 1,
    exempt: 2,
  };
  out.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.ticker.localeCompare(b.ticker);
  });

  return out;
}
