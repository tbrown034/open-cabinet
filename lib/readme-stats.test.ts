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
import { resolveSymbol } from "@/lib/asset-registry";
import type { AmountRange } from "@/lib/types";
import { readRowVerification } from "@/lib/row-verification";

interface DatasetTransaction {
  description: string;
  ticker: string | null;
  amount: AmountRange | null;
  lateFilingFlag: boolean;
  verificationScore: number | null;
}

interface DatasetOfficial {
  transactionCount: number;
  underReviewCount: number;
  transactions: DatasetTransaction[];
}

interface Dataset {
  officialCount: number;
  underReviewCount: number;
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
  const countedTx = allTx.filter((tx) => tx.verificationScore !== 0);

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

  it("verification states match the recorded row summary", () => {
    const file = readRowVerification();
    expect(file, "The row verification file is required to check README counts").not.toBeNull();
    if (!file) return;
    expect(file.summary.rows).toBe(allTx.length);
    const counts = Object.entries(file.summary.byState)
      .map(([state, count]) => `${formatCount(count)} ${state}`)
      .join("; ");
    expect(readme).toContain(`Rows by verification state: ${counts}.`);
  });

  it("excludes under-review rows from transaction totals and reports them separately", () => {
    const underReview = allTx.length - countedTx.length;
    expect(dataset.transactionCount).toBe(countedTx.length);
    expect(dataset.underReviewCount).toBe(underReview);
    expect(readmeStat("Rows under review \\(not counted in totals\\)")).toBe(formatCount(underReview));
    for (const official of dataset.officials) {
      const counted = official.transactions.filter((tx) => tx.verificationScore !== 0).length;
      expect(official.transactionCount).toBe(counted);
      expect(official.underReviewCount).toBe(official.transactions.length - counted);
    }
  });

  it("late filings", () => {
    const late = countedTx.filter((t) => t.lateFilingFlag).length;
    expect(readmeStat("Late filings")).toBe(formatCount(late));
  });

  it("companies searchable", () => {
    // Same definition the site uses: a stored symbol counts only if the
    // resolver accepts it (lib/assets.ts), after the registry folds filed
    // variants (APPL, BRKB). A withheld suffix like "THE" is not a company.
    const tickers = new Set<string>();
    for (const t of allTx) {
      const r = resolveTicker(t.description, t.ticker);
      if (r.ticker) tickers.add(resolveSymbol(r.ticker));
    }
    expect(readmeStat("Companies searchable")).toBe(formatCount(tickers.size));
  });

  it("estimated value", () => {
    const total = sumAmountEstimates(countedTx).estimate;
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
