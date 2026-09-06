/**
 * Ingest new downloadable OGE 278-T filings into the static JSON dataset.
 *
 * Seven stages: find, fetch, read, check, merge, validate, publish. The
 * first five are functions in this file, named as such. Validate is
 * scripts/validate.ts and publish is the pull request the workflow opens.
 * research/pipeline.md describes each stage in three lines: what happens,
 * what stops it, what a person does. A test asserts the names match.
 *
 * A new official is bootstrapped from OGE metadata only when OGE supplies a
 * title and an agency; otherwise the official is held for a person.
 *
 * Usage: npx tsx scripts/ingest-new-filings.ts
 *        npx tsx scripts/ingest-new-filings.ts --from-file /tmp/new-filings.json
 *        npx tsx scripts/ingest-new-filings.ts --from-file plan.json --force-reparse
 *
 * --force-reparse ignores every cache for the listed filings and pays for a
 * fresh parse. Use it only with a plan from scripts/plan-reparse.ts and an
 * approved cost; the weekly job never passes it.
 *
 * --parse-only runs find, fetch, read and check, records the cross-check
 * verdict and the cache, and stops before merge. Nothing in data/officials
 * changes. This is how a published filing is re-read to test the path; the
 * merge stage adds rows and is not a way to replace them (see
 * scripts/reverify.ts for that).
 */
import { readFile, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  diffNewFilings,
  fetchOgeRecords,
  getTargetFilings,
  type TargetFiling,
  writeLastCheckState,
} from "../lib/oge-filings";
import { loadKnownFilingUrlsFromData } from "../lib/oge-filings";
import { reconcileSummaryAfterIngest } from "../lib/summary-review";
import {
  checkFiling,
  FilingHeldError,
  fetchFiling,
  mergeRows,
  readFiling,
  sleep,
  stageOptions,
  type FilingForIngest,
  type OfficialFile,
  type ParsedTransaction,
  type SourceFiling,
} from "../lib/ingest-stages";

dotenv.config({ path: ".env.local" });

stageOptions.forceReparse = process.argv.includes("--force-reparse");
const PARSE_ONLY = process.argv.includes("--parse-only");
/** Filings the publication gate held for a person this run. Reported at the end. */
const heldForAPerson: string[] = [];

