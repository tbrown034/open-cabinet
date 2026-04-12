/**
 * Generate Export Files
 *
 * Creates downloadable CSV and JSON exports from the transaction data.
 * Run: pnpm run generate-exports
 */

import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import path from "path";

interface Transaction {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  lateFilingFlag: boolean;
}

interface OfficialData {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: string;
  mostRecentFilingDate: string;
  transactions: Transaction[];
}

const MIDPOINTS: Record<string, number> = {
  "$1,001-$15,000": 8000,
  "$15,001-$50,000": 32500,
  "$50,001-$100,000": 75000,
  "$100,001-$250,000": 175000,
  "$250,001-$500,000": 375000,
  "$500,001-$1,000,000": 750000,
  "$1,000,001-$5,000,000": 3000000,
  "$5,000,001-$25,000,000": 15000000,
  "$25,000,001-$50,000,000": 37500000,
  "Over $50,000,000": 75000000,
};

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
    "description",
    "ticker",
    "type",
    "date",
    "amount_range",
    "amount_midpoint",
    "late_filing",
  ];
  const txRows = allOfficials.flatMap((o) =>
    o.transactions.map((tx) =>
      [
        escapeCsv(o.name),
        escapeCsv(o.title),
        escapeCsv(o.agency),
        escapeCsv(tx.description),
        tx.ticker || "",
        tx.type,
        tx.date,
        tx.amount,
        String(MIDPOINTS[tx.amount] || 0),
        tx.lateFilingFlag ? "yes" : "no",
      ].join(",")
    )
  );
  const txCsv = [txHeaders.join(","), ...txRows].join("\n");
  await writeFile(path.join(outDir, "all-transactions.csv"), txCsv);
  console.log(`  all-transactions.csv: ${txRows.length} rows`);

  // 2. Officials Summary CSV
  const sumHeaders = [
    "name",
    "slug",
    "title",
    "agency",
    "level",
    "transaction_count",
    "sales_count",
    "purchases_count",
    "late_filing_count",
    "estimated_total_value",
    "most_recent_filing",
  ];
  const sumRows = allOfficials.map((o) => {
    const sales = o.transactions.filter((t) =>
      ["Sale", "Sale (Partial)", "Sale (Full)"].includes(t.type)
    ).length;
    const purchases = o.transactions.filter(
      (t) => t.type === "Purchase"
    ).length;
    const late = o.transactions.filter((t) => t.lateFilingFlag).length;
    const totalValue = o.transactions.reduce(
      (sum, t) => sum + (MIDPOINTS[t.amount] || 0),
      0
    );
    return [
      escapeCsv(o.name),
      o.slug,
      escapeCsv(o.title),
      escapeCsv(o.agency),
      o.level,
      String(o.transactions.length),
      String(sales),
      String(purchases),
      String(late),
      String(totalValue),
      o.mostRecentFilingDate,
    ].join(",");
  });
  const sumCsv = [sumHeaders.join(","), ...sumRows].join("\n");
  await writeFile(path.join(outDir, "officials-summary.csv"), sumCsv);
  console.log(`  officials-summary.csv: ${sumRows.length} rows`);

  // 3. Full Dataset JSON
  const fullJson = {
    exportedAt: new Date().toISOString(),
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
      transactionCount: o.transactions.length,
      mostRecentFilingDate: o.mostRecentFilingDate,
      transactions: o.transactions,
    })),
  };
  await writeFile(
    path.join(outDir, "full-dataset.json"),
    JSON.stringify(fullJson, null, 2)
  );
  console.log(`  full-dataset.json: ${fullJson.transactionCount} transactions`);

  console.log("\nExports generated in public/data/");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
