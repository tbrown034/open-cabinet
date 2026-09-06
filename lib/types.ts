export type TransactionType =
  | "Sale"
  | "Sale (Partial)"
  | "Sale (Full)"
  | "Purchase"
  | "Exchange"
  /** The filing's type column did not state a type (for example "See
   * Endnote"). Allowed only with typeNote carrying the filing's wording.
   * Counted as neither a sale nor a purchase. */
  | "Unstated";

import type { AmountRange } from "./amounts";
export type { AmountRange } from "./amounts";

export type GovernmentLevel = "Cabinet" | "Sub-Cabinet" | "Senior Staff";

export type DataStatus = "parsed" | "metadata-only";

export interface Transaction {
  description: string;
  ticker: string | null;
  type: TransactionType;
  /** ISO date YYYY-MM-DD, or null when the filing prints no date for the
   * row. A null date is allowed only with dateNote, on a person's
   * decision; the row stays in the table with the note and is left out of
   * date-based charts and ranges. */
  date: string | null; // ISO date string YYYY-MM-DD
  /** The disclosed dollar range, or null when the filing states the value
   * could not be determined ("Value not readily ascertainable"). Unknown
   * rows are excluded from every dollar total and counted separately. */
  amount: AmountRange | null;
  /** The filing's own wording when amount is null. */
  amountNote?: string;
  /** The filing's own wording when type is "Unstated". */
  typeNote?: string;
  /** A person's note when the date is published as printed on the filing
   * although it cannot be right (a filing that prints the year 2225). */
  dateNote?: string;
  lateFilingFlag: boolean;
  notes?: string;
  /** URL of the filing that actually disclosed this row (stamped at ingest
   * or by backfill-tx-source.ts). When absent the UI falls back to the
   * date heuristic in getSourceFilingForTransaction. */
  sourceUrl?: string;
}

export interface SourceFiling {
  date: string;
  url: string | null;
  label: string;
}

export interface OfficialData {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: GovernmentLevel;
  filingType: string;
  mostRecentFilingDate: string;
  // When Open Cabinet's pipeline last added or updated this official's data.
  // Independent of mostRecentFilingDate, which is the OGE filing/posting date
  // for the latest tracked report and can differ from the date in the PDF
  // filename, so backfills of older filings still surface as "new on the site."
  lastIngestedDate?: string;
  // Number of transactions added in the most recent ingest (0 if no
  // additions this round — surfaces a per-filing delta on the page banner).
  lastIngestedNewCount?: number;
  // The rows the most recent ingest actually added, date-descending. The
  // digest previews these instead of guessing by transaction date — a late
  // filing can disclose an old-dated trade, so "newest rows" is not "new rows"
  // (Duffy's Feb 2025 Rumble sale surfaced in a June 2026 filing).
  lastIngestedTrades?: Transaction[];
  party?: "R" | "D" | "I";
  photoUrl?: string;
  ogeProfileUrl?: string;
  summary?: string;
  /** Who wrote the summary: the deterministic template, or a model whose
   * candidate a person approved (see lib/summary-review.ts). */
  summarySource?: "template" | "model";
  summaryModel?: string;
  /** Hash of the fact block the summary was written from. */
  summaryFactSha256?: string;
  summaryPublishedAt?: string;
  /** Set by the ingest when new rows changed the facts under a published
   * summary. The prose is behind the data until a new candidate is approved. */
  summaryStaleSince?: string;
  confirmedDate?: string;
  tookOfficeDate?: string; // For President (inaugurated, not confirmed)
  ethicsAgreementDate?: string;
  departedDate?: string | null;
  // True for prior-administration holdovers whose disclosure records are
  // retained for reference but excluded from current-roster views and the
  // site's headline totals. Their detail pages remain accessible.
  formerOfficial?: boolean;
  transactions: Transaction[];
  sourceFilings?: SourceFiling[];
}

export interface OfficialIndexEntry {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: GovernmentLevel;
  party?: "R" | "D" | "I";
  transactionCount: number;
  mostRecentFilingDate: string;
  lastIngestedDate?: string;
  // Number of new transactions added in the most recent ingest, for badge
  // copy like "+3,627 trades just added." Optional; may be 0.
  lastIngestedNewCount?: number;
  departedDate?: string | null;
  formerOfficial?: boolean;
  dataStatus: DataStatus;
}

export interface OfficialsIndex {
  lastUpdated: string;
  officials: OfficialIndexEntry[];
}

/** A transaction the filing dated. Charts, ranges and sorting by date use
 * these; an undated row (date null, with dateNote) stays in tables. */
export type DatedTransaction = Transaction & { date: string };

export function isDated(tx: Transaction): tx is DatedTransaction {
  return typeof tx.date === "string" && tx.date.length > 0;
}

export function datedRows<T extends Transaction>(rows: T[]): Array<T & { date: string }> {
  return rows.filter((t): t is T & { date: string } => typeof t.date === "string" && t.date.length > 0);
}
