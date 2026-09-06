import { existsSync, readFileSync } from "fs";
import path from "path";
import { getOfficialBySlug } from "@/lib/data";
import { hashRows, readCrosscheckLog } from "@/lib/crosscheck-log";
import { readGrokAuditLog } from "@/lib/grok-audit";
import { findParseRecord, promptHash } from "@/lib/parse-cache";
import { listOpenReviews, REVIEW_QUEUE_PATH, type ReviewItem } from "@/lib/review-queue";
import {
  locateInParseRecord, readReviewDecisions, readRowVerification, recordIdsFor,
  resetRowVerificationCache, type RowVerification,
} from "@/lib/row-verification";
import { readSecondReadLog } from "@/lib/second-read";
import type { Transaction } from "@/lib/types";
import { DEFAULT_MODEL, EXTRACTION_PROMPT, PARSER_VERSION, SYSTEM_PROMPT } from "@/scripts/parse-pdf";

type LaneDetail = { audit?: string; second?: string; unavailable?: string };
type CandidateRow = Parameters<typeof locateInParseRecord>[1][number];

export async function loadReviewData() {
  // The exported loader caches within a process; a local CLI rebuild can
  // happen between requests, so read fresh states for this review page.
  resetRowVerificationCache();
  const verification = readRowVerification();
  const disputed = Object.values(verification?.rows ?? {}).filter((row) => row.score === 0);
  const held = listOpenReviews();
  const decisions = readReviewDecisions();
  const queue: ReviewItem[] = existsSync(REVIEW_QUEUE_PATH)
    ? JSON.parse(readFileSync(REVIEW_QUEUE_PATH, "utf-8")) : [];
  const crosscheck = readCrosscheckLog();
  const audit = readGrokAuditLog();
  const second = readSecondReadLog();
  const bySlug = new Map<string, RowVerification[]>();
  for (const row of disputed) {
    const rows = bySlug.get(row.slug) ?? [];
    rows.push(row);
    bySlug.set(row.slug, rows);
  }

  const groups = await Promise.all([...bySlug].map(async ([slug, rows]) => {
    const official = await getOfficialBySlug(slug);
    const transactions = official?.transactions ?? [];
    const ids = recordIdsFor(transactions);
    const byId = new Map(ids.map((id, i) => [id, transactions[i]]));
    const details = new Map<Transaction, LaneDetail>();
    const urls = new Set(rows.map((row) => byId.get(row.id)?.sourceUrl).filter((url): url is string => !!url));
    for (const url of urls) {
      const filingRows = transactions.filter((row) => row.sourceUrl === url);
      const entry = crosscheck?.entries.findLast((item) => item.slug === slug && item.sourceUrl === url);
      const pdfPath = path.join(process.cwd(), "data", "pdfs", decodeURIComponent(url.split("/").pop() || "filing.pdf"));
      const record = entry?.pdfSha256 && existsSync(pdfPath) ? findParseRecord(pdfPath, {
        pdfSha256: entry.pdfSha256, sourceUrl: url, parserVersion: PARSER_VERSION,
        promptSha256: promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT), model: DEFAULT_MODEL,
      }) : null;
      if (!record) {
        filingRows.forEach((row) => details.set(row, { unavailable: "Parse record unavailable; lane detail cannot be matched to this published row." }));
        continue;
      }
      const candidateHash = hashRows(record.transactions);
      const positions = locateInParseRecord(filingRows, record.transactions as CandidateRow[]);
      filingRows.forEach((row, i) => {
        const index = positions[i];
        if (index < 0) {
          details.set(row, { unavailable: "Published row not found in the parse record; lane detail is unavailable." });
          return;
        }
        const audited = audit?.filings[url];
        const reread = second?.filings[url];
        const detail: LaneDetail = {};
        const sameCandidate = (lane: { candidateSha256: string; pdfSha256: string; slug: string }) =>
          lane.slug === slug && lane.pdfSha256 === entry?.pdfSha256 &&
          lane.candidateSha256 === entry?.candidateSha256 && lane.candidateSha256 === candidateHash;
        const lineForRow = (lines: string[]) => lines.find((line) => line.startsWith(`row ${index + 1}:`));
        if (audited && sameCandidate(audited)) {
          if (audited.disputedIndexes.includes(index)) detail.audit = lineForRow(audited.differences) ?? "Audit disputed this row; no pageShows detail was saved.";
          else if (audited.notFoundIndexes.includes(index)) detail.audit = "Audit could not find this row on the filing pages.";
          else if (audited.confirmedIndexes.includes(index)) detail.audit = "Audit confirmed this row against the page image.";
        }
        if (reread && sameCandidate(reread)) {
          if (reread.disputedIndexes.includes(index)) detail.second = lineForRow(reread.differences) ?? "Second model disputed this row; no difference line was saved.";
          else if (reread.unreadIndexes.includes(index)) detail.second = "Second model produced no counterpart for this row.";
          else if (reread.agreedIndexes.includes(index)) detail.second = "Second model agreed with this row.";
        }
        if ((audited && !sameCandidate(audited)) || (reread && !sameCandidate(reread))) {
          detail.unavailable = "Some lane detail belongs to a different candidate or PDF and is not shown.";
        }
        details.set(row, detail);
      });
    }
    return {
      slug, name: official?.name ?? slug,
      rows: rows.map((verification) => {
        const transaction = byId.get(verification.id);
        return {
          verification, transaction, decision: decisions.get(verification.id),
          detail: transaction ? details.get(transaction) ?? { unavailable: "Parse record unavailable; no source filing is attached to this row." } : null,
        };
      }),
    };
  }));
  return {
    held, groups, disputedCount: disputed.length, verificationAvailable: !!verification,
    decisionCount: decisions.size + queue.filter((item) => item.status === "decided").length,
  };
}
