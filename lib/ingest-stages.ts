/**
 * The ingest stages as importable functions: fetch, read, check, merge,
 * plus the helpers they share. scripts/ingest-new-filings.ts wires them
 * into the weekly run; scripts/reverify.ts wires the same functions into
 * a deliberate re-read of published filings. One implementation, two
 * callers, so a fix in a stage reaches both.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { createWriteStream, existsSync, statSync } from "fs";
import { execFileSync } from "node:child_process";
import path from "path";
import https from "https";
import { PDFDocument } from "pdf-lib";
import {
  parsePdf,
  ParseTruncatedError,
  EXTRACTION_PROMPT,
  SYSTEM_PROMPT,
  PARSER_VERSION,
  DEFAULT_MODEL,
  type ParsedTransaction,
} from "../scripts/parse-pdf.js";
import { CHECKER_VERSION, crossCheckParsedFiling } from "../scripts/text-layer-crosscheck.js";
import { assertParsedRows, ParsedRowsInvalidError } from "./filing-validation";
import {
  describeCacheKey,
  hasLegacyCacheOnly,
  isTerminationForm,
  promptHash,
  readParseCache,
  findParseRecord,
  pdfPageCount,
  sha256File,
  writeChunkManifest,
  writeParseCache,
  writeRejectedParse,
  type ParseCacheKeyInput,
} from "./parse-cache";
import {
  COMPARED_FIELDS,
  hashRows,
  readCrosscheckLog,
  upsertCrosscheckEntry,
  writeCrosscheckLog,
  type CrosscheckEntry,
  type CrosscheckState,
} from "./crosscheck-log";
import { crossCheckByOcr, type OcrCheck } from "./ocr-lane";
import { recordSecondRead, secondReadFiling, SECOND_READ_MODEL } from "./second-read";
import { auditPages, foldAudit, recordGrokAudit, GROK_AUDIT_MODEL, GROK_AUDIT_PROMPT_VERSION, type Row as AuditRow } from "./grok-audit";
import { openReviewItem, problemsFromCrosscheck } from "./review-queue";
import { notify } from "./notify";
import type { TargetFiling } from "./oge-filings";

export type { ParsedTransaction };

export const PDF_DIR = path.resolve("data/pdfs");
/** Runtime switches the CLI sets; libraries never read process.argv. */
export const stageOptions = {
  forceReparse: false,
  /** Dollars this process may spend on model calls before it stops.
   * Every script that reads filings sets this from --ceiling or a
   * default; null means no ceiling, which only tests use. */
  ceilingUsd: 25 as number | null,
};

/** Running total of model spend in this process, in dollars. */
export const spend = { usd: 0, calls: 0 };

export class SpendCeilingError extends Error {
  constructor(public readonly spentUsd: number, public readonly ceilingUsd: number) {
    super(`spend ceiling reached: $${spentUsd.toFixed(2)} of $${ceilingUsd.toFixed(2)}; stopping before the next paid call`);
    this.name = "SpendCeilingError";
  }
}

/** Record a paid call. Throws when the next call would pass the ceiling,
 * after notifying the admin address once. */
export async function recordSpend(usd: number): Promise<void> {
  spend.usd += usd;
  spend.calls += 1;
  if (stageOptions.ceilingUsd !== null && spend.usd >= stageOptions.ceilingUsd) {
    const err = new SpendCeilingError(spend.usd, stageOptions.ceilingUsd);
    await notify({
      type: "credits_exhausted",
      headline: `Open Cabinet stopped at its spend ceiling ($${stageOptions.ceilingUsd})`,
      summary: `${err.message}\n\nCalls this run: ${spend.calls}. Nothing was applied. Rerun with a higher --ceiling to continue; caches keep what was already read.`,
    });
    throw err;
  }
}

export interface SourceFiling {
  date: string;
  url: string;
  label: string;
}

export interface OfficialFile {
  name: string;
  slug: string;
  title?: string;
  agency?: string;
  level?: string;
  filingType?: string;
  mostRecentFilingDate?: string;
  transactions: Array<ParsedTransaction & { confidence?: number }>;
  summary?: string;
  summarySource?: "template" | "model";
  summaryFactSha256?: string;
  summaryStaleSince?: string;
  tookOfficeDate?: string;
  party?: string;
  sourceFilings?: SourceFiling[];
  [k: string]: unknown;
}

