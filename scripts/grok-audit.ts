/**
 * Run the audit lane (lib/grok-audit.ts) over published filings: a third
 * company's model looks at the page images and checks the rows the site
 * holds for those pages, the way a person would with the PDF open.
 *
 *   pnpm grok-audit --dry-cost                 list what would be audited
 *   pnpm grok-audit [--only <text>] [--slug <slug>] [--ceiling <usd>]
 *
 * Every filing with a parse record on disk is a candidate. Whole-file
 * reads are audited as one call with all pages; chunked reads are audited
 * chunk by chunk with the rows the model read from those pages, so the
 * auditor is never asked about rows that live on other pages. Responses
 * are cached beside the PDF; reruns are free until the rows or the pages
 * change. Nothing here edits an official file.
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import { readCrosscheckLog, hashRows } from "../lib/crosscheck-log";
import { findParseRecord, promptHash } from "../lib/parse-cache";
import { recordSpend, spend, stageOptions, SpendCeilingError } from "../lib/ingest-stages";
import { auditPages, foldAudit, pageCount, readGrokAuditLog, recordGrokAudit, GROK_AUDIT_MODEL, GROK_AUDIT_PROMPT_VERSION, type GrokAuditFiling, type Row } from "../lib/grok-audit";
import { EXTRACTION_PROMPT, SYSTEM_PROMPT, PARSER_VERSION, DEFAULT_MODEL } from "./parse-pdf.js";
import { notify } from "../lib/notify";

dotenv.config({ path: ".env.local" });

const PDF_DIR = path.resolve("data/pdfs");
const OFFICIALS_DIR = path.resolve("data/officials");
const PROMPT_SHA256 = promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT);

async function main() {
  const args = process.argv.slice(2);
  const dryCost = args.includes("--dry-cost");
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const slug = args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null;
  const excluded = new Set<string>();
  for (let i = 0; i < args.length; i++) if (args[i] === "--exclude" && args[i + 1]) excluded.add(args[++i]);
  stageOptions.ceilingUsd = args.includes("--ceiling") ? Number(args[args.indexOf("--ceiling") + 1]) : 25;

  const crosscheck = readCrosscheckLog();
  if (!crosscheck) throw new Error("no cross-check log; run pnpm crosscheck-sweep first");
  const previous = readGrokAuditLog();
  void readdirSync(OFFICIALS_DIR);

  const plan: Array<{ e: (typeof crosscheck.entries)[number]; pdfPath: string; pages: number; rows: number; units: Array<{ first: number; last: number; rows: Row[] }>; candidateSha256: string }> = [];
  let estimate = 0;
  for (const e of crosscheck.entries) {
    if (!e.sourceUrl || !e.pdfFile || !e.pdfSha256) continue;
    if (slug && e.slug !== slug) continue;
    if (excluded.has(e.slug)) continue;
    if (only && !e.pdfFile.includes(only) && !e.slug.includes(only)) continue;
    const pdfPath = path.join(PDF_DIR, e.pdfFile);
    if (!existsSync(pdfPath)) continue;
    const record = findParseRecord(pdfPath, { pdfSha256: e.pdfSha256, sourceUrl: e.sourceUrl, parserVersion: PARSER_VERSION, promptSha256: PROMPT_SHA256, model: DEFAULT_MODEL });
    if (!record) {
      console.log(`  skip ${e.slug} ${e.pdfFile}: no parse record on disk`);
      continue;
    }
    const candidateSha256 = hashRows(record.transactions);
    const prior = previous?.filings[e.sourceUrl];
    const priorComplete = prior && !prior.differences.some((d) => d.startsWith("audit incomplete"));
    if (priorComplete && prior.pdfSha256 === e.pdfSha256 && prior.candidateSha256 === candidateSha256 && prior.promptVersion === GROK_AUDIT_PROMPT_VERSION) continue;
    const pages = pageCount(pdfPath);
    const units = record.units
      ? record.units.map((u) => ({ first: u.first, last: u.last, rows: u.transactions as Row[] }))
      : [{ first: 1, last: pages, rows: record.transactions as Row[] }];
    const rows = record.transactions.length;
    // Rough: 1,100 input tokens per page image at 150 dpi, 45 per row shown, 12 output per row.
    estimate += (pages * 1100 * 2 + rows * 45 * 2 + rows * 12 * 6) / 1_000_000;
    plan.push({ e, pdfPath, pages, rows, units, candidateSha256 });
  }
  console.log(`\n${plan.length} filings to audit with ${GROK_AUDIT_MODEL}; rough estimate $${estimate.toFixed(2)}; ceiling $${stageOptions.ceilingUsd}\n`);
  if (dryCost) {
    for (const p of plan) console.log(`  ${p.e.slug.padEnd(22)} ${p.e.pdfFile!.padEnd(48)} ${String(p.pages).padStart(4)} pp ${String(p.rows).padStart(5)} rows ${String(p.units.length).padStart(3)} calls`);
    return;
  }

  for (const p of plan) {
    process.stdout.write(`  ${p.e.slug} ${p.e.pdfFile} (${p.pages} pp, ${p.rows} rows, ${p.units.length} calls) `);
    const chunks: Array<{ offset: number; rows: number; result: Awaited<ReturnType<typeof auditPages>> }> = [];
    let offset = 0;
    let cost = 0;
    let failed: string | null = null;
    try {
      for (const u of p.units) {
        const result = await auditPages({ pdfPath: p.pdfPath, pdfSha256: p.e.pdfSha256!, first: u.first, last: u.last, rows: u.rows });
        if (!result.cached) {
          await recordSpend(result.usage.estimatedCostUsd);
          cost += result.usage.estimatedCostUsd;
          process.stdout.write(".");
        }
        chunks.push({ offset, rows: u.rows.length, result });
        offset += u.rows.length;
      }
    } catch (err) {
      if (err instanceof SpendCeilingError) throw err;
      failed = (err as Error).message;
    }
    if (failed && chunks.length === 0) {
      console.log(` could not audit: ${failed}`);
      continue;
    }
    const folded = foldAudit(chunks);
    const entry: GrokAuditFiling = {
      slug: p.e.slug, pdfFile: p.e.pdfFile!, pdfSha256: p.e.pdfSha256!, candidateSha256: p.candidateSha256,
      model: GROK_AUDIT_MODEL, promptVersion: GROK_AUDIT_PROMPT_VERSION, rows: p.rows,
      ...folded,
      ...(failed ? { differences: [`audit incomplete: ${failed}`, ...folded.differences] } : {}),
      pagesAudited: chunks.reduce((n, c) => n + 1, 0) === p.units.length ? p.pages : chunks.length,
      costUsd: Math.round(cost * 10000) / 10000,
      checkedAt: new Date().toISOString(),
    };
    recordGrokAudit(entry, p.e.sourceUrl!);
    console.log(` confirmed ${entry.confirmedIndexes.length} / disputed ${entry.disputedIndexes.length} / not found ${entry.notFoundIndexes.length} / missing on page ${entry.missing.length}  $${cost.toFixed(2)}`);
  }
  console.log(`\nModel spend this run: $${spend.usd.toFixed(2)} over ${spend.calls} calls.`);
  const flagged = Object.values(readGrokAuditLog()?.filings ?? {}).filter((f) => f.disputedIndexes.length || f.missing.length || f.notFoundIndexes.length);
  if (flagged.length && plan.length) {
    await notify({
      type: "model_disagreement",
      headline: `Audit lane: ${flagged.length} filings with rows for a person`,
      summary: flagged.map((f) => `${f.slug} ${f.pdfFile}: ${f.disputedIndexes.length} disputed, ${f.notFoundIndexes.length} not found, ${f.missing.length} on the page but not in the data`).join("\n"),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
