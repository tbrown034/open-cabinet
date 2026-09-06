/**
 * Reverify: re-read published filings through both lanes and compare the
 * result to what the site shows. Report first. Replace only on --apply.
 *
 *   pnpm reverify bessent-scott               one official, report only
 *   pnpm reverify --all                       whole corpus, report only
 *   pnpm reverify bessent-scott --apply       replace the official's rows
 *                                             with the fresh set in the report
 *   pnpm reverify --all --skip-scans          leave scanned filings alone
 *   pnpm reverify --all --exclude trump-donald-j   everyone but one official
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
import { SpendCeilingError, spend } from "../lib/ingest-stages";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
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
import { readCrosscheckLog, hashRows } from "../lib/crosscheck-log";
import { readSecondReadLog } from "../lib/second-read";
import { readGrokAuditLog } from "../lib/grok-audit";
import { isTerminationForm } from "../lib/parse-cache";
import { diffRows, type RowLike } from "../lib/reverify-diff";

dotenv.config({ path: ".env.local" });

const REPORT_DIR = path.resolve("data/meta/reverify-reports");
const HISTORY_DIR = path.resolve("data/meta/reverify-history");

function fmtRow(r: RowLike): string {
  return `${r.date} ${r.type.padEnd(14)} ${(r.amount ?? "unknown").padEnd(24)} ${(r.ticker ?? "").padEnd(6)} ${r.description}`;
}

/**
 * Names the independent reads on disk of exactly these rows (same candidate
 * hash): the second model's read, a person's or the session's read, and
 * the page audit. Empty string when no second reader has seen these rows.
 */
