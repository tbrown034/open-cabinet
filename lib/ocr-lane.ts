/**
 * The OCR lane: a second deterministic read of a scanned filing.
 *
 * Nine of the published filings are image scans, and ten more (all of
 * President Trump's) carry an embedded text layer that is garbage OCR from
 * whoever scanned them: pdftotext returns characters, the column parser
 * finds no rows, and the filing is recorded as unsupported_layout. Together
 * those nineteen filings hold about 8,900 of the 11,500 published rows, so
 * the text lane has never compared most of the dataset.
 *
 * This lane ignores the embedded text entirely. It renders each page to an
 * image with pdftoppm (which draws the scan, not the hidden text), runs our
 * own OCR on the image with tesseract, and hands the result to the same
 * column parser and the same positional comparator the text lane uses
 * (parseTextLayer and compareExtraction in scripts/text-layer-crosscheck.ts).
 * The two lanes differ only in how characters were read.
 *
 * OCR is noisier than a real text layer. An OCR disagreement is recorded
 * as ocr_tuple_mismatch and goes to a person, never straight to "the model
 * was wrong". The raw OCR text is kept under data/ocr/ so the person can
 * see what the lane read.
 *
 * No model, no network. tesseract and pdftoppm run locally.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  compareExtraction,
  parseTextLayer,
  UNKNOWN_AMOUNT_TOKEN,
  type CrossCheckResult,
  type CrossCheckRow,
  type Extraction,
} from "../scripts/text-layer-crosscheck";

/** Bump when rendering or OCR settings change. Part of the cache key. */
export const OCR_LANE_VERSION = "2026-09-05.2";
/** The scans are 150 to 200 ppi; rendering at 400 upsamples them, which
 * on Trump's Aug 2026 filing took a page from 26 complete rows to 31 of
 * 33. 600 was worse. */
export const OCR_DPI = 400;
/** tesseract page segmentation 4: a single column of text of variable
 * sizes. On these gridded tables it keeps each printed row on one line
 * with single spaces between the columns; mode 6 breaks on the gridlines.
 * Column gaps are rebuilt afterwards by columnizeOcrRows(). */
export const OCR_PSM = 4;

export const OCR_DIR = path.resolve("data/ocr");
export const INSTALL_HINT = "tesseract is not installed. Install it with: brew install tesseract";

export type OcrEngine =
  | { available: true; name: "tesseract"; version: string }
  | { available: false; reason: string };

let engineCache: OcrEngine | null = null;

