export type TransactionType =
  | "Sale"
  | "Sale (Partial)"
  | "Sale (Full)"
  | "Purchase"
  | "Exchange";

export type AmountRange =
  | "$1,001-$15,000"
  | "$15,001-$50,000"
  | "$50,001-$100,000"
  | "$100,001-$250,000"
  | "$250,001-$500,000"
  | "$500,001-$1,000,000"
  | "$1,000,001-$5,000,000"
  | "$5,000,001-$25,000,000"
  | "$25,000,001-$50,000,000"
  | "Over $50,000,000";

export type GovernmentLevel = "Cabinet" | "Sub-Cabinet" | "Senior Staff";

export type DataStatus = "parsed" | "metadata-only";

export interface Transaction {
  description: string;
  ticker: string | null;
  type: TransactionType;
  date: string; // ISO date string YYYY-MM-DD
  amount: AmountRange;
  lateFilingFlag: boolean;
  notes?: string;
}

export interface SourceFiling {
  date: string;
  url: string;
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
  // Independent of mostRecentFilingDate (which is the OGE post date) so
  // backfills of older filings still surface as "new on the site."
  lastIngestedDate?: string;
  // Number of transactions added in the most recent ingest (0 if no
  // additions this round — surfaces a per-filing delta on the page banner).
  lastIngestedNewCount?: number;
  party?: "R" | "D" | "I";
  photoUrl?: string;
  ogeProfileUrl?: string;
  summary?: string;
  confirmedDate?: string;
  tookOfficeDate?: string; // For President (inaugurated, not confirmed)
  ethicsAgreementDate?: string;
  departedDate?: string | null;
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
  dataStatus: DataStatus;
}

export interface OfficialsIndex {
  lastUpdated: string;
  officials: OfficialIndexEntry[];
}
