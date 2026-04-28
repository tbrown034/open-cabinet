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
  eifFlag: string | null;
  value: string | null;
  incomeType: string | null;
  incomeAmount: string | null;
  incomeAmountExact: string | null;
  notes: string | null;
}

export interface TickerReconciliation {
  ticker: string;
  description: string;
  saleCount: number;
  status: "sold" | "no-sale-on-file" | "exempt";
  note: string;
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

  // Map ticker -> first description encountered in entry holdings.
  // Strip value-bucket fragments and "(or less than $X)" noise that the
  // current parser leaks into the description field — these come from PDF
  // column wrapping and will be eliminated when column-aware extraction
  // replaces the regex pass.
  const cleanDesc = (s: string) =>
    s
      .replace(/\$[\d,]+\s*-\s*\$[\d,]+/g, "")
      .replace(/\bNone\s*\(or less\s*\$?[\d,]*\s*than\s*\$?\d+\)?/gi, "")
      .replace(/-\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  const heldTickerInfo = new Map<string, string>();
  for (const h of holdings) {
    if (h.ticker && !heldTickerInfo.has(h.ticker)) {
      heldTickerInfo.set(h.ticker, cleanDesc(h.description));
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
    const heldDesc = heldTickerInfo.get(ticker) ?? "";
    const saleCount = saleCounts.get(ticker) ?? 0;
    const isHeld = heldTickerInfo.has(ticker);

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
      description: heldDesc || `Sold via 278-T (${ticker})`,
      saleCount,
      status,
      note,
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
