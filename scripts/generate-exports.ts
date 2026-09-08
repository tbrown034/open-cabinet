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
} from "../lib/amounts";
import type { Transaction } from "../lib/types";
import { rowsForTotals, transactionScopeLabel } from "../lib/format";
import { verificationForOfficial, recordIdsFor } from "../lib/row-verification";
import { readAssetResolution, publicTicker } from "../lib/asset-resolution";

interface OfficialData {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: string;
  confirmedDate?: string | null;
  mostRecentFilingDate: string;
  departedDate?: string | null;
  formerOfficial?: boolean;
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

  // The asset resolution sidecar (data/meta/asset-resolution.json): the
  // instrument type on every row, and a resolved ticker only at the top
  // tier. Absent rows export blank, never a guess.
  const assets = readAssetResolution();
  const exportOfficials = allOfficials.map((official) => {
    const ids = recordIdsFor(official.transactions);
    const verification = verificationForOfficial(official.slug, official.transactions);
    const underReviewCount = verification.filter((row, i) => row?.score === 0 && !official.transactions[i].historical).length;
    return {
      ...official,
      transactionCount: rowsForTotals(official.transactions, verification).length,
      historicalCount: official.transactions.filter((tx) => tx.historical).length,
      underReviewCount,
      transactions: official.transactions.map((tx, i) => {
        const row = verification[i];
        const asset = assets?.rows[ids[i]];
        return {
          ...tx,
          recordId: ids[i],
          verificationScore: row?.score ?? null,
          verificationState: row?.state ?? null,
          instrumentType: asset?.instrumentType ?? null,
          issuerLabel: asset?.issuerLabel ?? null,
          resolvedTicker: publicTicker(asset, row?.gates?.name),
          // The tier says what the lane found; when the name gate withholds
          // the ticker the tier says so, so a T1 row never has an empty symbol.
          resolutionTier: asset ? (asset.tier === "T1" && !publicTicker(asset, row?.gates?.name) ? "T1 name unconfirmed" : asset.tier) : null,
        };
      }),
    };
  });

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
    "recordId",
    "verificationScore",
    "verificationState",
    "type_note",
    "date_note",
    "row_note",
    // Asset resolution lane (Sep 2026): the instrument type from the
    // printed text; a resolved ticker only at the top tier (T1), where two
    // reference lists or a person agreed; the tier itself.
    "instrument_type",
    "issuer_label",
    "resolved_ticker",
    "resolution_tier",
    "historical_report",
    "date_scope",
    "former_official",
  ];
  const txRows = exportOfficials.flatMap((o) =>
    o.transactions.map((tx) =>
      [
        escapeCsv(o.name),
        escapeCsv(o.title),
        escapeCsv(o.agency),
        o.departedDate || "",
        escapeCsv(tx.description),
        tx.ticker || "",
        tx.type,
        tx.date ?? "",
        escapeCsv(tx.amount ?? ""),
        // The site's labeled estimate (midpoint, or 1.5x the floor for an
        // open-ended range). Blank, not zero, when the filing gave no value.
        tx.amount === null ? "" : String(transactionEstimate(tx)),
        tx.lateFilingFlag ? "yes" : "no",
        tx.sourceUrl || "",
        escapeCsv(tx.amountNote ?? ""),
        tx.recordId,
        tx.verificationScore === null ? "" : String(tx.verificationScore),
        tx.verificationState ?? "",
        escapeCsv(tx.typeNote ?? ""),
        escapeCsv(tx.dateNote ?? ""),
        escapeCsv(tx.notes ?? ""),
        tx.instrumentType ?? "",
        escapeCsv(tx.issuerLabel ?? ""),
        tx.resolvedTicker ?? "",
        tx.resolutionTier ?? "",
        tx.historical ? "yes" : "no",
        escapeCsv(transactionScopeLabel(tx) ?? ""),
        o.formerOfficial ? "yes" : "no",
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
    "under_review_count",
    "historical_count",
  ];
  const sumRows = exportOfficials.map((o) => {
    const counted = o.transactions.filter((tx) => !tx.historical && tx.verificationScore !== 0);
    const sales = counted.filter((t) =>
      ["Sale", "Sale (Partial)", "Sale (Full)"].includes(t.type)
    ).length;
    const purchases = counted.filter(
      (t) => t.type === "Purchase"
    ).length;
    const late = counted.filter((t) => t.lateFilingFlag).length;
    const totalValue = sumAmountEstimates(counted).estimate;
    return [
      escapeCsv(o.name),
      o.slug,
      escapeCsv(o.title),
      escapeCsv(o.agency),
        o.level,
        o.confirmedDate || "",
        o.departedDate || "",
      String(o.transactionCount),
      String(sales),
      String(purchases),
      String(late),
      String(totalValue),
      o.mostRecentFilingDate,
      String(o.underReviewCount),
      String(o.historicalCount),
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
    transactionCount: exportOfficials.reduce(
      (sum, o) => sum + o.transactionCount,
      0
    ),
    underReviewCount: exportOfficials.reduce((sum, o) => sum + o.underReviewCount, 0),
    historicalCount: exportOfficials.reduce((sum, o) => sum + o.historicalCount, 0),
    officials: exportOfficials.map((o) => ({
      name: o.name,
      slug: o.slug,
      title: o.title,
      agency: o.agency,
      level: o.level,
      confirmedDate: o.confirmedDate ?? null,
      departedDate: o.departedDate ?? null,
      formerOfficial: o.formerOfficial ?? false,
      transactionCount: o.transactionCount,
      underReviewCount: o.underReviewCount,
      historicalCount: o.historicalCount,
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