export type FilingForIngest = TargetFiling;


export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "OpenCabinet/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          if (res.headers.location) {
            downloadFile(res.headers.location, dest).then(resolve, reject);
          } else {
            reject(new Error("Redirect with no location"));
          }
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", reject);
  });
}

export function pdfFilenameFromUrl(url: string): string {
  // The URL ends with /$FILE/<filename>
  const tail = url.split("/").pop() || "filing.pdf";
  return decodeURIComponent(tail);
}


export async function ensurePdf(url: string): Promise<string> {
  await mkdir(PDF_DIR, { recursive: true });
  const filename = pdfFilenameFromUrl(url);
  const dest = path.join(PDF_DIR, filename);
  if (existsSync(dest) && statSync(dest).size > 5000) return dest;
  console.log(`    Downloading ${filename}...`);
  await downloadFile(url, dest);
  return dest;
}

/**
 * OGE reviewers annotate the certification page when a filer pays the $200
 * late-filing fee (e.g. "Filer paid late fee - HAJ 6/29/26"). Scan each
 * newly ingested PDF's text layer so payments are caught the day they post.
 * Hits go to data/meta/fee-annotations-pending.json for human review before
 * promotion into data/meta/fee-payments.json (which drives the site UI) —
 * OCR noise makes auto-publishing unsafe.
 */
export async function scanPdfForFeeAnnotation(
  pdfPath: string,
  pdfUrl: string,
  slug: string
): Promise<void> {
  try {
    const text = execFileSync("pdftotext", [pdfPath, "-"], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    // "Filer paid ..." / "... paid late fee(s)" are reviewer-annotation
    // phrasings; the form's printed instructions say "late filing fee" and
    // never "filer paid", so boilerplate does not trip this. "filing
    // extension" catches Integrity.gov's signature-block notice ("Filer
    // received a 45 day filing extension") — an extension changes whether a
    // late-looking filing actually missed its deadline, so it must surface
    // for review the day it posts.
    const pattern = /filer\s+paid|paid\s+late|filing\s+extension/i;
    const hit = pattern.test(text);
    if (!hit) return;
    // Integrity.gov prints "Filer received a 0 day filing extension" on
    // every e-filed form. A zero-day extension changes nothing; skip it
    // rather than queue a review item for every filing.
    if (/received a 0 day filing extension/i.test(text) && !/filer\s+paid|paid\s+late/i.test(text)) return;
    const snippetMatch = text.match(/.{0,80}(?:filer\s+paid|paid\s+late|filing\s+extension).{0,80}/i);
    const pendingPath = path.resolve("data/meta/fee-annotations-pending.json");
    const pending: Array<Record<string, string>> = existsSync(pendingPath)
      ? JSON.parse(await readFile(pendingPath, "utf-8"))
      : [];
    const entry = {
      slug,
      pdfFile: path.basename(pdfPath),
      pdfUrl,
      snippet: (snippetMatch?.[0] ?? "").replace(/\s+/g, " ").trim(),
      detected: new Date().toISOString().slice(0, 10),
    };
    if (pending.some((p) => p.pdfFile === entry.pdfFile)) return;
    pending.push(entry);
    await writeFile(pendingPath, JSON.stringify(pending, null, 2) + "\n");
    console.warn(
      `  [${slug}] POSSIBLE FEE ANNOTATION in ${entry.pdfFile}: "${entry.snippet}" — review data/meta/fee-annotations-pending.json`
    );
  } catch {
    // pdftotext missing or unreadable PDF — the sweep script covers gaps.
  }
}

/** A vision read of more than this many pages risks the output cap. */
export const MAX_PAGES_PER_UNIT = 8;

/** One piece of a filing to parse: the whole PDF, or a page-range chunk. */
export interface ParseUnit {
  path: string;
  chunk: { first: number; last: number } | null;
}

export async function splitPdfIfNeeded(
  pdfPath: string
): Promise<{ units: ParseUnit[]; pageCount: number | null }> {
  const buf = await readFile(pdfPath);
  const doc = await PDFDocument.load(buf);
  const pageCount = doc.getPageCount();
  // Two reasons to split: the bytes (a scan) or the pages (a dense text
  // filing; Mody's 19-page, 41 KB filing overran the output cap whole).
  if (buf.length <= 500_000 && pageCount <= MAX_PAGES_PER_UNIT) {
    return { units: [{ path: pdfPath, chunk: null }], pageCount: null };
  }
  const bytesPerPage = buf.length / pageCount;
  const pagesPerChunk = Math.max(1, Math.min(MAX_PAGES_PER_UNIT, Math.floor(500_000 / bytesPerPage)));
  const chunks: ParseUnit[] = [];

  for (let i = 0; i < pageCount; i += pagesPerChunk) {
    const end = Math.min(i + pagesPerChunk, pageCount);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(
      doc,
      Array.from({ length: end - i }, (_, k) => i + k)
    );
    pages.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    const chunkPath = pdfPath.replace(/\.pdf$/i, `.pages${i + 1}-${end}.pdf`);
    await writeFile(chunkPath, bytes);
    chunks.push({ path: chunkPath, chunk: { first: i + 1, last: end } });
  }

  console.log(
    `           split ${path.basename(pdfPath)} into ${chunks.length} chunks`
  );
  return { units: chunks, pageCount };
}

export const PROMPT_SHA256 = promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT);

