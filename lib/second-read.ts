/**
 * The second-read lane: a second vision model, from a different company,
 * reads a filing the deterministic lanes could not check, and its rows are
 * compared to the primary model's rows.
 *
 * When it runs. Only as a tiebreaker or a backstop: filings the text lane
 * and the OCR lane could not read (scans with unreadable images), and
 * filings where a deterministic lane disagreed with the primary model. It
 * is not a third read of rows two programs already agree on.
 *
 * What it proves. Two models from different companies reading the same
 * page the same way is weaker evidence than a program that never saw
 * either model's output, so an agreement here scores 2, not 3, in
 * lib/row-verification.ts. A disagreement scores 0 and goes to a person.
 *
 * The second model gets the same prompt contract and the same page ranges
 * as the primary. Its responses are cached under the same keyed cache
 * (lib/parse-cache.ts) with its own model name, so a rerun is free. The
 * verdict per filing is written to data/meta/second-read-log.json with
 * the primary candidate's hash, so a later re-read of the primary
 * invalidates the comparison rather than silently reusing it.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { comparedTuple } from "./row-verification";
import { normalizedDescription, sharesAssetWord } from "./reverify-diff";
import { validateParsedRows } from "./validation/parsed-rows";
import { promptHash, readParseCache, writeParseCache, type ParseCacheKeyInput } from "./parse-cache";
import type { Transaction } from "./types";

export const SECOND_READ_LOG_PATH = path.resolve("data/meta/second-read-log.json");
export const SECOND_READ_MODEL = "gpt-6-astra" as const;
/** Appended to the parser version in the cache key: the second read sends
 * page images, not the PDF file, since Sep 6 (a 26 MB scan sent as a file
 * came back with no amounts). Old file-based caches are ignored. */
export const SECOND_READ_INPUT = "images-200dpi";

export interface SecondReadFiling {
  slug: string;
  pdfFile: string;
  pdfSha256: string;
  /** Hash of the primary rows compared against. */
  candidateSha256: string;
  model: typeof SECOND_READ_MODEL;
  rowsPrimary: number;
  rowsSecond: number;
  /** Indexes into the primary rows. */
  agreedIndexes: number[];
  disputedIndexes: number[];
  /** Primary rows the second model produced no counterpart for. */
  unreadIndexes: number[];
  /** Second-model rows with no counterpart in the primary: rows the
   * primary may have missed. A person reads these. */
  extraRows: Array<{ description: string; type: string; date: string | null; amount: string | null; lateFilingFlag: boolean }>;
  differences: string[];
  /** The second reader's own description for each primary index it was
   * paired with, so the name gate can compare names strictly instead of
   * inferring agreement from the pairing (Codex, Sep 7). */
  pairedDescriptions?: Record<string, string>;
  costUsd: number;
  checkedAt: string;
  /** A failed shape check cannot supply agreement or asset-name evidence. */
  failed?: string | null;
}

export interface SecondReadLog {
  version: 1;
  model: typeof SECOND_READ_MODEL;
  generatedAt: string;
  filings: Record<string, SecondReadFiling>;
}

export function readSecondReadLog(file = SECOND_READ_LOG_PATH): SecondReadLog | null {
  if (!existsSync(file)) return null;
  try {
    const log = JSON.parse(readFileSync(file, "utf-8")) as SecondReadLog;
    for (const [url, filing] of Object.entries(log.filings)) {
      log.filings[url] = withholdFailedEvidence(filing);
    }
    return log;
  } catch {
    return null;
  }
}

/** Old logs omitted `failed` but kept its diagnostic. Apply the same rule
 * when reading those logs, so rebuilding verification cannot revive an
 * agreement from a rejected read. The raw cache remains the diagnostic. */
function withholdFailedEvidence(entry: SecondReadFiling): SecondReadFiling {
  const failed = entry.failed || entry.differences.find((d) => d.startsWith("second read failed the shape gate"));
  if (!failed) return entry;
  return {
    ...entry,
    failed,
    agreedIndexes: [],
    disputedIndexes: [],
    unreadIndexes: Array.from({ length: entry.rowsPrimary }, (_, i) => i),
    pairedDescriptions: {},
  };
}

export function writeSecondReadLog(log: SecondReadLog, file = SECOND_READ_LOG_PATH): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(log, null, 2) + "\n");
  renameSync(tmp, file);
}

type Row = Pick<Transaction, "description" | "type" | "date" | "amount" | "lateFilingFlag">;

/**
 * Compare the second model's rows to the primary's. Never by position
 * alone: a model that skipped one row and invented another would then
 * line up by accident. Each primary row is paired with a second-read row
 * that names the same asset (description normalized: case, punctuation
 * and a trailing symbol ignored), preferring one whose tuple also agrees.
 * Unpaired primary rows are unread; unpaired second rows are extras a
 * person looks at, because they may be rows the primary missed.
 */
