export type TransactionType =
  | "Sale"
  | "Sale (Partial)"
  | "Sale (Full)"
  | "Purchase"
  | "Exchange";

import type { AmountRange } from "./amounts";
export type { AmountRange } from "./amounts";

export type GovernmentLevel = "Cabinet" | "Sub-Cabinet" | "Senior Staff";

export type DataStatus = "parsed" | "metadata-only";

export interface Transaction {
  description: string;
  ticker: string | null;
  type: TransactionType;
  date: string; // ISO date string YYYY-MM-DD
  /** The disclosed dollar range, or null when the filing states the value
   * could not be determined ("Value not readily ascertainable"). Unknown
   * rows are excluded from every dollar total and counted separately. */
  amount: AmountRange | null;
  /** The filing's own wording when amount is null. */
  amountNote?: string;
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