/**
 * Read stage. Returns the rows for one parse unit, from the cache when
 * every input matches (PDF bytes, source URL, chunk, prompt, parser
 * version, model) and from the model otherwise. Both paths run the same
 * validation gate before anything is cached or merged.
 */
export async function parseUnitWithRetry(
  unit: ParseUnit,
  filingPdfSha256: string,
  sourceUrl: string
): Promise<ParsedTransaction[]> {
  const keyInput: ParseCacheKeyInput = {
    pdfSha256: filingPdfSha256,
    sourceUrl,
    chunk: unit.chunk,
    parserVersion: PARSER_VERSION,
    promptSha256: PROMPT_SHA256,
    model: DEFAULT_MODEL,
  };

  const cached = stageOptions.forceReparse ? null : readParseCache(unit.path, keyInput);
  if (cached) {
    // A cached parse is validated exactly like a fresh one. A bad row
    // that was cached before the gate existed must not slip through
    // because it came from disk instead of the model.
    const rows = assertParsedRows(cached.transactions, path.basename(unit.path));
    console.log(`           cached ${rows.length} txns (${describeCacheKey(keyInput)})`);
    return rows as ParsedTransaction[];
  }
  if (hasLegacyCacheOnly(unit.path, keyInput)) {
    console.log(
      `           legacy cache ignored for ${path.basename(unit.path)}: made under an earlier prompt or parser; re-parsing`
    );
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (stageOptions.ceilingUsd !== null && spend.usd >= stageOptions.ceilingUsd) {
        throw new SpendCeilingError(spend.usd, stageOptions.ceilingUsd);
      }
      const result = await parsePdf(unit.path);
      // The call is paid for now, whatever happens next: the result is
      // cached (or kept as a rejected read) before the spend is counted,
      // so a ceiling trip never discards a read that was paid for, and a
      // rejected read still counts toward the ceiling (review, Sep 6).
      try {
        // Enum and shape gate before anything is cached or merged.
        let rows: ReturnType<typeof assertParsedRows>;
        try {
          rows = assertParsedRows(result.transactions, path.basename(unit.path));
        } catch (err) {
          if (err instanceof ParsedRowsInvalidError) {
            const file = writeRejectedParse(unit.path, keyInput, {
              transactions: result.transactions, problems: err.problems, tokenUsage: result.tokenUsage,
            });
            console.warn(`           rejected read kept for a person: ${path.basename(file)}`);
          }
          throw err;
        }
        console.log(
          `           ${rows.length} txns, $${result.tokenUsage.estimatedCostUsd}`
        );
        writeParseCache(unit.path, { ...keyInput, model: result.model }, {
          transactions: rows,
          tokenUsage: result.tokenUsage,
        });
        return rows as ParsedTransaction[];
      } finally {
        await recordSpend(result.tokenUsage.estimatedCostUsd);
      }
    } catch (err: unknown) {
      // A response cut off at the token cap will be cut off again on a
      // retry. Surface it so the operator splits the PDF instead.
      if (err instanceof ParseTruncatedError) throw err;
      // A validation failure is deterministic: the model read the page
      // the same way it will read it again (Kennedy's filing prints
      // 04/04/2225 and a faithful read fails the future-date check three
      // times at three times the cost). It goes to a person, not a retry.
      if (err instanceof ParsedRowsInvalidError) throw err;
      if (err instanceof SpendCeilingError) throw err;
      console.warn(`           attempt ${attempt}/3 failed: ${(err as Error).message}`);
      if (attempt === 3) throw err;
      await sleep(5000 * attempt);
    }
  }

  return [];
}