/**
 * Name one primary row for a person. The primary rows are the parse
 * record in document order, and a record can hold rows the filing does
 * not number (an amendment's Exhibit A, a cover-sheet table), so a
 * position in the record is not a printed row number. (Sep 6: "row 101"
 * in a report was read as a printed row and sent to a person; the printed
 * row was 97.) With the record's page units the label carries the page;
 * the printed row is for the person to find on that page.
 */
export function describePrimaryIndex(i: number, units?: Array<{ first: number; last: number; transactions: unknown[] }> | null): string {
  const position = `position ${i + 1} of the parse record`;
  if (!units || units.length === 0) return position;
  let start = 0;
  for (const u of units) {
    const n = u.transactions.length;
    if (i < start + n) {
      const page = u.first === u.last ? `page ${u.first}` : `pages ${u.first}-${u.last}`;
      return `${page}, ${position}`;
    }
    start += n;
  }
  return position;
}

export function compareSecondRead(
  primary: Row[],
  second: Row[],
  label: (i: number) => string = (i) => describePrimaryIndex(i)
): Pick<SecondReadFiling, "agreedIndexes" | "disputedIndexes" | "unreadIndexes" | "extraRows" | "differences" | "pairedDescriptions"> {
  const agreedIndexes: number[] = [];
  const disputedIndexes: number[] = [];
  const unreadIndexes: number[] = [];
  const differences: string[] = [];
  const pairedDescriptions: Record<string, string> = {};
  const usedSecond = new Set<number>();
  const byDesc = new Map<string, number[]>();
  second.forEach((r, i) => {
    const k = normalizedDescription(r.description);
    (byDesc.get(k) ?? byDesc.set(k, []).get(k)!).push(i);
  });
  const leftover: number[] = [];
  primary.forEach((p, i) => {
    const want = comparedTuple(p);
    const bucket = (byDesc.get(normalizedDescription(p.description)) ?? []).filter((j) => !usedSecond.has(j));
    if (bucket.length === 0) {
      leftover.push(i);
      return;
    }
    // Prefer the row at the same position when it is in the bucket: a
    // read that keeps the filing's row order (a person reading page by
    // page) then pairs row for row, and a repeated asset name never
    // steals a later row's partner.
    const exactAll = bucket.filter((j) => comparedTuple(second[j]) === want);
    const exact = exactAll.includes(i) ? i : exactAll[0];
    const j = exact ?? (bucket.includes(i) ? i : bucket[0]);
    usedSecond.add(j);
    pairedDescriptions[String(i)] = second[j].description;
    if (exact !== undefined) agreedIndexes.push(i);
    else {
      disputedIndexes.push(i);
      if (differences.length < 60) differences.push(`${label(i)}: second model [${comparedTuple(second[j])}] vs primary [${want}] for "${p.description}"`);
    }
  });
  // Second pass for rows whose names did not match exactly: pair on the
  // trade tuple when that tuple is unique among the leftovers on both
  // sides AND the names still share a distinctive word (so Apple never
  // pairs with Microsoft). Wording differences are then wording, not an
  // unread row plus an extra one.
  const leftoverSecond = second.map((_, j) => j).filter((j) => !usedSecond.has(j));
  const countP = new Map<string, number>();
  for (const i of leftover) countP.set(comparedTuple(primary[i]), (countP.get(comparedTuple(primary[i])) ?? 0) + 1);
  const countS = new Map<string, number>();
  for (const j of leftoverSecond) countS.set(comparedTuple(second[j]), (countS.get(comparedTuple(second[j])) ?? 0) + 1);
  for (const i of leftover) {
    const t = comparedTuple(primary[i]);
    // Same position, name shares a word: the wording differs but it is
    // the same printed row. Agree on the tuple or dispute it; never
    // count it as unread plus extra.
    if (i < second.length && !usedSecond.has(i) && sharesAssetWord(primary[i].description, second[i].description)) {
      usedSecond.add(i);
      pairedDescriptions[String(i)] = second[i].description;
      if (comparedTuple(second[i]) === t) agreedIndexes.push(i);
      else {
        disputedIndexes.push(i);
        if (differences.length < 60) differences.push(`${label(i)}: second model [${comparedTuple(second[i])}] vs primary [${t}] for "${primary[i].description}"`);
      }
      continue;
    }
    const j = countP.get(t) === 1 && countS.get(t) === 1 ? leftoverSecond.find((x) => !usedSecond.has(x) && comparedTuple(second[x]) === t) : undefined;
    if (j !== undefined && sharesAssetWord(primary[i].description, second[j].description)) {
      usedSecond.add(j);
      pairedDescriptions[String(i)] = second[j].description;
      agreedIndexes.push(i);
    } else {
      unreadIndexes.push(i);
    }
  }
  disputedIndexes.sort((a, b) => a - b);
  agreedIndexes.sort((a, b) => a - b);
  unreadIndexes.sort((a, b) => a - b);
  const extraRows = second
    .map((r, j) => ({ r, j }))
    .filter(({ j }) => !usedSecond.has(j))
    .map(({ r }) => ({ description: r.description, type: r.type, date: r.date, amount: r.amount, lateFilingFlag: !!r.lateFilingFlag }));
  return { agreedIndexes, disputedIndexes, unreadIndexes, extraRows, pairedDescriptions, differences };
}

