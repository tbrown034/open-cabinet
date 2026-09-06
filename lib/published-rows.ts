/**
 * The rows "Ask the data" is allowed to see, and the rows it is not.
 *
 * Open Cabinet publishes every row it has parsed, each carrying its own
 * verification state (lib/row-verification.ts). The question box is held to a
 * stricter line than the site: it answers only from rows that something other
 * than the first model has confirmed. A row qualifies when its verification
 * score is 2 or better and its state is not "disputed" — a program read the
 * same values, a second company's model read the same values, or a page audit
 * or a person confirmed it.
 *
 * Everything else is kept here too, in `pendingRows`. That is what lets an
 * answer tell the difference between "we do not track this person" and "we
 * track this person and none of it has been checked yet." Those are opposite
 * statements about the same site, and the first one was wrong about the
 * largest official on it.
 *
 * The roster is the whole officials index, not just the officials with a
 * verified row, so the planner can recognize any tracked name.
 */
import { getAllOfficials, getOfficialsIndex } from "./data";
import { displayName } from "./format";
import { recordIdsFor, readRowVerification, type VerificationState } from "./row-verification";
import { resolveTicker } from "./assets";
import { resolveSymbol } from "./asset-registry";
import type { AmountRange, TransactionType } from "./types";

export interface PublishedRow {
  /** The row's record id, the same hash the verification file is keyed by. */
  id: string;
  /** Display form, "First Last". */
  officialName: string;
  officialSlug: string;
  agency: string;
  title: string;
  description: string;
  /** Resolved symbol, or null when the filing named no usable symbol. */
  ticker: string | null;
  type: TransactionType;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  amount: AmountRange | null;
  lateFilingFlag: boolean;
  sourceUrl: string | null;
  verificationState: VerificationState;
}

/** A parsed row no independent check has cleared. Never answered from. */
export interface PendingRow extends PublishedRow {
  pending: "underReview" | "notYetChecked";
}

export interface OfficialRef {
  slug: string;
  /** Display form, "First Last". */
  name: string;
  /** The stored form, "Last, First". */
  filedName: string;
  title: string;
  agency: string;
  /** A prior-administration holdover, kept for reference. */
  former?: boolean;
  /** Rows of this official the question box may answer from. */
  publishedRowCount?: number;
}

export interface PublishedRowsSummary {
  /** Rows the question box may answer from. */
  published: number;
  /** Rows a check disagreed on; a person decides. */
  underReview: number;
  /** Rows one model read and nothing has compared. */
  notYetChecked: number;
}

export interface PublishedRowsData {
  rows: PublishedRow[];
  /** Rows that exist on the site but have not cleared a check. */
  pendingRows: PendingRow[];
  summary: PublishedRowsSummary;
  /** Every tracked official, whether or not any row of theirs is verified. */
  officials: OfficialRef[];
  /** Every symbol present in the published rows, sorted. */
  tickers: string[];
  /**
   * Symbols in any row the site holds, verified or not. Resolution uses this
   * so a question about a symbol only pending rows mention reaches the
   * pending count instead of dying at the resolver (Codex, Sept. 6).
   */
  allTickers: string[];
}

/** A row is answerable only when an independent check agreed with it. */
export function isPublishable(score: number, state: VerificationState): boolean {
  return score >= 2 && state !== "disputed";
}

let cached: Promise<PublishedRowsData> | null = null;

export function resetPublishedRowsCache(): void {
  cached = null;
}

export function getPublishedRows(): Promise<PublishedRowsData> {
  if (!cached) cached = build();
  return cached;
}

async function build(): Promise<PublishedRowsData> {
  const [officials, index] = await Promise.all([
    getAllOfficials(),
    getOfficialsIndex(),
  ]);
  const verification = readRowVerification();
  const rows: PublishedRow[] = [];
  const pendingRows: PendingRow[] = [];
  const summary: PublishedRowsSummary = {
    published: 0,
    underReview: 0,
    notYetChecked: 0,
  };
  const publishedBySlug = new Map<string, number>();
  const tickers = new Set<string>();
  const allTickers = new Set<string>();

  for (const official of officials) {
    const ids = recordIdsFor(official.transactions);
    official.transactions.forEach((tx, i) => {
      const id = ids[i];
      const record = verification?.rows[id] ?? null;
      const resolved = resolveTicker(tx.description, tx.ticker ?? null);
      const ticker = resolved.ticker ? resolveSymbol(resolved.ticker) : null;
      if (ticker) allTickers.add(ticker);

      const base: PublishedRow = {
        id,
        officialName: displayName(official.name),
        officialSlug: official.slug,
        agency: official.agency,
        title: official.title,
        description: tx.description,
        ticker,
        type: tx.type,
        date: tx.date,
        amount: tx.amount,
        lateFilingFlag: tx.lateFilingFlag,
        sourceUrl: tx.sourceUrl ?? record?.sourceUrl ?? null,
        // No verification file, or no entry for this row, is the same
        // standing as a single read: nothing has compared it.
        verificationState: record?.state ?? "single_read",
      };

      if (record && record.state !== "disputed" && isPublishable(record.score, record.state)) {
        summary.published += 1;
        publishedBySlug.set(official.slug, (publishedBySlug.get(official.slug) ?? 0) + 1);
        if (ticker) tickers.add(ticker);
        rows.push(base);
        return;
      }

      const pending = record?.state === "disputed" ? "underReview" : "notYetChecked";
      summary[pending] += 1;
      pendingRows.push({ ...base, pending });
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));

  // The roster the planner is shown: everyone the site tracks, including
  // prior-administration holdovers, so a tracked name is never reported as
  // absent from the data.
  const roster: OfficialRef[] = index.officials.map((entry) => ({
    slug: entry.slug,
    name: displayName(entry.name),
    filedName: entry.name,
    title: entry.title,
    agency: entry.agency,
    former: entry.formerOfficial === true,
    publishedRowCount: publishedBySlug.get(entry.slug) ?? 0,
  }));
  roster.sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    pendingRows,
    summary,
    officials: roster,
    tickers: Array.from(tickers).sort(),
    allTickers: Array.from(allTickers).sort(),
  };
}
