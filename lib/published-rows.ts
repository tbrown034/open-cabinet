/**
 * The rows "Ask the data" is allowed to see, and the rows it is not.
 *
 * Open Cabinet publishes every row it has parsed, each carrying its own
 * verification state (lib/row-verification.ts). The question box answers only
 * from CHECKED rows, and "checked" here means exactly what it means in the
 * site's tables and on the methodology page: score 3. An independent program
 * or a second company's model agreed with the row AND a third company's model
 * confirmed it against the page image, or a person compared it to the filing.
 *
 * It used to mean score 2 or better, which the box called "verified." Grok
 * caught that on Sept. 6 and was right: the rest of the site reserves
 * "checked" for a higher bar, so a reader who had seen a table would hear a
 * stronger claim than the code made. One word, one meaning, site-wide.
 *
 * Everything else is kept here too, in `pendingRows`. That is what lets an
 * answer tell the difference between "we do not track this person" and "we
 * track this person and none of it has been checked yet." Those are opposite
 * statements about the same site, and the first one was wrong about the
 * largest official on it.
 *
 * The roster is the whole officials index, so the planner recognizes any
 * tracked name, holdovers included. Their ROWS are a different question. The
 * homepage directory and every headline total exclude prior-administration
 * holdovers, so the box excludes them too and says so when asked: one site,
 * one universe (Grok, Sept. 6). A holdover still resolves by name, and the
 * answer explains the scope rather than reporting a silent zero.
 */
import { getOfficialBySlug, getOfficialsIndex } from "./data";
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
  /** ISO date, or null when the filing prints no date for the row. */
  date: string | null;
  amount: AmountRange | null;
  lateFilingFlag: boolean;
  sourceUrl: string | null;
  verificationState: VerificationState;
}

/**
 * A parsed row that is not checked. Never answered from, always counted.
 * Three states, because they mean different things to a reader: a check
 * disagreed, a check agreed but the page audit has not run, or nothing has
 * compared it yet.
 */
export type PendingState = "underReview" | "auditPending" | "notYetCompared";

export interface PendingRow extends PublishedRow {
  pending: PendingState;
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
  /** Checked rows of this official; what the box can answer from. */
  checkedRowCount?: number;
}

export interface PublishedRowsSummary {
  /** Rows the question box may answer from: score 3. */
  checked: number;
  /** Rows a check disagreed on; a person decides. */
  underReview: number;
  /** A program or a second model agreed; the page audit has not run. */
  auditPending: number;
  /** One model read it and nothing has compared it. */
  notYetCompared: number;
  /** Every parsed row, the denominator a reader needs. */
  parsed: number;
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

/**
 * A row is answerable only when it is checked, the site's own word for
 * score 3: an independent program or a second company's model agreed AND the
 * page audit confirmed it, or a person did.
 */
export function isChecked(score: number, state: VerificationState): boolean {
  return score === 3 && (state === "checked" || state === "human_verified");
}

/** Which pile a row that is not checked belongs in. */
export function pendingStateFor(
  score: number,
  state: VerificationState
): PendingState {
  if (state === "disputed") return "underReview";
  if (score === 2) return "auditPending";
  return "notYetCompared";
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
  const index = await getOfficialsIndex();
  // Every official the index lists as parsed, holdovers included.
  const officials = (
    await Promise.all(
      index.officials
        // Holdovers stay on the roster for recognition, but their rows are
        // out of scope, exactly as they are in the homepage directory.
        .filter((entry) => entry.dataStatus === "parsed" && !entry.formerOfficial)
        .map((entry) => getOfficialBySlug(entry.slug))
    )
  ).filter((o): o is NonNullable<typeof o> => o !== null);
  const verification = readRowVerification();
  const rows: PublishedRow[] = [];
  const pendingRows: PendingRow[] = [];
  const summary: PublishedRowsSummary = {
    checked: 0,
    underReview: 0,
    auditPending: 0,
    notYetCompared: 0,
    parsed: 0,
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

      summary.parsed += 1;

      if (record && isChecked(record.score, record.state)) {
        summary.checked += 1;
        publishedBySlug.set(official.slug, (publishedBySlug.get(official.slug) ?? 0) + 1);
        if (ticker) tickers.add(ticker);
        rows.push(base);
        return;
      }

      const pending = pendingStateFor(record?.score ?? 1, record?.state ?? "single_read");
      summary[pending] += 1;
      pendingRows.push({ ...base, pending });
    });
  }

  // Newest first; rows with no printed date sort last.
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

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
