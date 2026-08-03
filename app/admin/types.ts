/**
 * Data shapes shared by the admin page and its section components.
 *
 * These mirror what the /api/admin/* routes return. The digest item/trade
 * shapes are the single source of truth in lib/digest.ts; import them
 * instead of re-declaring drifting copies here.
 */
import type { DigestResult } from "@/lib/digest";

export interface PipelineRun {
  id: number;
  ranAt: string;
  trigger: string;
  status: string;
  newFilingsFound: number;
  newTransactionsParsed: number;
  errors: unknown;
  tokenUsage: { costUsd?: number } | null;
  duration: number;
  completedAt: string | null;
}

export interface ReviewItem {
  id: number;
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  confidence: number | null;
  pdfSource: string | null;
  officialName: string;
  officialSlug: string;
}

export interface AlertSignup {
  id: number;
  email: string;
  alertType: string;
  sourcePage: string | null;
  officialSlug: string | null;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Follows breakdown for the current draft: how many confirmed subscribers this
// digest reaches (follow-all plus followers of officials in the draft) vs.
// excludes, with per-official follower counts.
export interface FollowsBreakdown {
  total: number;
  allFollowers: number;
  reached: number;
  excluded: number;
  byOfficial: Record<string, number>;
}

export interface DigestPreview {
  draft: DigestResult;
  /** LLM-drafted lede for this exact filing set; null when none generated. */
  lede: string | null;
  recipientCount: number;
  follows: FollowsBreakdown;
  production: boolean;
  inFlightRun: {
    id: number;
    status: string;
    chunks: { total: number; ok: number; failed: number };
  } | null;
  lastSentAt: string | null;
  warning: string | null;
}

export interface DigestSendResult {
  status?:
    | "sent"
    | "failed"
    | "already-sent"
    | "no-recipients"
    | "test-sent"
    | "test-failed"
    | "test-empty";
  empty?: boolean;
  recipientCount?: number;
  filingCount?: number;
  officialCount?: number;
  runId?: number;
  follows?: FollowsBreakdown;
  to?: string;
  // Set on a single-official test preview so the report can name it.
  onlyOfficial?: string | null;
  error?: string;
  retry?: boolean;
  warning?: string | null;
  chunks?: { total: number; ok: number; failed: number };
  message?: string;
}

export interface DbValidationReport {
  result: "PASS" | "FAIL";
  duration: string;
  officials: number;
  transactions: number;
  needsReview: number;
  totalIssues: number;
  checks: Record<string, number>;
}

export interface OgeCheckReport {
  ok: boolean;
  duration?: string;
  totalOgeRecords?: number;
  runId?: number;
  error?: string;
}

export interface AdminStats {
  officials: number;
  transactions: number;
  newsArticles: number;
  needsReview: number;
  totalPipelineCost: number;
  lastPipelineRun: PipelineRun | null;
}
