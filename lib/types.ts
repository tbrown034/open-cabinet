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

export interface OfficialData {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: GovernmentLevel;
  filingType: string;
  mostRecentFilingDate: string;
  ogeProfileUrl?: string;
  transactions: Transaction[];
}

export interface OfficialIndexEntry {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: GovernmentLevel;
  transactionCount: number;
  mostRecentFilingDate: string;
  dataStatus: DataStatus;
}

export interface OfficialsIndex {
  lastUpdated: string;
  officials: OfficialIndexEntry[];
}
