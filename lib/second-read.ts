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
import { normalizedDescription } from "./reverify-diff";
import type { Transaction } from "./types";

export const SECOND_READ_LOG_PATH = path.resolve("data/meta/second-read-log.json");
export const SECOND_READ_MODEL = "gpt-6-astra" as const;

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
  extraRows: Array<{ description: string; type: string; date: string; amount: string | null; lateFilingFlag: boolean }>;
  differences: string[];
  costUsd: number;
  checkedAt: string;
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
    return JSON.parse(readFileSync(file, "utf-8")) as SecondReadLog;
  } catch {
    return null;
  }
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
export function compareSecondRead(primary: Row[], second: Row[]): Pick<SecondReadFiling, "agreedIndexes" | "disputedIndexes" | "unreadIndexes" | "extraRows" | "differences"> {
  const agreedIndexes: number[] = [];
  const disputedIndexes: number[] = [];
  const unreadIndexes: number[] = [];
  const differences: string[] = [];
  const usedSecond = new Set<number>();
  const byDesc = new Map<string, number[]>();
  second.forEach((r, i) => {
    const k = normalizedDescription(r.description);
    (byDesc.get(k) ?? byDesc.set(k, []).get(k)!).push(i);
  });
  primary.forEach((p, i) => {
    const want = comparedTuple(p);
    const bucket = (byDesc.get(normalizedDescription(p.description)) ?? []).filter((j) => !usedSecond.has(j));
    if (bucket.length === 0) {
      unreadIndexes.push(i);
      return;
    }
    const exact = bucket.find((j) => comparedTuple(second[j]) === want);
    const j = exact ?? bucket[0];
    usedSecond.add(j);
    if (exact !== undefined) agreedIndexes.push(i);
    else {
      disputedIndexes.push(i);
      if (differences.length < 60) differences.push(`row ${i + 1}: second model [${comparedTuple(second[j])}] vs primary [${want}] for "${p.description}"`);
    }
  });
  const extraRows = second
    .map((r, j) => ({ r, j }))
    .filter(({ j }) => !usedSecond.has(j))
    .map(({ r }) => ({ description: r.description, type: r.type, date: r.date, amount: r.amount, lateFilingFlag: !!r.lateFilingFlag }));
  return { agreedIndexes, disputedIndexes, unreadIndexes, extraRows, differences };
}
