/**
 * Seed or refresh data/meta/crosscheck-log.json for every published filing.
 *
 * For each entry in every official's sourceFilings: find the PDF on disk,
 * run the text-layer extractor, and, when a parse record exists, run the
 * positional comparison against it. Record a distinct state per filing.
 * Never parses with a model, never pays, never edits an official file.
 *
 * The parse record is the legacy cache (<pdf>.parsed.json) when no
 * current-key cache exists. That is the record of what the model said, in
 * document order, which the positional comparator needs. Published rows
 * are sorted by date and cannot be paired with PDF order.
 *
 * Usage: npx tsx scripts/crosscheck-sweep.ts            (pnpm crosscheck-sweep)
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import {
  CHECKER_VERSION,
  crossCheckParsedFiling,
  extractTextLayerRows,
} from "./text-layer-crosscheck";
import {
  COMPARED_FIELDS,
  hashRows,
  summarizeCrosscheckLog,
  upsertCrosscheckEntry,
  writeCrosscheckLog,
  type CrosscheckEntry,
  type CrosscheckLog,
  type CrosscheckState,
} from "../lib/crosscheck-log";
import { findParseRecord, isTerminationForm, promptHash, sha256File } from "../lib/parse-cache";
import { EXTRACTION_PROMPT, SYSTEM_PROMPT, PARSER_VERSION, DEFAULT_MODEL } from "./parse-pdf.js";

const PDF_DIR = path.resolve("data/pdfs");
const OFFICIALS_DIR = path.resolve("data/officials");

function pdfFilenameFromUrl(url: string): string {
  return decodeURIComponent(url.split("/").pop() || "filing.pdf");
}

function stateFromExtractionError(message: string, pdfFile: string): CrosscheckState {
  if (isTerminationForm(pdfFile) || /unsupported form/i.test(message)) return "unsupported_form";
  if (/pdftotext failed/i.test(message)) return "tool_unavailable";
  return "unsupported_layout";
}

const PROMPT_SHA256 = promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT);

function main() {
  let log: CrosscheckLog | null = null;
  const allRows: Array<{ sourceUrl?: string | null }> = [];
  const now = new Date().toISOString();

  for (const file of readdirSync(OFFICIALS_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const official = JSON.parse(readFileSync(path.join(OFFICIALS_DIR, file), "utf-8"));
    const txs: Array<{ sourceUrl?: string | null }> = official.transactions ?? [];
    allRows.push(...txs);
    for (const filing of official.sourceFilings ?? []) {
      const filingDate = String(filing.date ?? "").slice(0, 10);
      const publishedRows = filing.url ? txs.filter((t) => t.sourceUrl === filing.url).length : 0;
      const base = {
        sourceUrl: filing.url ?? null,
        slug: official.slug,
        filingDate,
        checkerVersion: CHECKER_VERSION,
        comparedFields: COMPARED_FIELDS,
        publishedRows,
        checkedAt: now,
      };
      let entry: CrosscheckEntry;
      if (!filing.url) {
        entry = { ...base, pdfFile: null, pdfSha256: null, candidateSha256: null, state: "missing_source", rowsCompared: null };
      } else {
        const pdfFile = pdfFilenameFromUrl(filing.url);
        const pdfPath = path.join(PDF_DIR, pdfFile);
        if (!existsSync(pdfPath)) {
          entry = { ...base, pdfFile, pdfSha256: null, candidateSha256: null, state: "missing_local_document", rowsCompared: null };
        } else if (isTerminationForm(pdfFile)) {
          // Decide the form before extraction so a scanned termination
          // report is not recorded as a scan of a form we do read.
          entry = {
            ...base, pdfFile, pdfSha256: sha256File(pdfPath), candidateSha256: null,
            state: "unsupported_form", rowsCompared: null,
            problems: ["278-TERM termination report; the column parser reads 278-T only"],
          };
        } else {
          const pdfSha256 = sha256File(pdfPath);
          const extraction = extractTextLayerRows(pdfPath);
          if (extraction.kind === "no-text") {
            entry = { ...base, pdfFile, pdfSha256, candidateSha256: null, state: "no_usable_text", rowsCompared: null };
          } else if (extraction.kind === "tool-error") {
            entry = {
              ...base, pdfFile, pdfSha256, candidateSha256: null,
              state: stateFromExtractionError(extraction.message, pdfFile),
              rowsCompared: null, problems: [extraction.message],
            };
          } else {
            const record = findParseRecord(pdfPath, {
              pdfSha256,
              sourceUrl: filing.url,
              parserVersion: PARSER_VERSION,
              promptSha256: PROMPT_SHA256,
              model: DEFAULT_MODEL,
            });
            if (!record) {
              entry = { ...base, pdfFile, pdfSha256, candidateSha256: null, state: "not_checked", rowsCompared: extraction.rows.length, problems: ["no parse record on disk"] };
            } else {
              const rows = record.transactions as Parameters<typeof crossCheckParsedFiling>[1];
              const result = crossCheckParsedFiling(pdfPath, rows);
              entry = {
                ...base, pdfFile, pdfSha256, candidateSha256: hashRows(rows),
                state: result.status === "ok" ? "checked_tuple_agreement" : "checked_tuple_mismatch",
                rowsCompared: extraction.rows.length,
                ...(result.status === "mismatch" ? { problems: result.problems } : {}),
                ...(result.status === "error" ? { problems: [result.message] } : {}),
                parseRecord: record.source,
              };
              if (result.status === "error") entry.state = stateFromExtractionError(result.message, pdfFile);
              if (result.status === "scan") entry.state = "no_usable_text";
            }
          }
        }
      }
      log = upsertCrosscheckEntry(log, entry, CHECKER_VERSION);
    }
  }

  if (!log) throw new Error("no filings found");
  writeCrosscheckLog(log);
  const s = summarizeCrosscheckLog(log, allRows);
  console.log(`\nCross-check sweep, checker ${CHECKER_VERSION}\n`);
  console.log(`  filing entries: ${s.totalFilings}   published rows: ${s.totalRows}   unstamped rows: ${s.unstampedRows}\n`);
  for (const state of Object.keys(s.filings) as CrosscheckState[]) {
    if (!s.filings[state] && !s.rows[state]) continue;
    console.log(`  ${state.padEnd(26)} filings ${String(s.filings[state]).padStart(4)}   rows ${String(s.rows[state]).padStart(6)}`);
  }
  const mism = log.entries.filter((e) => e.state === "checked_tuple_mismatch");
  if (mism.length) {
    console.log(`\n  mismatches to adjudicate by hand:`);
    for (const e of mism) console.log(`    ${e.slug}  ${e.pdfFile}  (${e.problems?.length ?? 0} problems)`);
  }
  console.log(`\nWrote data/meta/crosscheck-log.json`);
}

main();
