/**
 * Ingest new downloadable OGE 278-T filings into the static JSON dataset.
 * For each PDF: download if missing, parse with Sonnet, merge into the
 * official's JSON, dedupe, append to sourceFilings, and write back.
 *
 * Officials without existing JSON are treated as failures; those need metadata
 * bootstrapped before an automated ingest can safely update the public site.
 *
 * Usage: npx tsx scripts/ingest-new-filings.ts
 *        npx tsx scripts/ingest-new-filings.ts --from-file /tmp/new-filings.json
 */
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import https from "https";
import { PDFDocument } from "pdf-lib";
import { parsePdf, type ParsedTransaction } from "./parse-pdf.js";
import dotenv from "dotenv";
import {
  diffNewFilings,
  fetchOgeRecords,
  getTargetFilings,
  type TargetFiling,
  writeLastCheckState,
} from "../lib/oge-filings";
import { loadKnownFilingUrlsFromData } from "../lib/oge-filings";

dotenv.config({ path: ".env.local" });

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

interface FilingForIngest extends TargetFiling {}

interface NewFilingsLoadResult {
  filingsBySlug: Record<string, FilingForIngest[]>;
  targetFilings?: TargetFiling[];
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

function slugFromOgeName(name: string): string {
  const parts = name.split(",").map((part) => part.trim()).filter(Boolean);
  const ordered = parts.length > 1 ? [parts[1], parts[0]] : parts;
  return ordered
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

async function splitPdfIfNeeded(pdfPath: string): Promise<string[]> {
  const buf = await readFile(pdfPath);
  if (buf.length <= 500_000) return [pdfPath];

  const doc = await PDFDocument.load(buf);
  const pageCount = doc.getPageCount();
  const bytesPerPage = buf.length / pageCount;
  const pagesPerChunk = Math.max(1, Math.floor(500_000 / bytesPerPage));
  const chunks: string[] = [];

  for (let i = 0; i < pageCount; i += pagesPerChunk) {
    const end = Math.min(i + pagesPerChunk, pageCount);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(
      doc,
      Array.from({ length: end - i }, (_, k) => i + k)
    );
    pages.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    const chunkPath = pdfPath.replace(/\.pdf$/i, `.pages${i + 1}-${end}.pdf`);
    await writeFile(chunkPath, bytes);
    chunks.push(chunkPath);
  }

  console.log(
    `           split ${path.basename(pdfPath)} into ${chunks.length} chunks`
  );
  return chunks;
}

async function parsePdfWithRetry(pdfPath: string): Promise<ParsedTransaction[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await parsePdf(pdfPath);
      console.log(
        `           ${result.transactions.length} txns, $${result.tokenUsage.estimatedCostUsd}`
      );
      await writeFile(
        pdfPath.replace(/\.pdf$/i, ".parsed.json"),
        JSON.stringify(result, null, 2)
      );
      return result.transactions;
    } catch (err: any) {
      console.warn(`           attempt ${attempt}/3 failed: ${err.message}`);
      if (attempt === 3) throw err;
      await sleep(5000 * attempt);
    }
  }

  return [];
}

function txKey(tx: ParsedTransaction): string {
  return `${tx.description.trim().toLowerCase()}|${tx.date}|${tx.type.toLowerCase()}|${tx.amount}`;
}

async function loadOfficialSlugMap(): Promise<Map<string, string>> {
  const officialsDir = path.resolve("data/officials");
  const files = await readdir(officialsDir);
  const map = new Map<string, string>();

  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const official: Pick<OfficialFile, "name" | "slug"> = JSON.parse(
      await readFile(path.join(officialsDir, file), "utf-8")
    );
    map.set(official.name, official.slug);
  }

  return map;
}

async function loadNewFilings(): Promise<NewFilingsLoadResult> {
  const args = process.argv.slice(2);
  const fromFileIndex = args.indexOf("--from-file");

  if (fromFileIndex >= 0) {
    const filePath = args[fromFileIndex + 1];
    if (!filePath) {
      throw new Error("--from-file requires a path");
    }
    const fromFile = JSON.parse(await readFile(filePath, "utf-8")) as Record<
      string,
      Array<[string, string]>
    >;
    const filingsBySlug: Record<string, FilingForIngest[]> = {};
    for (const [slug, filings] of Object.entries(fromFile)) {
      filingsBySlug[slug] = filings.map(([docDate, pdfUrl]) => ({
        name: slug,
        docDate,
        pdfUrl,
      }));
    }
    return { filingsBySlug };
  }

  const { records } = await fetchOgeRecords({
    log: (message) => console.log(`  ${message}`),
  });
  const targetFilings = getTargetFilings(records);
  const knownUrls = await loadKnownFilingUrlsFromData();
  const newFilings = diffNewFilings(targetFilings, knownUrls);
  const slugMap = await loadOfficialSlugMap();

  const grouped: Record<string, FilingForIngest[]> = {};
  for (const filing of newFilings) {
    const slug = slugMap.get(filing.name) ?? slugFromOgeName(filing.name);
    grouped[slug] ||= [];
    grouped[slug].push(filing);
  }

  return { filingsBySlug: grouped, targetFilings };
}

