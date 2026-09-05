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
 *        npx tsx scripts/ingest-new-filings.ts --from-file plan.json --force-reparse
 *
 * --force-reparse ignores every cache for the listed filings and pays for a
 * fresh parse. Use it only with a plan from scripts/plan-reparse.ts and an
 * approved cost; the weekly job never passes it.
 */
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import https from "https";
import { PDFDocument } from "pdf-lib";
import {
  parsePdf,
  ParseTruncatedError,
  EXTRACTION_PROMPT,
  SYSTEM_PROMPT,
  PARSER_VERSION,
  DEFAULT_MODEL,
  type ParsedTransaction,
} from "./parse-pdf.js";
import { crossCheckParsedFiling } from "./text-layer-crosscheck.js";
import { assertParsedRows } from "../lib/filing-validation";
import { reconcileSummaryAfterIngest } from "../lib/summary-review";
import {
  describeCacheKey,
  hasLegacyCacheOnly,
  promptHash,
  readParseCache,
  sha256File,
  writeParseCache,
  type ParseCacheKeyInput,
} from "../lib/parse-cache";
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
const FORCE_REPARSE = process.argv.includes("--force-reparse");

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
  summarySource?: "template" | "model";
  summaryFactSha256?: string;
  summaryStaleSince?: string;
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

/**
 * OGE reviewers annotate the certification page when a filer pays the $200
 * late-filing fee (e.g. "Filer paid late fee - HAJ 6/29/26"). Scan each
 * newly ingested PDF's text layer so payments are caught the day they post.
 * Hits go to data/meta/fee-annotations-pending.json for human review before
 * promotion into data/meta/fee-payments.json (which drives the site UI) —
 * OCR noise makes auto-publishing unsafe.
 */
async function scanPdfForFeeAnnotation(
  pdfPath: string,
  pdfUrl: string,
  slug: string
): Promise<void> {
  try {
    const { execFileSync } = require("node:child_process") as
      typeof import("node:child_process");
    const text = execFileSync("pdftotext", [pdfPath, "-"], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    // "Filer paid ..." / "... paid late fee(s)" are reviewer-annotation
    // phrasings; the form's printed instructions say "late filing fee" and
    // never "filer paid", so boilerplate does not trip this. "filing
    // extension" catches Integrity.gov's signature-block notice ("Filer
    // received a 45 day filing extension") — an extension changes whether a
    // late-looking filing actually missed its deadline, so it must surface
    // for review the day it posts.
    const pattern = /filer\s+paid|paid\s+late|filing\s+extension/i;
    const hit = pattern.test(text);
    if (!hit) return;
    const snippetMatch = text.match(/.{0,80}(?:filer\s+paid|paid\s+late|filing\s+extension).{0,80}/i);
    const pendingPath = path.resolve("data/meta/fee-annotations-pending.json");
    const pending: Array<Record<string, string>> = existsSync(pendingPath)
      ? JSON.parse(await readFile(pendingPath, "utf-8"))
      : [];
    const entry = {
      slug,
      pdfFile: path.basename(pdfPath),
      pdfUrl,
      snippet: (snippetMatch?.[0] ?? "").replace(/\s+/g, " ").trim(),
      detected: new Date().toISOString().slice(0, 10),
    };
    if (pending.some((p) => p.pdfFile === entry.pdfFile)) return;
    pending.push(entry);
    await writeFile(pendingPath, JSON.stringify(pending, null, 2) + "\n");
    console.warn(
      `  [${slug}] POSSIBLE FEE ANNOTATION in ${entry.pdfFile}: "${entry.snippet}" — review data/meta/fee-annotations-pending.json`
    );
  } catch {
    // pdftotext missing or unreadable PDF — the sweep script covers gaps.
  }
}

/** One piece of a filing to parse: the whole PDF, or a page-range chunk. */
interface ParseUnit {
  path: string;
  chunk: { first: number; last: number } | null;
}

async function splitPdfIfNeeded(pdfPath: string): Promise<ParseUnit[]> {
  const buf = await readFile(pdfPath);
  if (buf.length <= 500_000) return [{ path: pdfPath, chunk: null }];

  const doc = await PDFDocument.load(buf);
  const pageCount = doc.getPageCount();
  const bytesPerPage = buf.length / pageCount;
  const pagesPerChunk = Math.max(1, Math.floor(500_000 / bytesPerPage));
  const chunks: ParseUnit[] = [];

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
    chunks.push({ path: chunkPath, chunk: { first: i + 1, last: end } });
  }

  console.log(
    `           split ${path.basename(pdfPath)} into ${chunks.length} chunks`
  );
  return chunks;
}

const PROMPT_SHA256 = promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT);