export function txKey(tx: ParsedTransaction): string {
  return `${tx.description.trim().toLowerCase()}|${tx.date}|${tx.type.toLowerCase()}|${tx.amount}`;
}


export function recordCrosscheck(
  slug: string,
  filing: FilingForIngest,
  pdfPath: string,
  pdfSha256: string,
  rows: ParsedTransaction[],
  check: ReturnType<typeof crossCheckParsedFiling>
): void {
  let state: CrosscheckState;
  let problems: string[] | undefined;
  if (check.status === "ok") state = "checked_tuple_agreement";
  else if (check.status === "scan") state = "no_usable_text";
  else if (check.status === "mismatch") {
    state = "checked_tuple_mismatch";
    problems = check.problems;
  } else {
    state = /pdftotext failed/i.test(check.message)
      ? "tool_unavailable"
      : isTerminationForm(pdfPath) || /unsupported form/i.test(check.message)
        ? "unsupported_form"
        : "unsupported_layout";
    problems = [check.message];
  }
  const log = upsertCrosscheckEntry(
    readCrosscheckLog(),
    {
      sourceUrl: filing.pdfUrl,
      slug,
      filingDate: filing.docDate.slice(0, 10),
      pdfFile: path.basename(pdfPath),
      pdfSha256,
      candidateSha256: hashRows(rows),
      checkerVersion: CHECKER_VERSION,
      state,
      comparedFields: COMPARED_FIELDS,
      rowsCompared: check.status === "ok" ? check.rowCount : null,
      publishedRows: rows.length,
      ...(problems ? { problems } : {}),
      parseRecord: "current",
      checkedAt: new Date().toISOString(),
    },
    CHECKER_VERSION
  );
  writeCrosscheckLog(log);
}

// ── THE SEVEN STAGES ──
//
// find -> fetch -> read -> check -> merge -> validate -> publish
//
// The first five run here, per official, per filing. Validate is
// scripts/validate.ts and publish is the pull request the workflow opens;
// both are named below so the file reads the same way research/pipeline.md
// describes it. Each stage says what stops it.

/** FETCH. Download the filing PDF (or reuse the local copy) and hash it.
 *  Stops on: HTTP error. Also scans the certification page for a
 *  reviewer's late-fee note, which goes to a pending file for a person. */
export async function fetchFiling(
  slug: string,
  filing: FilingForIngest
): Promise<{ pdfPath: string; sha256: string }> {
  const pdfPath = await ensurePdf(filing.pdfUrl);
  await scanPdfForFeeAnnotation(pdfPath, filing.pdfUrl, slug);
  const sizeKb = (statSync(pdfPath).size / 1024).toFixed(0);
  console.log(`  [${slug}] parsing ${path.basename(pdfPath)} (${sizeKb} KB)`);
  return { pdfPath, sha256: sha256File(pdfPath) };
}

/** READ. The model proposes rows for the whole PDF, or for each page
 *  range when the filing is large. Every unit is validated for shape and
 *  enums whether it came from the model or from a keyed cache.
 *  Stops on: a row that fails validation; a truncated response; three
 *  failed attempts. */
