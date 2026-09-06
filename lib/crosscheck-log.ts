/**
 * A written record of what the deterministic lane checked, per filing.
 *
 * Before this log existed the cross-check's verdict was a console line
 * that scrolled away. The site said "all data is validated" while the
 * lane had compared about a sixth of the published rows, because most of
 * the corpus is image scans it cannot read. This file makes the verdict a
 * fact the methodology page renders from data, not from a sentence.
 *
 * One entry per published source filing, keyed by its OGE URL. States are
 * distinct on purpose: "no usable text" is not "wrong", and "tool could
 * not read this layout" is not "scan". Human review is tracked elsewhere
 * (Gate 2); this log records only what the machine did.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";

export const CROSSCHECK_LOG_PATH = path.resolve("data/meta/crosscheck-log.json");

export type CrosscheckState =
  /** Text lane ran and every checked field agreed with the parse, row for row. */
  | "checked_tuple_agreement"
  /** Text lane ran and at least one checked field or the row count disagreed. Needs a person. */
  | "checked_tuple_mismatch"
  /** OCR lane ran on the page images and every checked field agreed, row for row. */
  | "ocr_tuple_agreement"
  /** OCR lane ran and at least one checked field or the row count disagreed. Needs a person; OCR errs more than a text layer. */
  | "ocr_tuple_mismatch"
  /** No text layer to read. A scan. Not compared. */
  | "no_usable_text"
  /** A text layer exists and looks like a table, but the column parser cannot read this layout. */
  | "unsupported_layout"
  /** A form variant the parser does not handle (278-TERM). */
  | "unsupported_form"
  /** pdftotext failed to run. */
  | "tool_unavailable"
  /** The PDF is not on disk. */
  | "missing_local_document"
  /** The filing entry has no URL. */
  | "missing_source"
  /** No parse record to compare against. */
  | "not_checked";

/** The fields the text lane compares. Description and ticker are not among them. */
export const COMPARED_FIELDS = [
  "type",
  "date",
  "amount",
  "lateFilingFlag",
  "rowCount",
  "printedRowContinuity",
] as const;

export interface CrosscheckEntry {
  sourceUrl: string | null;
  slug: string;
  filingDate: string;
  pdfFile: string | null;
  pdfSha256: string | null;
  /** SHA-256 of the parsed rows the lane compared against. */
  candidateSha256: string | null;
  checkerVersion: string;
  state: CrosscheckState;
  comparedFields: readonly string[];
  /** Rows the text lane extracted, when it ran. */
  rowsCompared: number | null;
  /** Rows in the published dataset stamped to this URL. */
  publishedRows: number;
  problems?: string[];
  /** Which parse record the lane compared against: a current keyed cache,
   * current chunk caches, or the legacy path-keyed cache. */
  parseRecord?: "current" | "current-chunks" | "legacy" | "legacy-chunks";
  /** Which lane produced the verdict. Absent means the text lane. */
  lane?: "text" | "ocr";
  /** How the OCR lane read the pages, when it ran. */
  ocr?: {
    engine: "tesseract";
    version: string;
    dpi: number;
    psm: number;
    laneVersion: string;
    pages: number;
    textFile: string;
    textSha256: string;
    /** What the text lane had said before OCR ran. */
    textLaneState: CrosscheckState;
    /** Rows the OCR lane read, and printed row numbers repaired by sequence. */
    rowsRead?: number;
    rowNumbersRepaired?: number;
    /** Advisory: OCR rows paired with parsed rows by printed row number.
     * Filled only on a mismatch. Not a state; a person reads it. */
    aligned?: { compared: number; agree: number; differ: number; unread: number; differences: string[] };
    /** OCR ran but its output could not be parsed or compared. */
    problem?: string;
  };
  checkedAt: string;
}

export interface CrosscheckLog {
  version: 1;
  checkerVersion: string;
  generatedAt: string;
  entries: CrosscheckEntry[];
}

export function hashRows(rows: unknown): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function readCrosscheckLog(file = CROSSCHECK_LOG_PATH): CrosscheckLog | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as CrosscheckLog;
  } catch {
    return null;
  }
}

/** Atomic replacement: write beside, then rename. A crash never leaves half a log. */
export function writeCrosscheckLog(log: CrosscheckLog, file = CROSSCHECK_LOG_PATH): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(log, null, 2) + "\n");
  renameSync(tmp, file);
}

/** Insert or replace the entry for one source URL. */
export function upsertCrosscheckEntry(
  log: CrosscheckLog | null,
  entry: CrosscheckEntry,
  checkerVersion: string
): CrosscheckLog {
  const base: CrosscheckLog = log ?? {
    version: 1,
    checkerVersion,
    generatedAt: new Date().toISOString(),
    entries: [],
  };
  const entries = base.entries.filter((e) => e.sourceUrl !== entry.sourceUrl || e.slug !== entry.slug);
  entries.push(entry);
  entries.sort((a, b) => a.slug.localeCompare(b.slug) || b.filingDate.localeCompare(a.filingDate));
  return { ...base, checkerVersion, generatedAt: new Date().toISOString(), entries };
}

export interface CrosscheckSummary {
  filings: Record<CrosscheckState, number>;
  rows: Record<CrosscheckState, number>;
  totalFilings: number;
  totalRows: number;
  /** Rows with no stamped source URL; they belong to no filing entry. */
  unstampedRows: number;
}

const STATES: CrosscheckState[] = [
  "checked_tuple_agreement",
  "checked_tuple_mismatch",
  "ocr_tuple_agreement",
  "ocr_tuple_mismatch",
  "no_usable_text",
  "unsupported_layout",
  "unsupported_form",
  "tool_unavailable",
  "missing_local_document",
  "missing_source",
  "not_checked",
];

/**
 * Counts by state, for filings and for published rows. Rows are attributed
 * to a filing by their stamped sourceUrl; unstamped rows are counted apart.
 */
export function summarizeCrosscheckLog(
  log: CrosscheckLog,
  rows: Array<{ sourceUrl?: string | null }>
): CrosscheckSummary {
  const zero = () => Object.fromEntries(STATES.map((s) => [s, 0])) as Record<CrosscheckState, number>;
  const filings = zero();
  const rowCounts = zero();
  const stateByUrl = new Map<string, CrosscheckState>();
  for (const e of log.entries) {
    filings[e.state] += 1;
    if (e.sourceUrl) stateByUrl.set(e.sourceUrl, e.state);
  }
  let unstampedRows = 0;
  for (const r of rows) {
    if (!r.sourceUrl) {
      unstampedRows += 1;
      continue;
    }
    const state = stateByUrl.get(r.sourceUrl) ?? "not_checked";
    rowCounts[state] += 1;
  }
  return {
    filings,
    rows: rowCounts,
    totalFilings: log.entries.length,
    totalRows: rows.length,
    unstampedRows,
  };
}