export function ocrEngine(): OcrEngine {
  if (engineCache) return engineCache;
  try {
    const out = execFileSync("tesseract", ["--version"], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    const m = out.match(/tesseract\s+v?([\d.]+)/i);
    engineCache = { available: true, name: "tesseract", version: m ? m[1] : "unknown" };
  } catch {
    engineCache = { available: false, reason: INSTALL_HINT };
  }
  return engineCache;
}

export interface OcrRun {
  engine: "tesseract";
  version: string;
  dpi: number;
  psm: number;
  laneVersion: string;
  pages: number;
  /** Where the raw OCR text was written. */
  textFile: string;
  /** SHA-256 of the OCR text. */
  textSha256: string;
  /** Read from cache rather than run this time. */
  cached: boolean;
}
function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function cacheFileFor(pdfPath: string, pdfSha256: string, version: string): string {
  const base = path.basename(pdfPath, path.extname(pdfPath));
  const key = sha256(`${pdfSha256}|${version}|${OCR_DPI}|${OCR_PSM}|${OCR_LANE_VERSION}`).slice(0, 12);
  return path.join(OCR_DIR, `${base}.${key}.ocr.txt`);
}

/**
 * OCR every page of the PDF. Pages are joined with a form feed, the same
 * separator pdftotext uses, so page location works the same in both lanes.
 * Cached by PDF hash, engine version, DPI, segmentation mode and lane
 * version; a rerun on an unchanged filing reads the file.
 */
export function ocrPdfToText(
  pdfPath: string,
  pdfSha256: string,
  options: { log?: (line: string) => void } = {}
): { text: string; run: OcrRun } {
  const engine = ocrEngine();
  if (!engine.available) throw new Error(engine.reason);
  const cacheFile = cacheFileFor(pdfPath, pdfSha256, engine.version);
  if (existsSync(cacheFile)) {
    const text = readFileSync(cacheFile, "utf-8");
    return {
      text,
      run: {
        engine: "tesseract", version: engine.version, dpi: OCR_DPI, psm: OCR_PSM, laneVersion: OCR_LANE_VERSION,
        pages: text.split("\f").length, textFile: path.relative(process.cwd(), cacheFile), textSha256: sha256(text), cached: true,
      },
    };
  }

  const work = mkdtempSync(path.join(tmpdir(), "oc-ocr-"));
  try {
    // -gray: the forms are black on white; color adds nothing and triples
    // the pixels. -r 300: tesseract's documented sweet spot for 10-point
    // print. Output: page-001.png, page-002.png, ...
    execFileSync("pdftoppm", ["-r", String(OCR_DPI), "-gray", "-png", pdfPath, path.join(work, "page")], {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 10 * 60_000,
    });
    const pages = readdirSync(work).filter((f) => f.endsWith(".png")).sort();
    const texts: string[] = [];
    for (const [i, png] of pages.entries()) {
      options.log?.(`ocr page ${i + 1}/${pages.length}`);
      const out = execFileSync(
        "tesseract",
        [path.join(work, png), "-", "--psm", String(OCR_PSM)],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 5 * 60_000, maxBuffer: 64 * 1024 * 1024 }
      );
      texts.push(out);
    }
    const text = texts.join("\f");
    mkdirSync(OCR_DIR, { recursive: true });
    writeFileSync(cacheFile, text);
    return {
      text,
      run: {
        engine: "tesseract", version: engine.version, dpi: OCR_DPI, psm: OCR_PSM, laneVersion: OCR_LANE_VERSION,
        pages: pages.length, textFile: path.relative(process.cwd(), cacheFile), textSha256: sha256(text), cached: false,
      },
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * OCR output has systematic defects a real text layer never has. These
 * repairs are narrow, apply only inside the tokens the column parser reads
 * (row numbers, dates, dollar ranges, type words, Yes/No), and are tested
 * on strings. They never touch description text.
 */
export function repairOcrText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let l = line;
      // Table gridlines come through as | [ ] { } and runs of underscores.
      l = l.replace(/[|\[\]{}]/g, " ").replace(/\s_{2,}\s/g, " ");
      // Dollar amounts: "$1,001 - $15,000" with O/o for 0, l/I for 1, S for $.
      l = l.replace(/(?<=^|\s)S(?=\d[\d,]*\b)/g, "$");
      l = l.replace(/\$[\dOoIl,]+/g, (m) => m.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
      // Dates: MM/DD/YYYY with the same substitutions.
      l = l.replace(/\b[\dOoIl]{1,2}\/[\dOoIl]{1,2}\/[\dOoIl]{4}\b/g, (m) => m.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
      // A leading row number read with O, S, l or I for a digit.
      l = l.replace(/^(\s{0,4})([\dOSlI]{1,4})(?=[.,]?\s)/, (_m, sp: string, n: string) =>
        sp + n.replace(/O/g, "0").replace(/S/g, "5").replace(/[lI]/g, "1")
      );
      // Hand-typed forms (Trump's) print "6/15/2026" and "purchase". The
      // e-filed form prints "06/15/2026" and "Purchase", which is what the
      // parser reads. Pad the date; fix the low-resolution misreads of the
      // type and notification words ("purchaso", "Yos"); capitalize a type
      // word only when it sits before a date, never one inside a description.
      l = l.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_m, mm: string, dd: string, yy: string) => `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${yy}`);
      l = l.replace(/\b(purch[aeo]s[aeo]|purchase)(?=\s+\d{2}\/\d{2}\/\d{4})/gi, "Purchase");
      l = l.replace(/\b(sale|sole|salo)(?=\s+\d{2}\/\d{2}\/\d{4})/gi, "Sale");
      l = l.replace(/\b(exchange)(?=\s+\d{2}\/\d{2}\/\d{4})/gi, "Exchange");
      l = l.replace(/(?<=\d{4}\s+)y[eo]s\b/gi, "Yes");
      l = l.replace(/(?<=\d{4}\s+)n[o0]\b/gi, "No");
      return l;
    })
    .join("\n");
}

/** A printed row as segmentation mode 4 emits it: single spaces between columns. */
const OCR_ROW =
  /^\s{0,4}(\d{1,4})[.,]?\s+(.*?)\s+(Purchase|Sale \(Partial\)|Sale \(Full\)|Sale|Exchange)\s+(\d{2}\/\d{2}\/\d{4})\s+(Yes|No)\s+(.*)$/;

/**
 * Rebuild the column gaps the shared parser keys on. A line that reads as
 * a complete printed row becomes its own block: a blank line, then the row
 * number, description, type, date, notification and amount separated by
 * runs of spaces. Any other line is indented as a continuation of the row
 * above it, so a wrapped description or a wrapped amount still attaches
 * to its row, exactly as pdftotext -layout output does.
 */