export async function readFiling(
  pdfPath: string,
  sha256: string,
  sourceUrl: string
): Promise<ParsedTransaction[]> {
  const rows: ParsedTransaction[] = [];
  // A current whole-file cache is used before any split, so a filing read
  // whole under this key is never paid for again because the split rule
  // changed.
  const wholeKey: ParseCacheKeyInput = {
    pdfSha256: sha256, sourceUrl, chunk: null, parserVersion: PARSER_VERSION, promptSha256: PROMPT_SHA256, model: DEFAULT_MODEL,
  };
  if (!stageOptions.forceReparse && readParseCache(pdfPath, wholeKey)) {
    return parseUnitWithRetry({ path: pdfPath, chunk: null }, sha256, sourceUrl);
  }
  const { units, pageCount } = await splitPdfIfNeeded(pdfPath);
  for (const unit of units) {
    if (unit.chunk) console.log(`           parsing chunk ${path.basename(unit.path)}`);
    rows.push(...(await parseUnitWithRetry(unit, sha256, sourceUrl)));
    await sleep(1500);
  }
  if (pageCount !== null) {
    // Record which chunk caches compose this filing, so a later comparison
    // can only assemble the complete, contiguous set under the same key.
    writeChunkManifest(
      pdfPath,
      { pdfSha256: sha256, sourceUrl, parserVersion: PARSER_VERSION, promptSha256: PROMPT_SHA256, model: DEFAULT_MODEL },
      pageCount,
      units.map((u) => u.chunk!).filter(Boolean)
    );
  }
  return rows;
}

/** CHECK. A second program that never sees the model's output reads the
 *  PDF's text layer and compares type, date, amount, late flag and printed
 *  row numbers, row for row. Every verdict is recorded in the log.
 *  Stops on: any disagreement; a text layer the parser cannot read.
 *  Does not stop on: a scan (no text layer). That is recorded as
 *  no_usable_text and depends on a person's visual check. */
export type GateVerdict =
  /** A program that never saw the model's output agreed row for row. */
  | { verdict: "two_lane"; lane: "text" | "ocr" }
  /** A second company's model agreed on every row; no program could read the page. */
  | { verdict: "two_models"; agreed: number }
  /** Held for a person. Nothing from the filing merges. */
  | { verdict: "held"; reason: string };

/** Thrown when a filing is held for a person. The ingest stops before merge. */
export class FilingHeldError extends Error {
  constructor(public readonly pdfFile: string, public readonly reason: string) {
    super(`${pdfFile} held for a person: ${reason}; nothing from it is merged`);
    this.name = "FilingHeldError";
  }
}

/**
 * The publication rule, in one place: a filing merges only when two
 * independent reads agree on every row, or a person has decided. The
 * first read is always the primary model. The second is, in order of
 * strength, the text layer, the OCR lane, then a second company's vision
 * model. Any row the second read disputes, or that no second read could
 * reach, holds the whole filing, because the comparison is positional
 * and a missing row shifts everything after it.
 */
