/**
 * Run the second-read lane (lib/second-read.ts): a second vision model,
 * from a different company, reads the filings no deterministic lane could
 * check, and its rows are compared with the primary model's.
 *
 *   pnpm second-read --dry-cost              list candidate filings and the estimate
 *   pnpm second-read [--only <text>] [--ceiling <usd>]
 *   pnpm second-read --slug <slug>            one official
 *   pnpm second-read --recompare              re-pair cached reads with the current comparator, no model calls
 *
 * Candidates: every published filing whose cross-check state is not an
 * agreement (scans, unreadable layouts, disagreements, unchecked), that has
 * a current parse record to compare against. Responses are cached under
 * the keyed parse cache with the second model's name; reruns are free.
 * Nothing here edits an official file.
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import { PDFDocument } from "pdf-lib";
import { readCrosscheckLog } from "../lib/crosscheck-log";
import { findParseRecord, promptHash } from "../lib/parse-cache";
import { recordSpend, spend, splitPdfIfNeeded, stageOptions, SpendCeilingError } from "../lib/ingest-stages";
import { readSecondReadLog, recordSecondRead, secondReadFiling, SECOND_READ_MODEL, type SecondReadLog } from "../lib/second-read";
import { parsePdf, EXTRACTION_PROMPT, SYSTEM_PROMPT, PARSER_VERSION, DEFAULT_MODEL, ParseTruncatedError } from "./parse-pdf.js";
import { notify } from "../lib/notify";

dotenv.config({ path: ".env.local" });

const PDF_DIR = path.resolve("data/pdfs");
const OFFICIALS_DIR = path.resolve("data/officials");
const PROMPT_SHA256 = promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT);
const AGREEMENT = new Set(["checked_tuple_agreement", "ocr_tuple_agreement"]);

function pdfFilenameFromUrl(url: string): string {
  return decodeURIComponent(url.split("/").pop() || "filing.pdf");
}

async function pageCount(pdfPath: string): Promise<number> {
  return (await PDFDocument.load(readFileSync(pdfPath))).getPageCount();
}

async function main() {
  const args = process.argv.slice(2);
  const dryCost = args.includes("--dry-cost");
  // --recompare pairs the cached second reads against the primary again
  // with the current comparator; no model call is made for a cached unit.
  const recompare = args.includes("--recompare");
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const slug = args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null;
  stageOptions.ceilingUsd = args.includes("--ceiling") ? Number(args[args.indexOf("--ceiling") + 1]) : 25;

  const crosscheck = readCrosscheckLog();
  if (!crosscheck) throw new Error("no cross-check log; run pnpm crosscheck-sweep first");
  const previous = readSecondReadLog();
  const log: SecondReadLog = previous ?? { version: 1, model: SECOND_READ_MODEL, generatedAt: new Date().toISOString(), filings: {} };

  const officialsBySlug = new Map<string, { name: string }>();
  for (const f of readdirSync(OFFICIALS_DIR).filter((f) => f.endsWith(".json"))) {
    const o = JSON.parse(readFileSync(path.join(OFFICIALS_DIR, f), "utf-8"));
    officialsBySlug.set(o.slug, { name: o.name });
  }

  const candidates = crosscheck.entries.filter((e) => {
    if (!e.sourceUrl || !e.pdfFile || !e.pdfSha256) return false;
    if (AGREEMENT.has(e.state)) return false;
    if (e.state === "unsupported_form" || e.state === "missing_local_document" || e.state === "missing_source") return false;
    if (slug && e.slug !== slug) return false;
    if (only && !e.pdfFile.includes(only) && !e.slug.includes(only)) return false;
    return true;
  });

  let estimate = 0;
  const plan: Array<{ e: (typeof candidates)[number]; pdfPath: string; pages: number; rows: number }> = [];
  for (const e of candidates) {
    const pdfPath = path.join(PDF_DIR, e.pdfFile!);
    if (!existsSync(pdfPath)) continue;
    const record = findParseRecord(pdfPath, { pdfSha256: e.pdfSha256!, sourceUrl: e.sourceUrl!, parserVersion: PARSER_VERSION, promptSha256: PROMPT_SHA256, model: DEFAULT_MODEL });
    if (!record) {
      console.log(`  skip ${e.slug} ${e.pdfFile}: no primary parse record to compare against`);
      continue;
    }
    const prior = log.filings[e.sourceUrl!];
    if (!recompare && prior && prior.pdfSha256 === e.pdfSha256 && prior.candidateSha256 === e.candidateSha256) {
      console.log(`  done ${e.slug} ${e.pdfFile}: already compared against this candidate`);
      continue;
    }
    const pages = await pageCount(pdfPath);
    const rows = record.transactions.length;
    // Rough: 1,500 input tokens per page image, 40 output tokens per row.
    estimate += (pages * 1500 * 10 + rows * 40 * 50) / 1_000_000;
    plan.push({ e, pdfPath, pages, rows });
  }
  console.log(`\n${plan.length} filings to read with ${SECOND_READ_MODEL}; rough estimate $${estimate.toFixed(2)}; ceiling $${stageOptions.ceilingUsd}\n`);
  for (const p of plan) console.log(`  ${p.e.slug.padEnd(22)} ${p.e.pdfFile!.padEnd(48)} ${String(p.pages).padStart(4)} pp ${String(p.rows).padStart(5)} rows  ${p.e.state}`);
  if (dryCost) return;

  for (const p of plan) {
    const e = p.e;
    const record = findParseRecord(p.pdfPath, { pdfSha256: e.pdfSha256!, sourceUrl: e.sourceUrl!, parserVersion: PARSER_VERSION, promptSha256: PROMPT_SHA256, model: DEFAULT_MODEL })!;
    process.stdout.write(`  ${e.slug} ${e.pdfFile} (${p.pages} pp, ${p.rows} rows) `);
    const { units } = await splitPdfIfNeeded(p.pdfPath);
    let entry;
    try {
      entry = await secondReadFiling({
        slug: e.slug, pdfPath: p.pdfPath, pdfSha256: e.pdfSha256!, sourceUrl: e.sourceUrl!, candidateSha256: e.candidateSha256!,
        primary: record.transactions as Parameters<typeof secondReadFiling>[0]["primary"],
        units, parserVersion: PARSER_VERSION, systemPrompt: SYSTEM_PROMPT, extractionPrompt: EXTRACTION_PROMPT,
        read: (unitPath) => parsePdf(unitPath, SECOND_READ_MODEL, { asImages: true }),
        onSpend: recordSpend,
        onProgress: () => process.stdout.write("."),
      });
    } catch (err) {
      if (err instanceof SpendCeilingError) throw err;
      if (err instanceof ParseTruncatedError) {
        console.log(`could not read: ${err.message}`);
        continue;
      }
      throw err;
    }
    recordSecondRead(entry, e.sourceUrl!);
    console.log(` agree ${entry.agreedIndexes.length} / differ ${entry.disputedIndexes.length} / unread ${entry.unreadIndexes.length} / extra ${entry.extraRows.length}  $${entry.costUsd.toFixed(2)}`);
  }
  console.log(`\nModel spend this run: $${spend.usd.toFixed(2)} over ${spend.calls} calls.`);
  const disputed = Object.values(readSecondReadLog()?.filings ?? {}).filter((f) => f.disputedIndexes.length || f.extraRows.length);
  if (disputed.length && plan.length) {
    await notify({
      type: "model_disagreement",
      headline: `Second-read lane: ${disputed.length} filings with rows for a person`,
      summary: disputed.map((f) => `${f.slug} ${f.pdfFile}: ${f.disputedIndexes.length} disputed, ${f.extraRows.length} extra, ${f.unreadIndexes.length} unread`).join("\n"),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