export function columnizeOcrRows(text: string): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const m = raw.match(OCR_ROW);
    if (m) {
      const [, num, desc, type, date, yn, amount] = m;
      out.push("");
      out.push(` ${num}${" ".repeat(Math.max(2, 10 - num.length))}${desc}      ${type}      ${date}      ${yn}      ${amount}`);
    } else if (/^\s{0,4}\d{1,4}[.,]?\s+\S/.test(raw)) {
      // Numbered but not a transaction: an account header or "Line is
      // intentionally left blank". Its own block, so the parser can count
      // it as a placeholder toward row continuity.
      out.push("");
      out.push(raw.replace(/^\s{0,4}(\d{1,4})[.,]?\s+/, (_m, num: string) => ` ${num}${" ".repeat(Math.max(2, 10 - num.length))}`));
    } else if (raw.trim() === "") {
      out.push("");
    } else {
      out.push(`           ${raw.trim()}`);
    }
  }
  return out.join("\n");
}

/**
 * A printed row number the OCR misread while its neighbors read cleanly.
 * On Trump's Aug 2026 filing the gridline under a row number comes through
 * as a leading "1" (297, 1298, 299) and an 8 as a 3 (848, 349, 850). The
 * rule is narrow: a row whose number is out of sequence is repaired to
 * previous+1 only when the row after it reads previous+2, so the misread
 * is sandwiched between two rows that agree on where it sits. A dropped
 * row stays a gap, and the comparator reports it. Repairs are counted.
 */
export function repairRowSequence(rows: CrossCheckRow[]): { rows: CrossCheckRow[]; repaired: number; repairedRowNumbers: number[] } {
  const out = rows.map((r) => ({ ...r }));
  let repaired = 0;
  const repairedRowNumbers: number[] = [];
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1].rowNumber;
    const n = out[i].rowNumber;
    if (n === prev + 1) continue;
    const next = out[i + 1]?.rowNumber;
    if (next === prev + 2) {
      out[i].rowNumber = prev + 1;
      repaired += 1;
      repairedRowNumbers.push(prev + 1);
    } else if (n === prev + 1 + 1000 && n >= 1000) {
      // The gridline under the row number read as a leading "1": 284 came
      // through as 1284. An exact offset of 1000 from the expected number
      // is that artifact and nothing else.
      out[i].rowNumber = prev + 1;
      repaired += 1;
      repairedRowNumbers.push(prev + 1);
    }
  }
  return { rows: out, repaired, repairedRowNumbers };
}

/**
 * A repaired row number is a guess about where a row sits, and a guess
 * must never become evidence. (Review, Sep 6: OCR numbers [1, 3, 3] were
 * repaired to [1, 2, 3], which then agreed with a candidate that had a
 * different second row.) So a filing with any repaired number is never
 * "ok" as a whole, and a repaired row is never in the agreed list; it
 * is reported apart, and its row stays a single read.
 */
export function withholdRepairs(result: CrossCheckResult, repairedRowNumbers: number[]): CrossCheckResult {
  if (repairedRowNumbers.length === 0) return result;
  const note = `${repairedRowNumbers.length} printed row number(s) repaired by sequence (${repairedRowNumbers.slice(0, 20).join(", ")}${repairedRowNumbers.length > 20 ? " ..." : ""}); repaired rows are not counted as agreement`;
  if (result.status === "ok") return { status: "mismatch", problems: [note] };
  if (result.status === "mismatch") return { status: "mismatch", problems: [note, ...result.problems] };
  return result;
}

/** Extract comparison rows from the OCR text, through the shared parser. */
export function extractOcrRows(text: string): Extraction & { rowNumbersRepaired?: number; repairedRowNumbers?: number[] } {
  const extraction = parseTextLayer(columnizeOcrRows(repairOcrText(text)));
  if (extraction.kind === "no-text") {
    // The image was OCRed and still no rows came out: not a scan we could
    // not see, a scan the parser could not read. Say that.
    return { kind: "tool-error", message: "ocr: no transaction rows could be parsed from the OCR text" };
  }
  if (extraction.kind === "rows") {
    const { rows, repaired, repairedRowNumbers } = repairRowSequence(extraction.rows);
    return { ...extraction, rows, rowNumbersRepaired: repaired, repairedRowNumbers };
  }
  return extraction;
}

export interface AlignedComparison {
  /** OCR rows whose printed number maps to a parsed row. */
  compared: number;
  agree: number;
  differ: number;
  /** Printed rows the OCR lane did not read at all. */
  unread: number;
  differences: string[];
  /** Printed row numbers whose tuple agreed, and whose tuple differed, so
   * a per-row verification state can be derived without re-running OCR. */
  agreedPrintedRows: number[];
  disputedPrintedRows: number[];
  /** Rows whose printed number was repaired by sequence. Never agreement. */
  repairedPrintedRows: number[];
  /** Placeholder rows the form numbers but the model omits; needed to map
   * a parsed index back to a printed row. */
  placeholderRows: number[];
}