/**
 * Read one filing with the second model and compare it to the primary
 * rows. Shared by the batch script and the ingest's publication gate.
 * Reads the keyed cache first; a paid call goes through `read`, which the
 * caller supplies so this module never imports the provider client.
 */
export async function secondReadFiling(input: {
  slug: string;
  pdfPath: string;
  pdfSha256: string;
  sourceUrl: string;
  candidateSha256: string;
  primary: Row[];
  /** The primary record's page units, when it was read in chunks, so a
   * difference can name the page. */
  primaryUnits?: Array<{ first: number; last: number; transactions: unknown[] }> | null;
  units: Array<{ path: string; chunk: { first: number; last: number } | null }>;
  parserVersion: string;
  systemPrompt: string;
  extractionPrompt: string;
  read: (unitPath: string) => Promise<{ transactions: unknown[]; tokenUsage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number } }>;
  onSpend?: (usd: number) => Promise<void>;
  onProgress?: () => void;
}): Promise<SecondReadFiling & { failed: string | null }> {
  const second: Row[] = [];
  let cost = 0;
  let rowsSecond = 0;
  const failures: string[] = [];
  for (const unit of input.units) {
    const keyInput: ParseCacheKeyInput = {
      pdfSha256: input.pdfSha256, sourceUrl: input.sourceUrl, chunk: unit.chunk,
      parserVersion: `${input.parserVersion}+${SECOND_READ_INPUT}`, promptSha256: promptHash(input.systemPrompt, input.extractionPrompt), model: SECOND_READ_MODEL,
    };
    // Older reads sent PDF files. Valid legacy reads without any amounts
    // fall back to images. Invalid legacy reads stay held for review;
    // finding a bad cache must not silently trigger another paid call.
    const fileBased = readParseCache(unit.path, { ...keyInput, parserVersion: input.parserVersion });
    const usableFileBased = fileBased && (
      !validateParsedRows(fileBased.transactions).ok ||
      fileBased.transactions.length === 0 ||
      (fileBased.transactions as Row[]).some((r) => r.amount !== null)
    );
    const cached = readParseCache(unit.path, keyInput) ?? (usableFileBased ? fileBased : null);
    let transactions: unknown[];
    if (cached) {
      transactions = cached.transactions;
    } else {
      let result: Awaited<ReturnType<typeof input.read>> | null = null;
      for (let attempt = 1; attempt <= 6; attempt++) {
        try {
          result = await input.read(unit.path);
          break;
        } catch (err) {
          const msg = String((err as Error)?.message ?? err);
          const transient = /connection|socket|ECONNRESET|ETIMEDOUT|fetch failed|other side closed|rate limit|429|5\d\d/i.test(msg);
          if (attempt === 6 || !transient) throw err;
          await new Promise((r) => setTimeout(r, Math.min(60_000, 5000 * 2 ** (attempt - 1))));
        }
      }
      if (!result) throw new Error("no result");
      cost += result.tokenUsage.estimatedCostUsd;
      if (input.onSpend) await input.onSpend(result.tokenUsage.estimatedCostUsd);
      transactions = result.transactions;
      // Preserve the response, including invalid rows, for diagnosis and
      // free replay. Validation below runs on both fresh and cached reads.
      writeParseCache(unit.path, keyInput, result);
      input.onProgress?.();
    }
    rowsSecond += transactions.length;
    const v = validateParsedRows(transactions);
    if (!v.ok) {
      failures.push(`second read failed the shape gate on ${path.basename(unit.path)}: ${v.errors.slice(0, 3).join("; ")}`);
    } else {
      second.push(...v.rows);
    }
  }
  const cmp = compareSecondRead(input.primary, second, (i) => describePrimaryIndex(i, input.primaryUnits));
  const failed = failures.length ? failures.join("\n") : null;
  const entry: SecondReadFiling = {
    slug: input.slug, pdfFile: path.basename(input.pdfPath), pdfSha256: input.pdfSha256, candidateSha256: input.candidateSha256,
    model: SECOND_READ_MODEL, rowsPrimary: input.primary.length, rowsSecond,
    ...cmp,
    ...(failed ? { differences: [failed, ...cmp.differences] } : {}),
    costUsd: Math.round(cost * 10000) / 10000,
    checkedAt: new Date().toISOString(),
    failed,
  };
  return { ...withholdFailedEvidence(entry), failed };
}

/** Insert or replace one filing's verdict and write the log atomically. */
export function recordSecondRead(entry: SecondReadFiling, sourceUrl: string, file = SECOND_READ_LOG_PATH): SecondReadLog {
  const log = readSecondReadLog(file) ?? { version: 1 as const, model: SECOND_READ_MODEL, generatedAt: new Date().toISOString(), filings: {} };
  log.filings[sourceUrl] = withholdFailedEvidence(entry);
  const next = { ...log, generatedAt: new Date().toISOString() };
  writeSecondReadLog(next, file);
  return next;
}
