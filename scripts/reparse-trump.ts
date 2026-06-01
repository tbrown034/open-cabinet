/**
 * Re-parse ALL 12 of Trump's 278-T PDFs to get complete transaction data.
 *
 * 1. Downloads each PDF from the OGE source URLs
 * 2. Parses each with Claude Sonnet via parse-pdf.ts
 * 3. Combines and deduplicates transactions
 * 4. Writes back to trump-donald-j.json preserving all metadata
 *
 * Rate limited: 3 second delay between API calls.
 * Continues on failure — logs which PDFs failed.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import https from "https";
import http from "http";
import path from "path";
import { parsePdf, type ParsedTransaction, type ParseResult } from "./parse-pdf.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const TRUMP_JSON_PATH = path.resolve("data/officials/trump-donald-j.json");
const PDF_DIR = "/tmp/cabinet-pdfs";

// Sleep helper for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Download a file from a URL, following redirects
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = require("fs").createWriteStream(dest);

    const request = protocol.get(url, { headers: { "User-Agent": "OpenCabinet/1.0" } }, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (err) => {
      file.close();
      reject(err);
    });

    // 30 second timeout
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error(`Timeout downloading ${url}`));
    });
  });
}

// Generate a filename from a source filing entry
function filingToFilename(filing: { date: string; label: string }, index: number): string {
  const sanitizedLabel = filing.label.replace(/[^a-zA-Z0-9()-]/g, "_");
  return `trump-${filing.date}-${sanitizedLabel}-${index}.pdf`;
}

interface SourceFiling {
  date: string;
  url: string;
  label: string;
}

async function main() {
  console.log("\n=== Re-parsing Trump 278-T PDFs ===\n");

  // 1. Read the current Trump JSON
  const trumpData = JSON.parse(await readFile(TRUMP_JSON_PATH, "utf-8"));
  const sourceFilings: SourceFiling[] = trumpData.sourceFilings;

  console.log(`Found ${sourceFilings.length} source filings`);
  console.log(`Current transactions: ${trumpData.transactions.length}`);

  // Ensure PDF directory exists
  await mkdir(PDF_DIR, { recursive: true });

  // 2. Download all PDFs
  console.log("\n--- Downloading PDFs ---\n");
  const pdfPaths: { filing: SourceFiling; path: string; index: number }[] = [];

  for (let i = 0; i < sourceFilings.length; i++) {
    const filing = sourceFilings[i];
    const filename = filingToFilename(filing, i);
    const pdfPath = path.join(PDF_DIR, filename);

    if (existsSync(pdfPath)) {
      const stats = require("fs").statSync(pdfPath);
      if (stats.size > 1000) {
        console.log(`  [${i + 1}/12] Already downloaded: ${filename} (${(stats.size / 1024).toFixed(0)} KB)`);
        pdfPaths.push({ filing, path: pdfPath, index: i });
        continue;
      }
    }

    console.log(`  [${i + 1}/12] Downloading: ${filing.label} (${filing.date})...`);
    try {
      await downloadFile(filing.url, pdfPath);
      const stats = require("fs").statSync(pdfPath);
      console.log(`           OK: ${filename} (${(stats.size / 1024).toFixed(0)} KB)`);
      pdfPaths.push({ filing, path: pdfPath, index: i });
    } catch (err: any) {
      console.error(`           FAILED: ${err.message}`);
    }

    // Small delay between downloads to be polite
    await sleep(500);
  }

  console.log(`\nDownloaded ${pdfPaths.length}/${sourceFilings.length} PDFs`);

  // 3. Parse each PDF with Claude Sonnet
  console.log("\n--- Parsing PDFs with Claude Sonnet ---\n");

  const allResults: { filing: SourceFiling; result: ParseResult | null; error?: string }[] = [];
  let totalCost = 0;
  let totalTransactions = 0;
  const failedPdfs: string[] = [];

  for (let i = 0; i < pdfPaths.length; i++) {
    const { filing, path: pdfPath } = pdfPaths[i];
    console.log(`\n  [${i + 1}/${pdfPaths.length}] Parsing: ${filing.label} (${filing.date})`);

    // Check if we already have a parsed JSON from a previous run
    const parsedJsonPath = pdfPath.replace(/\.pdf$/i, ".parsed.json");
    if (existsSync(parsedJsonPath)) {
      try {
        const existing = JSON.parse(await readFile(parsedJsonPath, "utf-8")) as ParseResult;
        if (existing.transactions && existing.transactions.length > 0) {
          console.log(`           Using cached parse: ${existing.transactions.length} transactions`);
          allResults.push({ filing, result: existing });
          totalTransactions += existing.transactions.length;
          totalCost += existing.tokenUsage?.estimatedCostUsd || 0;
          continue;
        }
      } catch {
        // Cached file is invalid, re-parse
      }
    }

    try {
      const result = await parsePdf(pdfPath);
      allResults.push({ filing, result });
      totalTransactions += result.transactions.length;
      totalCost += result.tokenUsage.estimatedCostUsd;
      console.log(`           OK: ${result.transactions.length} transactions, $${result.tokenUsage.estimatedCostUsd}`);
    } catch (err: any) {
      console.error(`           FAILED: ${err.message}`);
      allResults.push({ filing, result: null, error: err.message });
      failedPdfs.push(`${filing.label} (${filing.date}): ${err.message}`);
    }

    // Rate limit: 3 seconds between API calls
    if (i < pdfPaths.length - 1) {
      console.log("           Waiting 3s (rate limit)...");
      await sleep(3000);
    }
  }

  // 4. Combine all transactions
  console.log("\n\n--- Combining and Deduplicating ---\n");

  const allTransactions: (ParsedTransaction & { _source?: string })[] = [];

  for (const { filing, result } of allResults) {
    if (!result) continue;
    for (const tx of result.transactions) {
      allTransactions.push({
        ...tx,
        _source: `${filing.label} (${filing.date})`,
      });
    }
  }

  console.log(`Total raw transactions across all PDFs: ${allTransactions.length}`);

  // Deduplicate by (description, date, type)
  // Keep the most recent filing's version (sourceFilings are sorted newest-first)
  const seen = new Map<string, ParsedTransaction>();
  let dupeCount = 0;

  for (const tx of allTransactions) {
    // Normalize the key: trim whitespace, lowercase for comparison
    const key = `${tx.description.trim().toLowerCase()}|${tx.date}|${tx.type.toLowerCase()}`;

    if (!seen.has(key)) {
      // Remove the _source field before storing
      const { _source, ...cleanTx } = tx;
      seen.set(key, cleanTx as ParsedTransaction);
    } else {
      dupeCount++;
    }
  }

  const deduped = Array.from(seen.values());

  // Sort by date descending, then by description
  deduped.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return a.description.localeCompare(b.description);
  });

  console.log(`After deduplication: ${deduped.length} unique transactions (removed ${dupeCount} duplicates)`);

  // Remove the confidence field from final output (not in the existing schema)
  const finalTransactions = deduped.map(({ confidence, ...rest }) => rest);

  // Count sales vs purchases and late filings
  const sales = finalTransactions.filter(t => t.type.startsWith("Sale")).length;
  const purchases = finalTransactions.filter(t => t.type === "Purchase").length;
  const exchanges = finalTransactions.filter(t => t.type === "Exchange").length;
  const lateFilings = finalTransactions.filter(t => t.lateFilingFlag).length;

  console.log(`\nBreakdown:`);
  console.log(`  Sales: ${sales}`);
  console.log(`  Purchases: ${purchases}`);
  console.log(`  Exchanges: ${exchanges}`);
  console.log(`  Late filings: ${lateFilings}`);

  // 5. Write back to the JSON file
  console.log("\n--- Writing Updated JSON ---\n");

  // Build the updated summary
  const typeBreakdown: string[] = [];
  if (sales > 0) typeBreakdown.push(`${sales} sales`);
  if (purchases > 0) typeBreakdown.push(`${purchases} purchases`);
  if (exchanges > 0) typeBreakdown.push(`${exchanges} exchanges`);

  const newSummary = `Trump reported ${typeBreakdown.join(" and ")} across ${finalTransactions.length} transactions from 12 filings. ${lateFilings} were filed late. Holdings include bank preferred securities (BAC, KEY, WFC, FITB), municipal bonds, and ETFs.`;

  const updatedData = {
    name: trumpData.name,
    slug: trumpData.slug,
    title: trumpData.title,
    agency: trumpData.agency,
    level: trumpData.level,
    filingType: trumpData.filingType,
    mostRecentFilingDate: trumpData.mostRecentFilingDate,
    transactions: finalTransactions,
    summary: newSummary,
    tookOfficeDate: trumpData.tookOfficeDate,
    party: trumpData.party,
    sourceFilings: trumpData.sourceFilings,
  };

  await writeFile(TRUMP_JSON_PATH, JSON.stringify(updatedData, null, 2) + "\n");

  console.log(`Written: ${TRUMP_JSON_PATH}`);
  console.log(`Transactions: ${trumpData.transactions.length} -> ${finalTransactions.length}`);
  console.log(`Summary: ${newSummary}`);

  // 6. Report
  console.log("\n\n=== COMPLETE ===\n");
  console.log(`PDFs parsed: ${allResults.filter(r => r.result).length}/${sourceFilings.length}`);
  console.log(`Total transactions: ${finalTransactions.length}`);
  console.log(`Duplicates removed: ${dupeCount}`);
  console.log(`Total API cost: $${totalCost.toFixed(4)}`);

  if (failedPdfs.length > 0) {
    console.log(`\nFAILED PDFs (${failedPdfs.length}):`);
    failedPdfs.forEach(f => console.log(`  - ${f}`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