/**
 * Read stage. Returns the rows for one parse unit, from the cache when
 * every input matches (PDF bytes, source URL, chunk, prompt, parser
 * version, model) and from the model otherwise. Both paths run the same
 * validation gate before anything is cached or merged.
 */
async function parseUnitWithRetry(
  unit: ParseUnit,
  filingPdfSha256: string,
  sourceUrl: string
): Promise<ParsedTransaction[]> {
  const keyInput: ParseCacheKeyInput = {
    pdfSha256: filingPdfSha256,
    sourceUrl,
    chunk: unit.chunk,
    parserVersion: PARSER_VERSION,
    promptSha256: PROMPT_SHA256,
    model: DEFAULT_MODEL,
  };

  const cached = FORCE_REPARSE ? null : readParseCache(unit.path, keyInput);
  if (cached) {
    // A cached parse is validated exactly like a fresh one. A bad row
    // that was cached before the gate existed must not slip through
    // because it came from disk instead of the model.
    const rows = assertParsedRows(cached.transactions, path.basename(unit.path));
    console.log(`           cached ${rows.length} txns (${describeCacheKey(keyInput)})`);
    return rows as ParsedTransaction[];
  }
  if (hasLegacyCacheOnly(unit.path, keyInput)) {
    console.log(
      `           legacy cache ignored for ${path.basename(unit.path)}: made under an earlier prompt or parser; re-parsing`
    );
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await parsePdf(unit.path);
      // Enum and shape gate before anything is cached or merged.
      const rows = assertParsedRows(result.transactions, path.basename(unit.path));
      console.log(
        `           ${rows.length} txns, $${result.tokenUsage.estimatedCostUsd}`
      );
      writeParseCache(unit.path, { ...keyInput, model: result.model }, {
        transactions: rows,
        tokenUsage: result.tokenUsage,
      });
      return rows as ParsedTransaction[];
    } catch (err: any) {
      // A response cut off at the token cap will be cut off again on a
      // retry. Surface it so the operator splits the PDF instead.
      if (err instanceof ParseTruncatedError) throw err;
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
  if (sales) parts.push(`${sales.toLocaleString()} sale${sales === 1 ? "" : "s"}`);
  if (purchases) parts.push(`${purchases.toLocaleString()} purchase${purchases === 1 ? "" : "s"}`);
  if (exchanges) parts.push(`${exchanges.toLocaleString()} exchange${exchanges === 1 ? "" : "s"}`);
  const actionSummary = parts.length ? parts.join(" and ") : "no reportable transactions";
  const lateSentence = late
    ? ` ${late.toLocaleString()} transaction${late === 1 ? "" : "s"} were marked as filed late.`
    : "";
  // These totals span every tracked filing, not just the newest one — saying
  // "the latest filing" here once shipped a wrong claim to Trump's page.
  return `${lastName} reported ${actionSummary} across ${txs.length.toLocaleString()} transactions in 278-T filings tracked by Open Cabinet.${lateSentence}`;
}

// OGE's raw Executive Schedule levels mapped to the site's editorial
// groupings (lib/types.ts GovernmentLevel). Level I is cabinet rank;
// Level II covers deputy-secretary and administrator posts.
function normalizeLevel(raw: string | undefined): string {
  if (!raw) return "Unknown";
  const cleaned = raw.trim();
  if (cleaned === "Level I") return "Cabinet";
  if (cleaned === "Level II") return "Sub-Cabinet";
  return cleaned;
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
        // OGE reports Executive Schedule strings; the site's GovernmentLevel
        // type uses editorial groupings, and the /all filter tabs match on
        // them exactly — raw "Level I"/"Level II" values silently drop the
        // official from every tab.
        level: normalizeLevel(firstFiling.level),
        filingType: "278-T Periodic Transaction Report",
        mostRecentFilingDate: firstFiling.docDate.slice(0, 10),
        transactions: [],
        sourceFilings: [],
      };

  if (!existingOfficial) {
    console.log(`  [${slug}] bootstrapping new official from OGE metadata`);
  }

  const perFilingParses: ParsedTransaction[][] = [];
  const newSourceEntries: SourceFiling[] = [];

  for (const filing of newPdfs) {
    const pdfPath = await ensurePdf(filing.pdfUrl);
    await scanPdfForFeeAnnotation(pdfPath, filing.pdfUrl, slug);
    const sizeKb = (statSync(pdfPath).size / 1024).toFixed(0);
    console.log(`  [${slug}] parsing ${path.basename(pdfPath)} (${sizeKb} KB)`);

    const filingTxs: ParsedTransaction[] = [];
    const filingSha256 = sha256File(pdfPath);
    const units = await splitPdfIfNeeded(pdfPath);
    for (const unit of units) {
      if (unit.chunk) {
        console.log(`           parsing chunk ${path.basename(unit.path)}`);
      }
      filingTxs.push(...(await parseUnitWithRetry(unit, filingSha256, filing.pdfUrl)));
      await sleep(1500);
    }
    perFilingParses.push(filingTxs);

    // Independent verification lane: the PDF's own text layer, parsed
    // deterministically, must agree with the AI parse on row count, types,
    // dates, amounts, and late flags. The two lanes fail differently, so a
    // mismatch means one of them is wrong — halt before merging rather than
    // publish an unverified parse. Scans have no text layer; those fall back
    // to the standing manual rule (visual row-number reconciliation).
    const check = crossCheckParsedFiling(pdfPath, filingTxs);
    if (check.status === "ok") {
      console.log(
        `           text-layer cross-check OK (${check.rowCount} rows agree)`
      );
    } else if (check.status === "scan") {
      console.warn(
        `           SCAN — no text layer to cross-check. Do NOT commit until the parse is visually reconciled against printed row numbers.`
      );
    } else if (check.status === "error") {
      throw new Error(
        `text-layer cross-check could not run on ${path.basename(pdfPath)} (${check.message}) — ingest halted before merge`
      );
    } else {
      console.error(
        `  [${slug}] TEXT-LAYER MISMATCH in ${path.basename(pdfPath)}:`
      );
      for (const p of check.problems) console.error(`    - ${p}`);
      throw new Error(
        `text-layer cross-check failed for ${path.basename(pdfPath)} — ingest halted before merge`
      );
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

  // Amendment-aware dedupe, NOT row-unique dedupe. A filing that prints the
  // same description/date/type/amount on several numbered rows is disclosing
  // several real transactions (multi-lot and multi-account trades — the
  // Aug 2026 re-audit restored 76 rows a Set-based dedupe had collapsed).
  // Each key's final multiplicity is the largest count any single source
  // asserts: the existing data or ONE new filing. Re-filed amendments repeat
  // rows and add nothing; genuine intra-filing multiples top the count up.
  const countKeys = (txs: ParsedTransaction[]): Map<string, number> => {
    const c = new Map<string, number>();
    for (const tx of txs) c.set(txKey(tx), (c.get(txKey(tx)) ?? 0) + 1);
    return c;
  };
  const current = countKeys(official.transactions as ParsedTransaction[]);
  const target = new Map(current);
  for (const filingTxs of perFilingParses) {
    for (const [key, n] of countKeys(filingTxs)) {
      target.set(key, Math.max(target.get(key) ?? 0, n));
    }
  }
  const addedTxs: ParsedTransaction[] = [];
  for (let fi = 0; fi < perFilingParses.length; fi++) {
    const filingTxs = perFilingParses[fi];
    for (const tx of filingTxs) {
      const key = txKey(tx);
      if ((current.get(key) ?? 0) >= (target.get(key) ?? 0)) continue;
      current.set(key, (current.get(key) ?? 0) + 1);
      // Strip confidence — not in stored schema
      const { confidence, ...rest } = tx as ParsedTransaction & { confidence?: number };
      // Exact attribution: which filing disclosed this row. Powers the
      // Disclosed column/lag and the per-row PDF link without the date
      // heuristic. (confidence was destructured away, so go through
      // unknown — the stored schema intentionally drops it.)
      addedTxs.push({
        ...rest,
        sourceUrl: newPdfs[fi].pdfUrl,
      } as unknown as ParsedTransaction);
    }
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
    lastIngestedDate: new Date().toISOString().slice(0, 10),
    lastIngestedNewCount: addedTxs.length,
    // The actual added rows (date-desc), so the digest can preview the new
    // trades exactly instead of proxying by newest transaction date — the
    // proxy breaks on late filings that disclose old-dated trades.
    lastIngestedTrades: [...addedTxs].sort((a, b) => {
      const d = (b.date || "").localeCompare(a.date || "");
      if (d !== 0) return d;
      return (a.description || "").localeCompare(b.description || "");
    }),
  };

  // An existing summary is never overwritten by the ingest. A missing one
  // gets the deterministic template, labeled as such. A published summary
  // whose facts just changed is marked stale so a person regenerates it.
  const reconciled = reconcileSummaryAfterIngest(
    updated as Parameters<typeof reconcileSummaryAfterIngest>[0],
    summarizeTransactions(official.name, merged)
  ) as OfficialFile;
  if (reconciled.summaryStaleSince && !official.summaryStaleSince) {
    console.warn(
      `  [${slug}] summary is now STALE (facts changed): run refresh-summaries.ts --candidate ${slug}`
    );
  }

  await writeFile(filePath, JSON.stringify(reconciled, null, 2) + "\n");
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