export async function checkFiling(
  slug: string,
  officialName: string,
  filing: FilingForIngest,
  pdfPath: string,
  sha256: string,
  rows: ParsedTransaction[],
  options: {
    /** Call the second company's model when no program could confirm the
     * read. On for the ingest. Off for a report-only re-read, which
     * records the lanes and leaves the paid tiebreaker to pnpm second-read. */
    secondRead?: boolean;
  } = {}
): Promise<GateVerdict> {
  const secondReadAllowed = options.secondRead ?? true;
  const check = crossCheckParsedFiling(pdfPath, rows);
  recordCrosscheck(slug, filing, pdfPath, sha256, rows, check);
  const filingRef = { url: filing.pdfUrl, pdfFile: path.basename(pdfPath), date: filing.docDate.slice(0, 10) };
  const hold = async (reason: string, problems: string[]): Promise<never> => {
    await openReviewItem({
      kind: "lane_disagreement",
      slug,
      officialName,
      filing: filingRef,
      problems: problemsFromCrosscheck(pdfPath, problems, rows),
      holding: `every row of ${path.basename(pdfPath)}; nothing from it is published until this is decided`,
    });
    throw new FilingHeldError(path.basename(pdfPath), reason);
  };

  // Date plausibility, independent of any lane. A trade dated after the
  // filing was posted cannot be right and holds the filing. A trade more
  // than 400 days before the posting is unusual for a periodic
  // transaction report and is recorded for a person (amended and late
  // filings do reach back). (Trevor, Sep 5: a date beyond today or far
  // outside the reporting window is a flag.)
  const posted = filing.docDate.slice(0, 10);
  const afterPosting = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.date > posted);
  const farBefore = rows.filter((r) => Date.parse(posted) - Date.parse(r.date) > 400 * 86_400_000);
  if (afterPosting.length) {
    return hold(
      `${afterPosting.length} row(s) dated after the filing was posted (${posted})`,
      afterPosting.slice(0, 20).map(({ r, i }) => `row ${i + 1}: dated ${r.date}, after the posting date ${posted}: "${r.description}"`)
    );
  }
  if (farBefore.length) {
    console.warn(`           ${farBefore.length} row(s) dated more than 400 days before the posting date ${posted}; recorded for a person`);
    appendCrosscheckProblems(filing, slug, farBefore.slice(0, 20).map((r) => `date flag: ${r.date} is more than 400 days before the posting date ${posted}: "${r.description}"`));
  }

  // The third gate, after a program or a second model has agreed: a third
  // company's model looks at the page images beside these rows. Any row it
  // disputes or cannot find holds the filing.
  const audited = async (verdict: GateVerdict): Promise<GateVerdict> => {
    if (!secondReadAllowed) return verdict; // report-only runs leave the audit to pnpm grok-audit
    if (!process.env.GROK_API_KEY) {
      console.warn(`           page audit unavailable (no GROK_API_KEY); holding ${path.basename(pdfPath)} for a person`);
      return hold("the page audit could not run (no GROK_API_KEY); two of three gates passed", [
        `two of three gates passed (${verdict.verdict === "two_lane" ? verdict.lane : "second model"}); the page audit did not run because GROK_API_KEY is not set`,
      ]);
    }
    const record = findParseRecord(pdfPath, {
      pdfSha256: sha256, sourceUrl: filing.pdfUrl, parserVersion: PARSER_VERSION, promptSha256: PROMPT_SHA256, model: DEFAULT_MODEL,
    });
    const pages = pdfPageCount(pdfPath) ?? 1;
    const units = record?.units
      ? record.units.map((u) => ({ first: u.first, last: u.last, rows: u.transactions as AuditRow[] }))
      : [{ first: 1, last: pages, rows: rows as AuditRow[] }];
    const chunks: Array<{ offset: number; rows: number; result: Awaited<ReturnType<typeof auditPages>> }> = [];
    let offset = 0;
    let cost = 0;
    for (const u of units) {
      const result = await auditPages({ pdfPath, pdfSha256: sha256, first: u.first, last: u.last, rows: u.rows });
      if (!result.cached) {
        cost += result.usage.estimatedCostUsd;
        await recordSpend(result.usage.estimatedCostUsd);
      }
      chunks.push({ offset, rows: u.rows.length, result });
      offset += u.rows.length;
    }
    const folded = foldAudit(chunks);
    recordGrokAudit(
      {
        slug, pdfFile: path.basename(pdfPath), pdfSha256: sha256, candidateSha256: hashRows(rows), model: GROK_AUDIT_MODEL,
        promptVersion: GROK_AUDIT_PROMPT_VERSION, rows: rows.length, ...folded, pagesAudited: pages,
        costUsd: Math.round(cost * 10000) / 10000, checkedAt: new Date().toISOString(),
      },
      filing.pdfUrl
    );
    const clean = folded.disputedIndexes.length === 0 && folded.notFoundIndexes.length === 0 && folded.missing.length === 0;
    if (clean) {
      console.log(`           page audit (${GROK_AUDIT_MODEL}) confirms all ${rows.length} rows ($${cost.toFixed(2)})`);
      return verdict;
    }
    console.warn(`           page audit disputes ${folded.disputedIndexes.length}, cannot find ${folded.notFoundIndexes.length}, sees ${folded.missing.length} rows the read lacks; holding`);
    return hold("the page audit disagrees", [
      ...folded.differences,
      ...folded.notFoundIndexes.slice(0, 20).map((i) => `row ${i + 1}: the page audit could not find this row on the pages`),
      ...folded.missing.slice(0, 20).map((m) => `on the page but not in the read: ${m.type} ${m.date} ${m.amount} "${m.description}"`),
    ]);
  };

  if (check.status === "ok") {
    console.log(`           text-layer cross-check OK (${check.rowCount} rows agree)`);
    return audited({ verdict: "two_lane", lane: "text" });
  }
  if (check.status === "mismatch") {
    console.error(`  [${slug}] TEXT-LAYER MISMATCH in ${path.basename(pdfPath)}:`);
    for (const p of check.problems) console.error(`    - ${p}`);
    return hold("text layer disagrees with the model", check.problems);
  }
  if (check.status === "error" && !/no rows were extracted/i.test(check.message)) {
    // A tool failure or a form the checker does not read. Not a scan;
    // nothing to fall back to. Stop and say so.
    throw new Error(
      `text-layer cross-check could not run on ${path.basename(pdfPath)} (${check.message}) — ingest halted before merge`
    );
  }

  // The text lane could not read the filing. The OCR lane reads the page
  // images and compares the same way.
  let ocrProblems: string[] = [];
  const ocr = crossCheckByOcr(pdfPath, sha256, rows, {
    log: (line) => { if (/page (?:\d*0|1)\//.test(line)) process.stdout.write("."); },
  });
  if (!ocr.ran) {
    console.warn(`           OCR lane skipped: ${ocr.reason}`);
  } else {
    recordOcrCheck(filing, slug, check, ocr);
    if (ocr.result.status === "ok") {
      console.log(`           OCR cross-check agrees on ${ocr.result.rowCount} rows (${ocr.run.pages} pages)`);
      return audited({ verdict: "two_lane", lane: "ocr" });
    }
    if (ocr.result.status === "mismatch") {
      ocrProblems = ocr.result.problems;
      console.warn(`           OCR cross-check disagrees (${ocr.result.problems.length} problems); asking a second model`);
    } else {
      console.warn(`           OCR lane could not compare: ${ocr.result.status === "error" ? ocr.result.message : ocr.result.status}`);
    }
  }

  // No program could confirm the read. A second company's model reads the
  // same pages; it must agree on every row, with none left over.
  if (!secondReadAllowed) {
    console.warn(`           no program confirmed ${path.basename(pdfPath)}; second read left to pnpm second-read`);
    return { verdict: "held", reason: "no program could confirm the read; second read not run" };
  }
  const { units } = await splitPdfIfNeeded(pdfPath);
  const second = await secondReadFiling({
    slug, pdfPath, pdfSha256: sha256, sourceUrl: filing.pdfUrl, candidateSha256: hashRows(rows),
    primary: rows, units, parserVersion: PARSER_VERSION, systemPrompt: SYSTEM_PROMPT, extractionPrompt: EXTRACTION_PROMPT,
    read: (unitPath) => parsePdf(unitPath, SECOND_READ_MODEL, { asImages: true }),
    onSpend: recordSpend,
    onProgress: () => process.stdout.write("."),
  });
  recordSecondRead(second, filing.pdfUrl);
  const allAgree = second.agreedIndexes.length === rows.length && second.extraRows.length === 0 && !second.failed;
  if (allAgree) {
    console.log(`           second model (${SECOND_READ_MODEL}) agrees on all ${rows.length} rows ($${second.costUsd.toFixed(2)})`);
    return audited({ verdict: "two_models", agreed: rows.length });
  }
  const problems = [
    ...(second.failed ? [second.failed] : []),
    `second model: ${second.agreedIndexes.length} of ${rows.length} rows agree, ${second.disputedIndexes.length} differ, ${second.unreadIndexes.length} unread, ${second.extraRows.length} extra`,
    ...second.differences,
    ...second.extraRows.slice(0, 20).map((r) => `second model also read: ${r.type} ${r.date} ${r.amount ?? "unknown"} "${r.description}"`),
    ...ocrProblems.slice(0, 10),
  ];
  console.warn(`           second model disagrees; holding ${path.basename(pdfPath)} for a person`);
  return hold("no two independent reads agree on every row", problems);
}

/** Add advisory lines to the filing's log entry without changing its state. */
export function appendCrosscheckProblems(filing: FilingForIngest, slug: string, lines: string[]): void {
  const log = readCrosscheckLog();
  const entry = log?.entries.find((e) => e.sourceUrl === filing.pdfUrl && e.slug === slug);
  if (!log || !entry || lines.length === 0) return;
  const next = { ...entry, problems: [...(entry.problems ?? []), ...lines] };
  writeCrosscheckLog(upsertCrosscheckEntry(log, next, CHECKER_VERSION));
}

/** Overlay the OCR lane's verdict on the entry the text lane just wrote. */
export function recordOcrCheck(
  filing: FilingForIngest,
  slug: string,
  textCheck: ReturnType<typeof crossCheckParsedFiling>,
  ocr: OcrCheck
): void {
  if (!ocr.ran) return;
  const log = readCrosscheckLog();
  const entry = log?.entries.find((e) => e.sourceUrl === filing.pdfUrl && e.slug === slug);
  if (!log || !entry) return;
  const textLaneState: CrosscheckState = textCheck.status === "scan" ? "no_usable_text" : "unsupported_layout";
  const base = {
    engine: ocr.run.engine, version: ocr.run.version, dpi: ocr.run.dpi, psm: ocr.run.psm,
    laneVersion: ocr.run.laneVersion, pages: ocr.run.pages, textFile: ocr.run.textFile,
    textSha256: ocr.run.textSha256, textLaneState,
    rowsRead: ocr.extraction.kind === "rows" ? ocr.extraction.rows.length : 0,
    rowNumbersRepaired: ocr.rowNumbersRepaired,
    ...(ocr.aligned ? { aligned: ocr.aligned } : {}),
  };
  let next: CrosscheckEntry;
  if (ocr.result.status === "ok") {
    next = { ...entry, state: "ocr_tuple_agreement", lane: "ocr", rowsCompared: ocr.result.rowCount, ocr: base };
    delete next.problems;
  } else if (ocr.result.status === "mismatch") {
    const rowsRead = ocr.extraction.kind === "rows" ? ocr.extraction.rows.length : null;
    next = { ...entry, state: "ocr_tuple_mismatch", lane: "ocr", rowsCompared: rowsRead, problems: ocr.result.problems, ocr: base };
  } else {
    next = { ...entry, ocr: { ...base, problem: ocr.result.status === "error" ? ocr.result.message : "ocr: no rows" } };
  }
  writeCrosscheckLog(upsertCrosscheckEntry(log, next, CHECKER_VERSION));
}

/** MERGE. Add the new rows to the official's existing rows. Amendment-aware,
 *  not row-unique: a filing that prints the same description, date, type
 *  and amount on several numbered rows is disclosing several trades, and an
 *  amended filing that repeats rows adds nothing. Each key's multiplicity
 *  is the largest count any single source asserts. (The Aug 2026 re-audit
 *  restored 76 rows a Set-based dedupe had collapsed.) Every added row is
 *  stamped with the filing that disclosed it. Stops on: nothing; a genuine
 *  repeat disclosed in a later filing is the known limit, and
 *  scripts/validate.ts reports cross-filing repeats for a person. */
export function mergeRows(
  official: OfficialFile,
  perFilingParses: ParsedTransaction[][],
  newPdfs: FilingForIngest[]
): ParsedTransaction[] {
  const countKeys = (txs: ParsedTransaction[]): Map<string, number> => {
    const c = new Map<string, number>();
    for (const tx of txs) c.set(txKey(tx), (c.get(txKey(tx)) ?? 0) + 1);
    return c;
  };
  const current = countKeys(official.transactions as ParsedTransaction[]);
  const target = new Map(current);
  for (const filingTxs of perFilingParses) {
    for (const [key, n] of countKeys(filingTxs)) {
      target.set(key, Math.max(target.get(key) ?? 0, n));
    }
  }
  const addedTxs: ParsedTransaction[] = [];
  for (let fi = 0; fi < perFilingParses.length; fi++) {
    for (const tx of perFilingParses[fi]) {
      const key = txKey(tx);
      if ((current.get(key) ?? 0) >= (target.get(key) ?? 0)) continue;
      current.set(key, (current.get(key) ?? 0) + 1);
      // confidence is self-reported by the model and not part of the
      // published row. It stays in the parse cache for review (Gate 2 will
      // carry it into a review file).
      const rest: Partial<ParsedTransaction> & { confidence?: number } = { ...tx };
      delete rest.confidence;
      addedTxs.push({ ...rest, sourceUrl: newPdfs[fi].pdfUrl } as unknown as ParsedTransaction);
    }
  }
  return addedTxs;
}

/** WRITE the official's JSON. Never overwrites an existing summary.
 *  Validate (scripts/validate.ts) and publish (the workflow's pull request)
 *  happen after this script exits. */
