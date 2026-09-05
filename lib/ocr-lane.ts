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
import { compareExtraction, parseTextLayer, type CrossCheckResult, type Extraction } from "../scripts/text-layer-crosscheck";

/** Bump when rendering or OCR settings change. Part of the cache key. */
export const OCR_LANE_VERSION = "2026-09-05.1";
export const OCR_DPI = 300;
/** tesseract page segmentation 6: one uniform block of text, which keeps
 * table rows as lines. preserve_interword_spaces keeps the column gaps the
 * parser relies on. */
export const OCR_PSM = 6;

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
        [path.join(work, png), "-", "--psm", String(OCR_PSM), "-c", "preserve_interword_spaces=1"],
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
 * (row numbers, dates, dollar ranges, Yes/No), and are tested on strings.
 * They never touch description text.
 */
export function repairOcrText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let l = line;
      // Dollar amounts: "$1,001 - $15,000" with O/o for 0, l/I for 1, S for $.
      l = l.replace(/(?<=^|\s)S(?=\d[\d,]*\b)/g, "$");
      l = l.replace(/\$[\dOoIl,]+/g, (m) => m.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
      // Dates: MM/DD/YYYY with the same substitutions.
      l = l.replace(/\b[\dOoIl]{2}\/[\dOoIl]{2}\/[\dOoIl]{4}\b/g, (m) => m.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
      // A leading row number read with an O.
      l = l.replace(/^(\s{0,4})([\dO]{1,4})(?=\s{2,})/, (_m, sp: string, n: string) => sp + n.replace(/O/g, "0"));
      // Hand-typed forms (Trump's) print "6/15/2026" and "purchase". The
      // e-filed form prints "06/15/2026" and "Purchase", which is what the
      // parser reads. Pad the date; capitalize a type word that sits alone
      // in a column (gaps of two or more spaces on both sides), never one
      // inside a description.
      l = l.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_m, mm: string, dd: string, yy: string) => `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${yy}`);
      l = l.replace(/(\s{2,})(purchase|sale|exchange)(?=\s{2,}|\s*$)/g, (_m, sp: string, t: string) => sp + t[0].toUpperCase() + t.slice(1));
      return l;
    })
    .join("\n");
}

/** Extract comparison rows from the OCR text, through the shared parser. */
export function extractOcrRows(text: string): Extraction {
  const extraction = parseTextLayer(repairOcrText(text));
  if (extraction.kind === "no-text") {
    // The image was OCRed and still no rows came out: not a scan we could
    // not see, a scan the parser could not read. Say that.
    return { kind: "tool-error", message: "ocr: no transaction rows could be parsed from the OCR text" };
  }
  return extraction;
}

export type OcrCheck =
  | { ran: false; reason: string }
  | { ran: true; run: OcrRun; extraction: Extraction; result: CrossCheckResult };

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
  return { ran: true, run, extraction, result: compareExtraction(extraction, parsed, "OCR") };
}
