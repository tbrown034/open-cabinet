/**
 * Ingest the new filings listed in /tmp/new-filings.json (built by
 * the diff in this session). For each PDF: download if missing,
 * parse with Sonnet, then merge into the official's JSON, dedupe,
 * append to sourceFilings, and write back.
 *
 * Skips officials that don't have an existing JSON yet (Vaden,
 * Isaacman) — those need metadata bootstrapped first.
 *
 * Usage: npx tsx scripts/ingest-new-filings.ts
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import https from "https";
import { parsePdf, type ParsedTransaction } from "./parse-pdf.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const NEW_FILINGS_PATH = "/tmp/new-filings.json";
const PDF_DIR = path.resolve("data/pdfs");

interface SourceFiling {
  date: string;
  url: string;
  label: string;
}

interface OfficialFile {
  name: string;
  slug: string;
  title?: string;
  agency?: string;
  level?: string;
  filingType?: string;
  mostRecentFilingDate?: string;
  transactions: Array<ParsedTransaction & { confidence?: number }>;
  summary?: string;
  tookOfficeDate?: string;
  party?: string;
  sourceFilings?: SourceFiling[];
  [k: string]: unknown;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = require("fs").createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "OpenCabinet/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          if (res.headers.location) {
            downloadFile(res.headers.location, dest).then(resolve, reject);
          } else {
            reject(new Error("Redirect with no location"));
          }
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", reject);
  });
}

function pdfFilenameFromUrl(url: string): string {
  // The URL ends with /$FILE/<filename>
  const tail = url.split("/").pop() || "filing.pdf";
  return decodeURIComponent(tail);
}

async function ensurePdf(url: string): Promise<string> {
  await mkdir(PDF_DIR, { recursive: true });
  const filename = pdfFilenameFromUrl(url);
  const dest = path.join(PDF_DIR, filename);
  if (existsSync(dest) && statSync(dest).size > 5000) return dest;
  console.log(`    Downloading ${filename}...`);
  await downloadFile(url, dest);
  return dest;
}

function txKey(tx: ParsedTransaction): string {
  return `${tx.description.trim().toLowerCase()}|${tx.date}|${tx.type.toLowerCase()}|${tx.amount}`;
}

async function ingestForOfficial(
  slug: string,
  newPdfs: Array<[string, string]>
): Promise<{ added: number; total: number } | null> {
  const filePath = path.resolve(`data/officials/${slug}.json`);
  if (!existsSync(filePath)) {
    console.log(`  [${slug}] no JSON file — skipping (needs bootstrap)`);
    return null;
  }

  const official: OfficialFile = JSON.parse(await readFile(filePath, "utf-8"));
  const existingKeys = new Set(official.transactions.map(txKey));

  let allNew: ParsedTransaction[] = [];
  const newSourceEntries: SourceFiling[] = [];

  for (const [docDate, url] of newPdfs) {
    const pdfPath = await ensurePdf(url);
    const sizeKb = (statSync(pdfPath).size / 1024).toFixed(0);
    console.log(`  [${slug}] parsing ${path.basename(pdfPath)} (${sizeKb} KB)`);

    const result = await parsePdf(pdfPath);
    console.log(
      `           ${result.transactions.length} txns, $${result.tokenUsage.estimatedCostUsd}`
    );

    // Cache parsed JSON next to PDF for re-runs
    await writeFile(
      pdfPath.replace(/\.pdf$/i, ".parsed.json"),
      JSON.stringify(result, null, 2)
    );

    allNew.push(...result.transactions);

    // Build a label from the filename (e.g. "Trump-05.08.2026-278T(2)")
    const label = path
      .basename(pdfPath)
      .replace(/\.pdf$/i, "")
      .replace(/[_]+/g, " ");
    newSourceEntries.push({ date: docDate, url, label });

    await sleep(2000); // rate limit
  }

  // Dedupe against existing + within-batch
  const addedTxs: ParsedTransaction[] = [];
  for (const tx of allNew) {
    const key = txKey(tx);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    // Strip confidence — not in stored schema
    const { confidence, ...rest } = tx as ParsedTransaction & { confidence?: number };
    addedTxs.push(rest as ParsedTransaction);
  }

  if (addedTxs.length === 0 && newSourceEntries.length === 0) {
    console.log(`  [${slug}] nothing to add`);
    return { added: 0, total: official.transactions.length };
  }

  // Merge and re-sort descending by date
  const merged = [...addedTxs, ...official.transactions];
  merged.sort((a, b) => {
    const d = (b.date || "").localeCompare(a.date || "");
    if (d !== 0) return d;
    return (a.description || "").localeCompare(b.description || "");
  });

  // Source filings: prepend new entries, keep existing
  const sourceFilings = [...newSourceEntries, ...(official.sourceFilings || [])];

  const mostRecentFilingDate = newSourceEntries[0]?.date || official.mostRecentFilingDate;

  const updated: OfficialFile = {
    ...official,
    transactions: merged,
    sourceFilings,
    mostRecentFilingDate,
  };

  await writeFile(filePath, JSON.stringify(updated, null, 2) + "\n");
  console.log(
    `  [${slug}] +${addedTxs.length} txns (total ${merged.length}), +${newSourceEntries.length} sourceFilings`
  );
  return { added: addedTxs.length, total: merged.length };
}

async function main() {
  console.log("\n=== Ingest New Filings ===\n");

  const newFilings: Record<string, Array<[string, string]>> = JSON.parse(
    await readFile(NEW_FILINGS_PATH, "utf-8")
  );

  const results: Record<string, { added: number; total: number } | null> = {};
  for (const [slug, pdfs] of Object.entries(newFilings)) {
    console.log(`\n→ ${slug} (${pdfs.length} new PDF${pdfs.length > 1 ? "s" : ""})`);
    try {
      results[slug] = await ingestForOfficial(slug, pdfs);
    } catch (err: any) {
      console.error(`  [${slug}] FAILED: ${err.message}`);
      results[slug] = null;
    }
  }

  console.log("\n=== Summary ===");
  for (const [slug, r] of Object.entries(results)) {
    if (!r) {
      console.log(`  ${slug}: SKIPPED or FAILED`);
    } else {
      console.log(`  ${slug}: +${r.added} txns (total ${r.total})`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