function summarizeTransactions(name: string, txs: ParsedTransaction[]): string {
  const lastName = name.split(",")[0] || name;
  const sales = txs.filter((tx) => tx.type.startsWith("Sale")).length;
  const purchases = txs.filter((tx) => tx.type === "Purchase").length;
  const exchanges = txs.filter((tx) => tx.type === "Exchange").length;
  const late = txs.filter((tx) => tx.lateFilingFlag).length;
  const parts: string[] = [];
  if (sales) parts.push(`${sales} sale${sales === 1 ? "" : "s"}`);
  if (purchases) parts.push(`${purchases} purchase${purchases === 1 ? "" : "s"}`);
  if (exchanges) parts.push(`${exchanges} exchange${exchanges === 1 ? "" : "s"}`);
  const actionSummary = parts.length ? parts.join(" and ") : "no reportable transactions";
  const lateSentence = late
    ? ` ${late} transaction${late === 1 ? "" : "s"} were marked as filed late.`
    : "";
  return `${lastName} reported ${actionSummary} across ${txs.length} transaction${txs.length === 1 ? "" : "s"} in the latest tracked 278-T filing.${lateSentence}`;
}

async function ingestForOfficial(
  slug: string,
  newPdfs: FilingForIngest[]
): Promise<{ added: number; total: number } | null> {
  const filePath = path.resolve(`data/officials/${slug}.json`);
  const existingOfficial = existsSync(filePath);
  const firstFiling = newPdfs[0];
  const official: OfficialFile = existingOfficial
    ? JSON.parse(await readFile(filePath, "utf-8"))
    : {
        name: firstFiling.name,
        slug,
        title: firstFiling.title || "Unknown",
        agency: firstFiling.agency || "Unknown",
        level: firstFiling.level || "Unknown",
        filingType: "278-T Periodic Transaction Report",
        mostRecentFilingDate: firstFiling.docDate.slice(0, 10),
        transactions: [],
        sourceFilings: [],
      };

  if (!existingOfficial) {
    console.log(`  [${slug}] bootstrapping new official from OGE metadata`);
  }

  const existingKeys = new Set(official.transactions.map(txKey));

  let allNew: ParsedTransaction[] = [];
  const newSourceEntries: SourceFiling[] = [];

  for (const filing of newPdfs) {
    const pdfPath = await ensurePdf(filing.pdfUrl);
    const sizeKb = (statSync(pdfPath).size / 1024).toFixed(0);
    console.log(`  [${slug}] parsing ${path.basename(pdfPath)} (${sizeKb} KB)`);

    const chunks = await splitPdfIfNeeded(pdfPath);
    for (const chunk of chunks) {
      if (chunk !== pdfPath) {
        console.log(`           parsing chunk ${path.basename(chunk)}`);
      }
      allNew.push(...(await parsePdfWithRetry(chunk)));
      await sleep(1500);
    }

    // Build a label from the filename (e.g. "Trump-05.08.2026-278T(2)")
    const label = path
      .basename(pdfPath)
      .replace(/\.pdf$/i, "")
      .replace(/[_]+/g, " ");
    newSourceEntries.push({
      date: filing.docDate.slice(0, 10),
      url: filing.pdfUrl,
      label,
    });

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

  const existingSourceUrls = new Set(
    (official.sourceFilings || []).map((filing) => filing.url)
  );
  const uniqueNewSourceEntries = newSourceEntries.filter((filing) => {
    if (existingSourceUrls.has(filing.url)) return false;
    existingSourceUrls.add(filing.url);
    return true;
  });

  if (addedTxs.length === 0 && uniqueNewSourceEntries.length === 0) {
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
  const sourceFilings = [
    ...uniqueNewSourceEntries,
    ...(official.sourceFilings || []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const mostRecentFilingDate =
    sourceFilings[0]?.date || official.mostRecentFilingDate;

  const updated: OfficialFile = {
    ...official,
    transactions: merged,
    sourceFilings,
    mostRecentFilingDate,
    summary: summarizeTransactions(official.name, merged),
    lastIngestedDate: new Date().toISOString().slice(0, 10),
    lastIngestedNewCount: addedTxs.length,
  };

  await writeFile(filePath, JSON.stringify(updated, null, 2) + "\n");
  console.log(
    `  [${slug}] +${addedTxs.length} txns (total ${merged.length}), +${uniqueNewSourceEntries.length} sourceFilings`
  );
  return { added: addedTxs.length, total: merged.length };
}

async function main() {
  console.log("\n=== Ingest New Filings ===\n");

  const { filingsBySlug, targetFilings } = await loadNewFilings();
  const newFilings = filingsBySlug;
  const slugs = Object.keys(newFilings);
  if (slugs.length === 0) {
    console.log("No new filings found.");
    return;
  }

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
  let failures = 0;
  for (const [slug, r] of Object.entries(results)) {
    if (!r) {
      console.log(`  ${slug}: SKIPPED or FAILED`);
      failures += 1;
    } else {
      console.log(`  ${slug}: +${r.added} txns (total ${r.total})`);
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} official ingest(s) failed`);
  }

  if (targetFilings) {
    await writeLastCheckState({
      filings: targetFilings,
      newFilings: targetFilings
        .filter((filing) =>
          Object.values(newFilings).some((group) =>
            group.some((newFiling) => newFiling.pdfUrl === filing.pdfUrl)
          )
        )
        .map((filing) => ({ ...filing, status: "processed" })),
    });
    console.log("\nUpdated data/meta/last-check.json");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
