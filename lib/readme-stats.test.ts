/**
 * Guards the README "Current data" table against drift.
 *
 * Every number in that table must match what the published dataset
 * (public/data/full-dataset.json) actually contains. When the pipeline
 * ingests new filings, this test fails until the README is updated —
 * so the repo can never advertise stale counts.
 */
import { readFileSync } from "fs";
import { readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { sumAmountEstimates, formatCompactCurrency } from "@/lib/format";
import { resolveTicker } from "@/lib/assets";
import { TICKER_ALIASES } from "@/lib/data";
import type { AmountRange } from "@/lib/types";

interface DatasetTransaction {
  description: string;
  ticker: string | null;
  amount: AmountRange | null;
  lateFilingFlag: boolean;
}

interface DatasetOfficial {
  transactions: DatasetTransaction[];
}

interface Dataset {
  officialCount: number;
  transactionCount: number;
  officials: DatasetOfficial[];
}

const root = process.cwd();
const readme = readFileSync(path.join(root, "README.md"), "utf-8");
const dataset: Dataset = JSON.parse(
  readFileSync(path.join(root, "public", "data", "full-dataset.json"), "utf-8")
);

/** Pulls the value cell for a row of the "Current data" table. */
function readmeStat(label: string): string {
  const match = readme.match(
    new RegExp(`\\|\\s*${label}\\s*\\|\\s*([^|]+?)\\s*\\|`)
  );
  if (!match) throw new Error(`README table row not found: ${label}`);
  return match[1];
}

const formatCount = (n: number) => n.toLocaleString("en-US");

describe("README current-data table matches the published dataset", () => {
  const allTx = dataset.officials.flatMap((o) => o.transactions);

  it("officials tracked", () => {
    expect(readmeStat("Officials tracked")).toBe(
      formatCount(dataset.officialCount)
    );
  });

  it("transactions", () => {
    expect(readmeStat("Transactions")).toBe(
      formatCount(dataset.transactionCount)
    );
  });

  it("late filings", () => {
    const late = allTx.filter((t) => t.lateFilingFlag).length;
    expect(readmeStat("Late filings")).toBe(formatCount(late));
  });

  it("companies searchable", () => {
    // Same definition the site uses: a stored symbol counts only if the
    // resolver accepts it (lib/assets.ts), after aliasing. A withheld
    // suffix like "THE" is not a company.
    const tickers = new Set<string>();
    for (const t of allTx) {
      const r = resolveTicker(t.description, t.ticker);
      if (r.ticker) tickers.add(TICKER_ALIASES[r.ticker] ?? r.ticker);
    }
    expect(readmeStat("Companies searchable")).toBe(formatCount(tickers.size));
  });

  it("estimated value", () => {
    const total = sumAmountEstimates(allTx).estimate;
    expect(readmeStat("Estimated value")).toBe(
      `~${formatCompactCurrency(total)}`
    );
  });

  it("news articles linked", () => {
    const news = JSON.parse(
      readFileSync(path.join(root, "data", "news-coverage.json"), "utf-8")
    );
    expect(readmeStat("News articles linked")).toBe(formatCount(news.length));
  });

  it("source filing PDFs linked", () => {
    const dir = path.join(root, "data", "source-docs");
    const docs = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .reduce((sum, f) => {
        const parsed = JSON.parse(readFileSync(path.join(dir, f), "utf-8"));
        return sum + parsed.documents.length;
      }, 0);
    expect(readmeStat("Source filing PDFs linked")).toBe(formatCount(docs));
  });
});