function independentReadsOf(sourceUrl: string, rows: unknown): string {
  const candidate = hashRows(rows);
  const parts: string[] = [];
  const second = readSecondReadLog()?.filings[sourceUrl];
  if (second && second.candidateSha256 === candidate) parts.push(`second model read them (${second.agreedIndexes.length} agree, ${second.disputedIndexes.length} differ)`);
  const sessionPath = path.resolve("data/meta/session-read-log.json");
  if (existsSync(sessionPath)) {
    const session = JSON.parse(readFileSync(sessionPath, "utf-8")).filings?.[sourceUrl];
    if (session && session.candidateSha256 === candidate) parts.push(`${session.reader} read them (${session.agreedIndexes.length} agree, ${session.disputedIndexes.length} differ)`);
  }
  const audit = readGrokAuditLog()?.filings[sourceUrl];
  if (audit && audit.candidateSha256 === candidate && !audit.differences.some((d) => d.startsWith("audit incomplete"))) parts.push(`page audit checked them (${audit.confirmedIndexes.length} confirmed, ${audit.disputedIndexes.length} disputed)`);
  // A second independent reading is required; the audit alone is not one.
  const hasSecondRead = parts.some((p) => !p.startsWith("page audit"));
  return hasSecondRead ? parts.join("; ") : "";
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
  /** Filings whose gate did not pass. --apply refuses while any exist. */
  const notConfirmed: string[] = [];

  for (const f of filings) {
    const pdfFile = decodeURIComponent(f.url.split("/").pop() || "");
    const prior = log?.entries.find((e) => e.sourceUrl === f.url);
    const priorIsScan = prior && ["no_usable_text", "unsupported_layout", "ocr_tuple_agreement", "ocr_tuple_mismatch"].includes(prior.state);
    if (skipScans && priorIsScan) {
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
      const gate = await checkFiling(slug, official.name, filing, pdfPath, sha256, rows, { secondRead: false });
      // The ingest gate holds a whole filing when any row disagrees. For a
      // re-read of published rows the unit is the row: a filing whose exact
      // rows a second company's model (or a person) has read, and the page
      // audit has checked, may be applied; its disputed rows publish marked
      // disputed and stay on the review list. (Trevor, Sep 6.)
      const independent = independentReadsOf(f.url, rows);
      if (gate.verdict === "held" && !independent) notConfirmed.push(pdfFile);
      laneVerdicts.push(
        gate.verdict === "two_lane"
          ? `${pdfFile}: ${gate.lane === "text" ? "text layer" : "OCR"} agrees (${rows.length} rows)`
          : gate.verdict === "two_models"
            ? `${pdfFile}: second model agrees (${rows.length} rows)`
            : independent
              ? `${pdfFile}: gate held (${gate.reason.split("\n")[0]}); ${independent}; disputed rows publish marked disputed`
              : `${pdfFile}: NOT CONFIRMED, ${gate.reason}`
      );
    } catch (err) {
      notConfirmed.push(pdfFile);
      laneVerdicts.push(`${pdfFile}: NOT CONFIRMED, ${(err as Error).message.split("\n")[0]}`);
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
  lines.push(`Matched exactly: ${diff.matched}. Changed: ${diff.changed.length} (trade fields: ${diff.tradeChanged}; wording or ticker only: ${diff.wordingChanged}). Would be removed: ${diff.removed.length}. Would be added: ${diff.added.length}.`);
  lines.push("");
  lines.push("## Lane verdicts");
  for (const v of laneVerdicts) lines.push(`- ${v}`);
  const trade = diff.changed.filter((c) => !c.wordingOnly);
  const wording = diff.changed.filter((c) => c.wordingOnly);
  if (trade.length) {
    lines.push("", "## Changed: the trade itself reads differently (a person decides)");
    for (const c of trade) lines.push(`- ${c.fields.join(", ")}`, `  before: ${fmtRow(c.before)}`, `  after:  ${fmtRow(c.after)}`);
  }
  if (wording.length) {
    lines.push("", "## Changed: same trade, ticker or wording only");
    const filingOf = (u?: string) => decodeURIComponent((u ?? "").split("/").pop() || "");
    for (const c of wording) {
      const attribution = c.fields.includes("sourceUrl") ? ` [${filingOf(c.before.sourceUrl)} -> ${filingOf(c.after.sourceUrl)}]` : "";
      lines.push(`- ${c.fields.join(", ")}${attribution}`, `  before: ${fmtRow(c.before)}`, `  after:  ${fmtRow(c.after)}`);
    }
  }
  if (diff.removed.length) {
    lines.push("", "## Would be removed (published, not in the fresh reading)");
    for (const r of diff.removed) lines.push(`- ${fmtRow(r)}`);
  }
  if (diff.added.length) {
    lines.push("", "## Would be added (in the fresh reading, not published)");
    for (const r of diff.added) lines.push(`- ${fmtRow(r)}`);
  }
  const noChange = diff.changed.length + diff.removed.length + diff.added.length === 0;
  if (filingsRead.length === 0) {
    lines.push("", `Nothing was read: every filing was skipped (${skipped}). This report verifies nothing.`);
  } else if (notConfirmed.length) {
    lines.push("", `Not applicable: ${notConfirmed.length} filing(s) were not confirmed by a second read (${notConfirmed.join(", ")}). A person decides before anything is applied.`);
  } else if (noChange) {
    lines.push("", "No changes. The fresh reading reproduces the published rows.");
  } else {
    lines.push("", `Apply with: pnpm reverify ${slug} --apply`);
  }
  await writeFile(`${base}.md`, lines.join("\n") + "\n");
  await writeFile(`${base}.json`, JSON.stringify({ slug, stamp, laneVerdicts, diff }, null, 2) + "\n");
  console.log(lines.join("\n"));
  console.log(`\nReport: ${base}.md`);

  if (!apply) return;
  // Applying replaces the official's whole row set with the fresh one, so
  // every filing must have been read and confirmed. A skipped filing would
  // lose its rows; an unconfirmed one would publish an unchecked read.
  if (skipped) {
    throw new Error(`--apply would drop rows from ${skipped} skipped filing(s); nothing applied`);
  }
  if (notConfirmed.length) {
    throw new Error(`--apply refused: ${notConfirmed.length} filing(s) not confirmed by a second read (${notConfirmed.join(", ")}); a person decides first`);
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
  const excluded = new Set<string>();
  for (let i = 0; i < args.length; i++) if (args[i] === "--exclude" && args[i + 1]) excluded.add(args[++i]);
  const valued = new Set(["--exclude", "--ceiling"]);
  const slugs = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1] ?? ""));
  stageOptions.forceReparse = args.includes("--force-reparse");
  // Spend ceiling for this run, dollars. Default 25; the run stops and
  // emails the admin address when reached. Caches keep what was read.
  const ceilingArg = args.indexOf("--ceiling");
  stageOptions.ceilingUsd = ceilingArg >= 0 ? Number(args[ceilingArg + 1]) : 25;
  if (!Number.isFinite(stageOptions.ceilingUsd)) throw new Error("--ceiling needs a dollar amount");
  if (!all && slugs.length === 0) {
    console.log("usage: reverify.ts <slug> [--apply] [--skip-scans] [--dry-cost] [--ceiling <usd>] | --all [--skip-scans] [--exclude <slug>]...");
    process.exit(1);
  }
  if (all && apply) throw new Error("--apply is per official; read each report first");
  const targets = all
    ? (await import("fs")).readdirSync(path.resolve("data/officials")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
    : slugs;
  for (const slug of targets) {
    if (excluded.has(slug)) {
      console.log(`${slug}: excluded`);
      continue;
    }
    if (!existsSync(path.resolve(`data/officials/${slug}.json`))) throw new Error(`no official ${slug}`);
    try {
      await reverifyOfficial(slug, apply, skipScans, dryCost);
    } catch (err) {
      if (err instanceof SpendCeilingError) throw err;
      if (all && !apply) {
        // One official's failure is a finding for a person, not a reason
        // to leave the rest of the batch unread. Record it and go on.
        held.push(`${slug}: ${(err as Error).message.split("\n")[0]}`);
        console.error(`${slug}: HELD FOR A PERSON: ${(err as Error).message}`);
        continue;
      }
      throw err;
    }
  }
  if (held.length) {
    console.log(`\nHeld for a person (${held.length}):`);
    for (const h of held) console.log(`  ${h}`);
  }
  console.log(`\nModel spend this run: $${spend.usd.toFixed(2)} over ${spend.calls} calls (ceiling $${stageOptions.ceilingUsd}).`);
}
const held: string[] = [];

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
