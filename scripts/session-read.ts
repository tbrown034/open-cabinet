/**
 * A read made by a person, or by the Claude Code session looking at page
 * images itself, recorded as an independent read of one filing and
 * compared with the primary model's rows exactly as the second-read lane
 * compares its model.
 *
 *   npx tsx scripts/session-read.ts <slug> <pdf file> <rows.jsonl> [--reader <name>]
 *
 * rows.jsonl: one JSON object per line, in document order:
 *   {"rowNumber":12,"description":"NVIDIA CORP","type":"purchase","date":"2/10/2026","amount":"$1,000,001 - $5,000,000","late":"Yes"}
 * Types and amounts are normalized here to the dataset's enums; dates to
 * YYYY-MM-DD. The verdict goes to data/meta/session-read-log.json, same
 * shape as the second-read log, keyed by source URL, with the reader
 * named. lib/row-verification treats it as a second independent read.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { findParseRecord, promptHash, sha256File } from "../lib/parse-cache";
import { hashRows } from "../lib/crosscheck-log";
import { compareSecondRead, type SecondReadFiling } from "../lib/second-read";
import { EXTRACTION_PROMPT, SYSTEM_PROMPT, PARSER_VERSION, DEFAULT_MODEL } from "./parse-pdf.js";
import { AMOUNT_RANGE_KEYS } from "../lib/amounts";

export const SESSION_READ_LOG_PATH = path.resolve("data/meta/session-read-log.json");

interface RawRow {
  rowNumber: number;
  description: string;
  type: string;
  date: string;
  amount: string;
  late: string;
}

function normalizeType(t: string): string {
  const s = t.trim().toLowerCase();
  if (s.startsWith("purchase")) return "Purchase";
  if (s.startsWith("sale (partial)")) return "Sale (Partial)";
  if (s.startsWith("sale (full)")) return "Sale (Full)";
  if (s.startsWith("sale")) return "Sale";
  if (s.startsWith("exchange")) return "Exchange";
  return t.trim();
}

function normalizeAmount(a: string): string | null {
  const s = a.replace(/\s+/g, " ").trim();
  if (/not readily ascertainable/i.test(s) || s === "") return null;
  const m = s.match(/\$[\d,]+\s*-\s*\$[\d,]+/);
  const norm = m ? m[0].replace(/\s*-\s*/, "-") : s.replace(/^over\s+/i, "Over ");
  if (!(AMOUNT_RANGE_KEYS as readonly string[]).includes(norm)) throw new Error(`amount not a legal range: "${a}"`);
  return norm;
}

function normalizeDate(d: string): string {
  const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error(`date not M/D/YYYY: "${d}"`);
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function main() {
  const [slug, pdfFile, rowsFile] = process.argv.slice(2);
  const readerIdx = process.argv.indexOf("--reader");
  const reader = readerIdx > 0 ? process.argv[readerIdx + 1] : "claude-code-session";
  if (!slug || !pdfFile || !rowsFile) throw new Error("usage: session-read.ts <slug> <pdf file> <rows.jsonl> [--reader name]");
  const pdfPath = path.resolve("data/pdfs", pdfFile);
  const official = JSON.parse(readFileSync(path.resolve(`data/officials/${slug}.json`), "utf-8"));
  const filing = (official.sourceFilings as Array<{ url: string }>).find((f) => decodeURIComponent(f.url.split("/").pop() || "") === pdfFile);
  if (!filing) throw new Error(`no source filing named ${pdfFile} for ${slug}`);
  const pdfSha256 = sha256File(pdfPath);
  const record = findParseRecord(pdfPath, { pdfSha256, sourceUrl: filing.url, parserVersion: PARSER_VERSION, promptSha256: promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT), model: DEFAULT_MODEL });
  if (!record) throw new Error("no primary parse record for this filing");
  const raw: RawRow[] = readFileSync(rowsFile, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const rows = raw.map((r) => ({
    description: r.description.trim(),
    type: normalizeType(r.type),
    date: normalizeDate(r.date),
    amount: normalizeAmount(r.amount),
    lateFilingFlag: /^y/i.test(r.late.trim()),
    rowNumber: r.rowNumber,
  }));
  // Printed row continuity, the same check the deterministic lanes make.
  const nums = rows.map((r) => r.rowNumber);
  const gaps: number[] = [];
  for (let n = 1; n <= Math.max(...nums); n++) if (!nums.includes(n)) gaps.push(n);
  const cmp = compareSecondRead(record.transactions as Parameters<typeof compareSecondRead>[0], rows as unknown as Parameters<typeof compareSecondRead>[1]);
  const entry: SecondReadFiling & { reader: string; printedRowsRead: number; printedRowGaps: number[] } = {
    slug, pdfFile, pdfSha256, candidateSha256: hashRows(record.transactions), model: "gpt-6-astra", rowsPrimary: record.transactions.length, rowsSecond: rows.length,
    ...cmp, costUsd: 0, checkedAt: new Date().toISOString(), reader, printedRowsRead: rows.length, printedRowGaps: gaps,
  };
  const log = existsSync(SESSION_READ_LOG_PATH) ? JSON.parse(readFileSync(SESSION_READ_LOG_PATH, "utf-8")) : { version: 1, generatedAt: "", filings: {} };
  log.filings[filing.url] = entry;
  log.generatedAt = new Date().toISOString();
  writeFileSync(`${SESSION_READ_LOG_PATH}.tmp`, JSON.stringify(log, null, 2) + "\n");
  renameSync(`${SESSION_READ_LOG_PATH}.tmp`, SESSION_READ_LOG_PATH);
  console.log(`${reader} read ${rows.length} rows (printed rows ${Math.min(...nums)}..${Math.max(...nums)}, gaps ${gaps.length}); against primary ${record.transactions.length}: agree ${cmp.agreedIndexes.length}, differ ${cmp.disputedIndexes.length}, unread ${cmp.unreadIndexes.length}, extra ${cmp.extraRows.length}`);
  for (const d of cmp.differences.slice(0, 30)) console.log("  " + d);
}

main();
