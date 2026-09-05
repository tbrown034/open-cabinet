/**
 * Reverify: re-read published filings through both lanes and compare the
 * result to what the site shows. Report first. Replace only on --apply.
 *
 *   pnpm reverify bessent-scott               one official, report only
 *   pnpm reverify --all                       whole corpus, report only
 *   pnpm reverify bessent-scott --apply       replace the official's rows
 *                                             with the fresh set in the report
 *   pnpm reverify --all --skip-scans          leave scanned filings alone
 *
 * What one run does, per official:
 *   1. read    every filing goes through the same fetch/read stages the
 *              weekly ingest uses. A filing with a current keyed cache is
 *              free; anything else is a paid model call. --dry-cost prints
 *              the estimate and stops.
 *   2. check   the text-layer lane compares each fresh reading; every
 *              verdict lands in data/meta/crosscheck-log.json.
 *   3. assemble the fresh row set with the same amendment-aware rule the
 *              ingest uses, starting from nothing, so an amended filing
 *              that repeats rows does not double them.
 *   4. compare fresh rows to published rows by filing and by the full
 *              tuple. Report what would be added, removed or changed.
 *   5. apply   (only with --apply) replace the rows, keep the old set in
 *              data/meta/reverify-history/, mark the summary stale if the
 *              facts moved. Run validate and generate-exports afterward.
 *
 * Reports go to data/meta/reverify-reports/<slug>-<date>.md and .json.
 * This is also the evaluation harness: change the prompt or the model,
 * reverify a fixed set, and the report is the score.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  checkFiling,
  fetchFiling,
  mergeRows,
  readFiling,
  sleep,
  stageOptions,
  type FilingForIngest,
  type OfficialFile,
  type ParsedTransaction,
} from "../lib/ingest-stages";
import { computeStats, buildFactBlock, factHash } from "../lib/summary-facts";
import { readCrosscheckLog } from "../lib/crosscheck-log";
import { isTerminationForm } from "../lib/parse-cache";
import { diffRows, type RowLike } from "../lib/reverify-diff";

dotenv.config({ path: ".env.local" });

const REPORT_DIR = path.resolve("data/meta/reverify-reports");
const HISTORY_DIR = path.resolve("data/meta/reverify-history");

function fmtRow(r: RowLike): string {
  return `${r.date} ${r.type.padEnd(14)} ${(r.amount ?? "unknown").padEnd(24)} ${(r.ticker ?? "").padEnd(6)} ${r.description}`;
}

async function reverifyOfficial(slug: string, apply: boolean, skipScans: boolean, dryCost: boolean) {
  const filePath = path.resolve(`data/officials/${slug}.json`);
  const official: OfficialFile = JSON.parse(await readFile(filePath, "utf-8"));
  const filings = (official.sourceFilings ?? []).filter((f) => f.url);
  const log = readCrosscheckLog();
  const perFilingParses: ParsedTransaction[][] = [];
  const filingsRead: FilingForIngest[] = [];
  const laneVerdicts: string[] = [];
  let skipped = 0;

  for (const f of filings) {
    const pdfFile = decodeURIComponent(f.url.split("/").pop() || "");
    const prior = log?.entries.find((e) => e.sourceUrl === f.url);
    if (skipScans && prior?.state === "no_usable_text") {
      skipped++;
      continue;
    }
    if (isTerminationForm(pdfFile)) {
      skipped++;
      laneVerdicts.push(`${pdfFile}: 278-TERM, skipped`);
      continue;
    }
    const filing: FilingForIngest = { name: official.name, docDate: f.date, pdfUrl: f.url };
    if (dryCost) {
      filingsRead.push(filing);
      continue;
    }
    const { pdfPath, sha256 } = await fetchFiling(slug, filing);
    const rows = await readFiling(pdfPath, sha256, f.url);
    try {
      await checkFiling(slug, official.name, filing, pdfPath, sha256, rows);
      laneVerdicts.push(`${pdfFile}: lanes agree (${rows.length} rows)`);
    } catch (err) {
      laneVerdicts.push(`${pdfFile}: ${(err as Error).message}`);
    }
    perFilingParses.push(rows);
    filingsRead.push(filing);
    await sleep(1000);
  }

  if (dryCost) {
    console.log(`${slug}: ${filingsRead.length} filings would be read (${skipped} skipped). Cost estimate: run pnpm plan-reparse ${slug}.`);
    return;
  }

  // Fresh set from nothing, same amendment-aware rule as the ingest.
  const fresh = mergeRows({ ...official, transactions: [] }, perFilingParses, filingsRead) as unknown as RowLike[];
  const published = official.transactions as unknown as RowLike[];
  const publishedInScope = skipScans
    ? published.filter((r) => filingsRead.some((f) => f.pdfUrl === r.sourceUrl))
    : published;
  const diff = diffRows(publishedInScope, fresh);

  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = path.join(REPORT_DIR, `${slug}-${stamp}`);
  const lines: string[] = [];
  lines.push(`# Reverify: ${official.name} (${slug}), ${stamp}`);
  lines.push("");
  lines.push(`Filings read: ${filingsRead.length}. Skipped: ${skipped}. Published rows in scope: ${diff.published}. Fresh rows: ${diff.fresh}.`);
  lines.push(`Matched exactly: ${diff.matched}. Changed: ${diff.changed.length}. Would be removed: ${diff.removed.length}. Would be added: ${diff.added.length}.`);
  lines.push("");
  lines.push("## Lane verdicts");
  for (const v of laneVerdicts) lines.push(`- ${v}`);
  if (diff.changed.length) {
    lines.push("", "## Changed (same trade, different words)");
    for (const c of diff.changed) lines.push(`- before: ${fmtRow(c.before)}`, `  after:  ${fmtRow(c.after)}`);
  }
  if (diff.removed.length) {
    lines.push("", "## Would be removed (published, not in the fresh reading)");
    for (const r of diff.removed) lines.push(`- ${fmtRow(r)}`);
  }
  if (diff.added.length) {
    lines.push("", "## Would be added (in the fresh reading, not published)");
    for (const r of diff.added) lines.push(`- ${fmtRow(r)}`);
  }
  lines.push("", diff.changed.length + diff.removed.length + diff.added.length === 0 ? "No changes. The fresh reading reproduces the published rows." : `Apply with: pnpm reverify ${slug} --apply`);
  await writeFile(`${base}.md`, lines.join("\n") + "\n");
  await writeFile(`${base}.json`, JSON.stringify({ slug, stamp, laneVerdicts, diff }, null, 2) + "\n");
  console.log(lines.join("\n"));
  console.log(`\nReport: ${base}.md`);

  if (!apply) return;
  if (skipScans && skipped) {
    throw new Error("--apply with --skip-scans would drop rows from skipped filings; run without --skip-scans to apply");
  }
  await mkdir(HISTORY_DIR, { recursive: true });
  await writeFile(
    path.join(HISTORY_DIR, `${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    JSON.stringify({ slug, replacedAt: new Date().toISOString(), previousTransactions: official.transactions, diff }, null, 2) + "\n"
  );
  const byDateDesc = (a: RowLike, b: RowLike) => (b.date || "").localeCompare(a.date || "") || a.description.localeCompare(b.description);
  const before = factHash(buildFactBlock(computeStats(official as never), official as never));
  const updated: OfficialFile = { ...official, transactions: [...fresh].sort(byDateDesc) as unknown as OfficialFile["transactions"] };
  const after = factHash(buildFactBlock(computeStats(updated as never), updated as never));
  if (before !== after && updated.summary && !updated.summaryStaleSince) {
    updated.summaryStaleSince = stamp;
  }
  await writeFile(filePath, JSON.stringify(updated, null, 2) + "\n");
  console.log(`\nApplied. Previous rows saved under data/meta/reverify-history/. Now run: pnpm validate && pnpm generate-exports`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const skipScans = args.includes("--skip-scans");
  const dryCost = args.includes("--dry-cost");
  const all = args.includes("--all");
  const slugs = args.filter((a) => !a.startsWith("--"));
  stageOptions.forceReparse = args.includes("--force-reparse");
  if (!all && slugs.length === 0) {
    console.log("usage: reverify.ts <slug> [--apply] [--skip-scans] [--dry-cost] | --all [--skip-scans]");
    process.exit(1);
  }
  if (all && apply) throw new Error("--apply is per official; read each report first");
  const targets = all
    ? (await import("fs")).readdirSync(path.resolve("data/officials")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
    : slugs;
  for (const slug of targets) {
    if (!existsSync(path.resolve(`data/officials/${slug}.json`))) throw new Error(`no official ${slug}`);
    await reverifyOfficial(slug, apply, skipScans, dryCost);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
