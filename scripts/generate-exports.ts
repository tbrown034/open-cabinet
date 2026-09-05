/**
 * Generate Export Files
 *
 * Creates downloadable CSV and JSON exports from the transaction data.
 * Run: pnpm run generate-exports
 */

import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import path from "path";
import {
  transactionEstimate,
  sumAmountEstimates,
  type AmountRange,
} from "../lib/amounts";

interface Transaction {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: AmountRange | null;
  amountNote?: string;
  lateFilingFlag: boolean;
}

interface OfficialData {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: string;
  confirmedDate?: string | null;
  mostRecentFilingDate: string;
  departedDate?: string | null;
  transactions: Transaction[];
}

// Amount policy lives in lib/amounts.ts; an unknown range throws so a
// stale local copy can never put $0 into a public download again.


function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

async function main() {
  const outDir = path.join(process.cwd(), "public", "data");
  await mkdir(outDir, { recursive: true });

  const officialsDir = path.join(process.cwd(), "data", "officials");
  const files = await readdir(officialsDir);
  const allOfficials: OfficialData[] = [];

  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    const raw = await readFile(path.join(officialsDir, file), "utf-8");
    allOfficials.push(JSON.parse(raw));
  }

  // 1. All Transactions CSV
  const txHeaders = [
    "official_name",
    "official_title",
    "agency",
    "departed_date",
    "description",
    "ticker",
    "type",
    "date",
    "amount_range",
    "amount_midpoint",
    "late_filing",
    "source_filing_url",
    // Trailing so existing positional parsers of this file are unaffected.
    "amount_note",
  ];
  const txRows = allOfficials.flatMap((o) =>
    o.transactions.map((tx) =>
      [
        escapeCsv(o.name),
        escapeCsv(o.title),
        escapeCsv(o.agency),
        o.departedDate || "",
        escapeCsv(tx.description),
        tx.ticker || "",
        tx.type,
        tx.date,
        escapeCsv(tx.amount ?? ""),
        // The site's labeled estimate (midpoint, or 1.5x the floor for an
        // open-ended range). Blank, not zero, when the filing gave no value.
        tx.amount === null ? "" : String(transactionEstimate(tx)),
        tx.lateFilingFlag ? "yes" : "no",
        (tx as { sourceUrl?: string }).sourceUrl || "",
        escapeCsv(tx.amountNote ?? ""),
      ].join(",")
    )
  );
  const txCsv = [txHeaders.join(","), ...txRows].join("\n") + "\n";
  await writeFile(path.join(outDir, "all-transactions.csv"), txCsv);
  console.log(`  all-transactions.csv: ${txRows.length} rows`);

  // 2. Officials Summary CSV
  const sumHeaders = [
    "name",
    "slug",
    "title",
    "agency",
    "level",
    "confirmed_date",
    "departed_date",
    "transaction_count",
    "sales_count",
    "purchases_count",
    "late_filing_count",
    "estimated_total_value",
    "most_recent_oge_filing_date",
  ];
  const sumRows = allOfficials.map((o) => {
    const sales = o.transactions.filter((t) =>
      ["Sale", "Sale (Partial)", "Sale (Full)"].includes(t.type)
    ).length;
    const purchases = o.transactions.filter(
      (t) => t.type === "Purchase"
    ).length;
    const late = o.transactions.filter((t) => t.lateFilingFlag).length;
    const totalValue = sumAmountEstimates(o.transactions).estimate;
    return [
      escapeCsv(o.name),
      o.slug,
      escapeCsv(o.title),
      escapeCsv(o.agency),
        o.level,
        o.confirmedDate || "",
        o.departedDate || "",
      String(o.transactions.length),
      String(sales),
      String(purchases),
      String(late),
      String(totalValue),
      o.mostRecentFilingDate,
    ].join(",");
  });
  const sumCsv = [sumHeaders.join(","), ...sumRows].join("\n") + "\n";
  await writeFile(path.join(outDir, "officials-summary.csv"), sumCsv);
  console.log(`  officials-summary.csv: ${sumRows.length} rows`);

  // 3. Full Dataset JSON
  // Reuse the previous exportedAt when the data itself is unchanged, so a
  // no-new-filings pipeline run produces no diff (and no pull request).
  const fullPath = path.join(outDir, "full-dataset.json");
  const exportedAt = new Date().toISOString();
  let previousDataset: Record<string, unknown> | null = null;
  try {
    previousDataset = JSON.parse(await readFile(fullPath, "utf-8"));
  } catch {
    // No previous export — stamp fresh.
  }

  const fullJson = {
    exportedAt,
    officialCount: allOfficials.length,
    transactionCount: allOfficials.reduce(
      (sum, o) => sum + o.transactions.length,
      0
    ),
    officials: allOfficials.map((o) => ({
      name: o.name,
      slug: o.slug,
      title: o.title,
      agency: o.agency,
      level: o.level,
      confirmedDate: o.confirmedDate ?? null,
      departedDate: o.departedDate ?? null,
      transactionCount: o.transactions.length,
      mostRecentFilingDate: o.mostRecentFilingDate,
      transactions: o.transactions,
    })),
  };
  if (previousDataset) {
    const { exportedAt: prevStamp, ...prevRest } = previousDataset;
    const { exportedAt: _stamp, ...nextRest } = fullJson;
    if (
      typeof prevStamp === "string" &&
      JSON.stringify(prevRest) === JSON.stringify(nextRest)
    ) {
      fullJson.exportedAt = prevStamp;
    }
  }
  await writeFile(fullPath, JSON.stringify(fullJson, null, 2));
  console.log(`  full-dataset.json: ${fullJson.transactionCount} transactions`);

  console.log("\nExports generated in public/data/");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