interface NewFilingsLoadResult {
  filingsBySlug: Record<string, FilingForIngest[]>;
  targetFilings?: TargetFiling[];
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

/** FIND. Ask the OGE API for filings and diff their PDF URLs against the
 *  ones already tracked in data/officials. Stops on: API failure. With
 *  --from-file, the list comes from a plan instead of the API. */
async function findNewFilings(): Promise<NewFilingsLoadResult> {
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

/**
 * Check stage, recorded. Every verdict, including "scan", lands in
 * data/meta/crosscheck-log.json so the methodology page can state what the
 * deterministic lane actually compared.
 */
async function writeOfficial(
  slug: string,
  filePath: string,
  official: OfficialFile,
  addedTxs: ParsedTransaction[],
  newSourceEntries: SourceFiling[]
): Promise<{ added: number; total: number }> {
  const existingSourceUrls = new Set((official.sourceFilings || []).map((f) => f.url));
  const uniqueNewSourceEntries = newSourceEntries.filter((f) => {
    if (existingSourceUrls.has(f.url)) return false;
    existingSourceUrls.add(f.url);
    return true;
  });

  if (addedTxs.length === 0 && uniqueNewSourceEntries.length === 0) {
    console.log(`  [${slug}] nothing to add`);
    return { added: 0, total: official.transactions.length };
  }

  const byDateDesc = (a: ParsedTransaction, b: ParsedTransaction) => {
    const d = (b.date || "").localeCompare(a.date || "");
    if (d !== 0) return d;
    return (a.description || "").localeCompare(b.description || "");
  };
  const merged = [...addedTxs, ...official.transactions].sort(byDateDesc);
  const sourceFilings = [...uniqueNewSourceEntries, ...(official.sourceFilings || [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const updated: OfficialFile = {
    ...official,
    transactions: merged,
    sourceFilings,
    mostRecentFilingDate: sourceFilings[0]?.date || official.mostRecentFilingDate,
    lastIngestedDate: new Date().toISOString().slice(0, 10),
    lastIngestedNewCount: addedTxs.length,
    // The actual added rows (date-desc), so the digest can preview the new
    // trades exactly instead of proxying by newest transaction date — the
    // proxy breaks on late filings that disclose old-dated trades.
    lastIngestedTrades: [...addedTxs].sort(byDateDesc),
  };

  // An existing summary is never overwritten. A missing one gets the
  // deterministic template, labeled as such. A published summary whose
  // facts just changed is marked stale so a person regenerates it.
  const reconciled = reconcileSummaryAfterIngest(
    updated as Parameters<typeof reconcileSummaryAfterIngest>[0],
    summarizeTransactions(official.name, merged),
    { rowsAdded: addedTxs.length }
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

async function ingestForOfficial(
  slug: string,
  newPdfs: FilingForIngest[]
): Promise<{ added: number; total: number } | null> {
  const filePath = path.resolve(`data/officials/${slug}.json`);
  const existingOfficial = existsSync(filePath);
  const firstFiling = newPdfs[0];
  if (!existingOfficial && (!firstFiling.title || !firstFiling.agency)) {
    // A new official with no title or agency from OGE would publish a page
    // that says "Unknown". Held for a person to add the metadata first.
    console.warn(`  [${slug}] new official with no title or agency from OGE; held for a person, nothing ingested`);
    heldForAPerson.push(`${slug}: new official, OGE metadata lacks title or agency; add data/officials/${slug}.json by hand`);
    return null;
  }
  const official: OfficialFile = existingOfficial
    ? JSON.parse(await readFile(filePath, "utf-8"))
    : {
        name: firstFiling.name,
        slug,
        title: firstFiling.title,
        agency: firstFiling.agency,
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
  /** Filings that passed the gate, in step with perFilingParses. A held
   * filing is in neither, so mergeRows stamps rows with the right URL. */
  const mergedFilings: typeof newPdfs = [];
  const heldFilings = heldForAPerson;
  for (const filing of newPdfs) {
    const { pdfPath, sha256 } = await fetchFiling(slug, filing);
    const rows = await readFiling(pdfPath, sha256, filing.pdfUrl);
    let gate;
    try {
      gate = await checkFiling(slug, official.name, filing, pdfPath, sha256, rows);
    } catch (err) {
      if (err instanceof FilingHeldError) {
        // Held for a person. The review item and email are already out.
        // The filing stays out of the merge; the rest of the run goes on.
        console.warn(`  [${slug}] ${err.message}`);
        heldFilings.push(`${slug}: ${err.pdfFile} (${err.reason})`);
        continue;
      }
      throw err;
    }
    console.log(`  [${slug}] publication gate: ${gate.verdict}${gate.verdict === "two_lane" ? ` (${gate.lane})` : ""}`);
    if (PARSE_ONLY) {
      console.log(`  [${slug}] --parse-only: ${rows.length} rows read and checked; not merged`);
      continue;
    }
    perFilingParses.push(rows);
    mergedFilings.push(filing);
    newSourceEntries.push({
      date: filing.docDate.slice(0, 10),
      url: filing.pdfUrl,
      // Label from the filename (e.g. "Trump-05.08.2026-278T(2)")
      label: path.basename(pdfPath).replace(/\.pdf$/i, "").replace(/[_]+/g, " "),
    });
    await sleep(2000); // rate limit
  }

  if (PARSE_ONLY) return { added: 0, total: official.transactions.length };
  const addedTxs = mergeRows(official, perFilingParses, mergedFilings);
  return writeOfficial(slug, filePath, official, addedTxs, newSourceEntries);
}

/** VALIDATE. Run scripts/validate.ts over the whole dataset after the
 *  merges. Exit 1 is fatal and stops here. Exit 2 is review-required and,
 *  until a staging area exists, also stops here: nothing reaches the
 *  publish stage with an open review item. Enforced. */
function validateDataset(): void {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  console.log("\n=== Validate ===");
  const run = spawnSync("npx", ["tsx", "scripts/validate.ts"], { stdio: "inherit" });
  if (run.status === 1) throw new Error("validation failed (fatal); nothing will be published");
  if (run.status === 2) {
    throw new Error(
      "validation found review-required items; resolve them (a person decides) before publishing"
    );
  }
  if (run.status !== 0) throw new Error(`validate.ts exited ${run.status}`);
}

/** PUBLISH, handed off. This script cannot publish: it records which
 *  filings were processed in data/meta/last-check.json and stops. The
 *  workflow rebuilds the index and exports and opens a pull request; a
 *  person merges it. The merge is the publication decision. */
async function handOffForPublish(
  targetFilings: TargetFiling[] | undefined,
  newFilings: Record<string, FilingForIngest[]>
): Promise<void> {
  if (!targetFilings) return;
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
  console.log("\nUpdated data/meta/last-check.json. Publication is the pull request a person merges.");
}

async function main() {
  console.log("\n=== Ingest New Filings ===\n");

  const { filingsBySlug, targetFilings } = await findNewFilings();
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

  if (PARSE_ONLY) {
    console.log("\n--parse-only: skipped validate and publish; no data file changed.");
    return;
  }
  validateDataset();
  if (heldForAPerson.length) {
    console.log(`\nHeld for a person (${heldForAPerson.length}), not merged:`);
    for (const h of heldForAPerson) console.log(`  ${h}`);
  }
  await handOffForPublish(targetFilings, newFilings);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
