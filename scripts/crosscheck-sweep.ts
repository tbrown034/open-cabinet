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
 *        --ocr            also run the OCR lane (lib/ocr-lane.ts) on every
 *                         filing the text lane cannot read: scans and the
 *                         garbage-text-layer scans. Slow the first time
 *                         (minutes per hundred pages); OCR text is cached
 *                         under data/ocr/ and reruns are free.
 *        --only <text>    restrict the OCR lane to filings whose file name
 *                         or slug contains the text. The text lane still
 *                         runs over everything so the log stays whole.
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
import { crossCheckByOcr, ocrEngine } from "../lib/ocr-lane";
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

const args = process.argv.slice(2);
const OCR = args.includes("--ocr");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

/** The text lane could not read this filing; the OCR lane may. */
function ocrCandidate(state: CrosscheckState): boolean {
  return state === "no_usable_text" || state === "unsupported_layout";
}

function main() {
  if (OCR) {
    const engine = ocrEngine();
    if (!engine.available) {
      console.error(engine.reason);
      process.exit(2);
    }
    console.log(`OCR lane on: tesseract ${engine.version}${ONLY ? `, only "${ONLY}"` : ""}\n`);
  }
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
          const record = findParseRecord(pdfPath, {
            pdfSha256,
            sourceUrl: filing.url,
            parserVersion: PARSER_VERSION,
            promptSha256: PROMPT_SHA256,
            model: DEFAULT_MODEL,
          });
          const rows = record ? (record.transactions as Parameters<typeof crossCheckParsedFiling>[1]) : null;
          if (extraction.kind === "no-text") {
            entry = { ...base, pdfFile, pdfSha256, candidateSha256: rows ? hashRows(rows) : null, state: "no_usable_text", rowsCompared: null };
          } else if (extraction.kind === "tool-error") {
            entry = {
              ...base, pdfFile, pdfSha256, candidateSha256: rows ? hashRows(rows) : null,
              state: stateFromExtractionError(extraction.message, pdfFile),
              rowsCompared: null, problems: [extraction.message],
            };
          } else if (!rows) {
            entry = { ...base, pdfFile, pdfSha256, candidateSha256: null, state: "not_checked", rowsCompared: extraction.rows.length, problems: ["no parse record on disk"] };
          } else {
            const result = crossCheckParsedFiling(pdfPath, rows);
            entry = {
              ...base, pdfFile, pdfSha256, candidateSha256: hashRows(rows),
              state: result.status === "ok" ? "checked_tuple_agreement" : "checked_tuple_mismatch",
              rowsCompared: extraction.rows.length,
              ...(result.status === "mismatch" ? { problems: result.problems } : {}),
              ...(result.status === "error" ? { problems: [result.message] } : {}),
              parseRecord: record!.source,
            };
            if (result.status === "error") entry.state = stateFromExtractionError(result.message, pdfFile);
            if (result.status === "scan") entry.state = "no_usable_text";
          }
          if (record) entry.parseRecord = record.source;

          // The OCR lane, where the text lane could not read the filing.
          const wanted = !ONLY || pdfFile.includes(ONLY) || official.slug.includes(ONLY);
          if (OCR && wanted && rows && ocrCandidate(entry.state)) {
            const textLaneState = entry.state;
            process.stdout.write(`  ocr ${official.slug} ${pdfFile} `);
            const started = Date.now();
            const ocr = crossCheckByOcr(pdfPath, pdfSha256, rows, {
              // One dot per ten pages so a long filing shows it is moving.
              log: (line) => {
                const m = line.match(/page (\d+)\/(\d+)$/);
                if (m && (Number(m[1]) % 10 === 0 || m[1] === m[2])) process.stdout.write(".");
              },
            });
            if (ocr.ran) {
              const seconds = Math.round((Date.now() - started) / 1000);
              const base = { engine: ocr.run.engine, version: ocr.run.version, dpi: ocr.run.dpi, psm: ocr.run.psm, laneVersion: ocr.run.laneVersion, pages: ocr.run.pages, textFile: ocr.run.textFile, textSha256: ocr.run.textSha256, textLaneState };
              if (ocr.result.status === "ok") {
                entry = { ...entry, state: "ocr_tuple_agreement", lane: "ocr", rowsCompared: ocr.result.rowCount, ocr: base };
                delete entry.problems;
                console.log(`agree on ${ocr.result.rowCount} rows (${ocr.run.pages} pages, ${ocr.run.cached ? "cached" : `${seconds}s`})`);
              } else if (ocr.result.status === "mismatch") {
                const rowsRead = ocr.extraction.kind === "rows" ? ocr.extraction.rows.length : null;
                entry = { ...entry, state: "ocr_tuple_mismatch", lane: "ocr", rowsCompared: rowsRead, problems: ocr.result.problems, ocr: base };
                console.log(`mismatch, ${ocr.result.problems.length} problems (${ocr.run.pages} pages, ${ocr.run.cached ? "cached" : `${seconds}s`})`);
              } else {
                const problem = ocr.result.status === "error" ? ocr.result.message : "ocr: no rows";
                entry = { ...entry, ocr: { ...base, problem } };
                console.log(`could not compare: ${problem}`);
              }
            } else {
              console.log(ocr.reason);
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