/**
 * Advisory, never a state. When the OCR lane read fewer rows than the
 * model, the positional comparison stops at the row count, which says
 * nothing about the rows it did read. This pairs each OCR row with the
 * parsed row at the same printed position (parsed rows are in document
 * order; placeholder rows the form numbers but the model omits are
 * skipped) and counts agreement on the same tuple. A person reads the
 * differences; the state stays ocr_tuple_mismatch.
 */
export function alignByPrintedRow(
  extraction: Extraction & { repairedRowNumbers?: number[] },
  parsed: Array<{ type: string; date: string; amount: string | null; lateFilingFlag?: boolean }>
): AlignedComparison | null {
  if (extraction.kind !== "rows") return null;
  const repairedSet = new Set(extraction.repairedRowNumbers ?? []);
  const repairedPrintedRows: number[] = [];
  const placeholders = new Set(extraction.placeholderRows);
  // printed row number -> index into parsed, skipping placeholders
  const maxPrinted = Math.max(...extraction.rows.map((r) => r.rowNumber), ...extraction.placeholderRows, 0);
  const indexOfPrinted = new Map<number, number>();
  let idx = 0;
  for (let n = 1; n <= maxPrinted; n++) {
    if (placeholders.has(n)) continue;
    indexOfPrinted.set(n, idx++);
  }
  const tuple = (r: { type: string; date: string; amount: string | null; lateFilingFlag?: boolean | null }) => {
    const t = /^sale/i.test(r.type) ? "Sale" : /^purchase/i.test(r.type) ? "Purchase" : /^exchange/i.test(r.type) ? "Exchange" : r.type;
    const late = r.lateFilingFlag === null ? "unreadable" : r.lateFilingFlag ? "late" : "ontime";
    return `${t}|${r.date}|${r.amount ?? UNKNOWN_AMOUNT_TOKEN}|${late}`;
  };
  let compared = 0, agree = 0;
  const differences: string[] = [];
  const agreedPrintedRows: number[] = [];
  const disputedPrintedRows: number[] = [];
  const seen = new Set<number>();
  for (const r of extraction.rows) {
    const i = indexOfPrinted.get(r.rowNumber);
    if (i === undefined || i >= parsed.length || seen.has(r.rowNumber)) continue;
    seen.add(r.rowNumber);
    if (repairedSet.has(r.rowNumber)) {
      repairedPrintedRows.push(r.rowNumber);
      continue;
    }
    compared += 1;
    const want = tuple(r);
    const got = tuple(parsed[i]);
    if (want === got) {
      agree += 1;
      agreedPrintedRows.push(r.rowNumber);
    } else {
      disputedPrintedRows.push(r.rowNumber);
      if (differences.length < 40) differences.push(`row ${r.rowNumber}: OCR [${want}] vs AI parse [${got}]`);
    }
  }
  const differ = compared - agree;
  const unread = Math.max(0, parsed.length - compared);
  return {
    compared, agree, differ, unread, differences,
    agreedPrintedRows, disputedPrintedRows, repairedPrintedRows, placeholderRows: [...extraction.placeholderRows],
  };
}

export type OcrCheck =
  | { ran: false; reason: string }
  | {
      ran: true;
      run: OcrRun;
      extraction: Extraction;
      result: CrossCheckResult;
      rowNumbersRepaired: number;
      /** Advisory pairing by printed row, filled only on a mismatch. */
      aligned: AlignedComparison | null;
    };

/**
 * Run the OCR lane on one filing against the model's rows for the same
 * filing, in document order. Same comparison as the text lane.
 */
export function crossCheckByOcr(
  pdfPath: string,
  pdfSha256: string,
  parsed: Array<{ type: string; date: string; amount: string | null; lateFilingFlag?: boolean }>,
  options: { log?: (line: string) => void } = {}
): OcrCheck {
  const engine = ocrEngine();
  if (!engine.available) return { ran: false, reason: engine.reason };
  const { text, run } = ocrPdfToText(pdfPath, pdfSha256, options);
  const extraction = extractOcrRows(text);
  const result = withholdRepairs(compareExtraction(extraction, parsed, "OCR"), extraction.repairedRowNumbers ?? []);
  return {
    ran: true,
    run,
    extraction,
    result,
    rowNumbersRepaired: extraction.rowNumbersRepaired ?? 0,
    aligned: result.status === "mismatch" ? alignByPrintedRow(extraction, parsed) : null,
  };
}
