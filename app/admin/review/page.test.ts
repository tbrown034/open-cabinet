import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { beforeEach, expect, it, vi } from "vitest";
import { getOfficialBySlug } from "@/lib/data";
import { hashRows, readCrosscheckLog, type CrosscheckEntry } from "@/lib/crosscheck-log";
import { readGrokAuditLog, type GrokAuditFiling } from "@/lib/grok-audit";
import { findParseRecord, promptHash } from "@/lib/parse-cache";
import { listOpenReviews, type ReviewItem } from "@/lib/review-queue";
import { readReviewDecisions, readRowVerification, recordIdsFor, type RowVerificationFile } from "@/lib/row-verification";
import { readSecondReadLog, type SecondReadFiling } from "@/lib/second-read";
import type { OfficialData, Transaction } from "@/lib/types";
import ReviewPage from "./page";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock("@/lib/data", () => ({ getOfficialBySlug: vi.fn() }));
vi.mock("@/lib/crosscheck-log", async (original) => ({ ...await original<object>(), readCrosscheckLog: vi.fn() }));
vi.mock("@/lib/grok-audit", () => ({ readGrokAuditLog: vi.fn() }));
vi.mock("@/lib/second-read", () => ({ readSecondReadLog: vi.fn() }));
vi.mock("@/lib/parse-cache", async (original) => ({ ...await original<object>(), findParseRecord: vi.fn() }));
vi.mock("@/lib/review-queue", () => ({ listOpenReviews: vi.fn(), REVIEW_QUEUE_PATH: "/fixture/review-queue.json" }));
vi.mock("@/lib/row-verification", async (original) => ({
  ...await original<object>(), readRowVerification: vi.fn(), readReviewDecisions: vi.fn(),
}));
vi.mock("@/scripts/parse-pdf", () => ({ DEFAULT_MODEL: "primary", PARSER_VERSION: "version", SYSTEM_PROMPT: "system", EXTRACTION_PROMPT: "extract" }));
vi.mock("./actions", () => ({ recordHeldDecision: vi.fn(), recordRowDecision: vi.fn(), rebuildRowStates: vi.fn() }));

const slug = "example-person";
const url = "https://www.oge.gov/Example%20Filing.pdf";
let transactions: Transaction[];
let audit: GrokAuditFiling;
let second: SecondReadFiling;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(new Headers({ host: "localhost:3003" }) as Awaited<ReturnType<typeof headers>>);
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify([{ status: "decided" }, { status: "superseded" }]));
  transactions = Array.from({ length: 2 }, () => ({
    description: "Identical lot", ticker: null, type: "Purchase", date: "2026-01-01",
    amount: "$1,001-$15,000", lateFilingFlag: true, sourceUrl: url,
  }));
  vi.mocked(getOfficialBySlug).mockResolvedValue({
    name: "Example, Person", slug, title: "Secretary", agency: "Example", level: "Cabinet",
    filingType: "278-T", mostRecentFilingDate: "2026-01-10", transactions,
  } satisfies OfficialData);
  const ids = recordIdsFor(transactions);
  vi.mocked(readRowVerification).mockReturnValue({
    version: 1, generatedAt: "2026-01-10", generatedBy: "fixture", checkerVersion: "fixture",
    summary: { rows: 2, byState: { checked: 0, human_verified: 0, deterministic_agree: 0, two_models_agree: 0, audit_only: 0, single_read: 1, disputed: 1 }, byScore: { "0": 1, "1": 1, "2": 0, "3": 0 } },
    rows: Object.fromEntries(ids.map((id, i) => [id, {
      id, slug, score: i === 0 ? 1 : 0, state: i === 0 ? "single_read" : "disputed", lane: "audit", sourceUrl: url, note: "Verification note from fixture",
    }])),
  } as RowVerificationFile);
  vi.mocked(readReviewDecisions).mockReturnValue(new Map([[ids[1], {
    recordId: ids[1], slug, decision: "rejected", evidence: "page 2, printed row 4, wrong date",
    decidedBy: "trevor", decidedAt: "2026-01-11T00:00:00.000Z",
  }]]));
  vi.mocked(listOpenReviews).mockReturnValue([{
    id: "held-one", kind: "lane_disagreement", slug, officialName: "Person Example",
    filing: { url, pdfFile: "Example Filing.pdf", date: "2026-01-10" }, holding: "All rows of the filing", status: "open", createdAt: "2026-01-10",
    problems: [{ location: { page: 2, printedRow: 4, parsedRow: 2, description: "Held asset" }, lane: "OCR", textLayerSaid: "OCR amount", modelSaid: "Model amount", detail: "Amounts disagree" },
      { location: { page: null, printedRow: null, parsedRow: null, description: null }, textLayerSaid: null, modelSaid: null, detail: "Unlocated detail line" }],
  } satisfies ReviewItem]);
  const candidateSha256 = hashRows(transactions);
  vi.mocked(findParseRecord).mockReturnValue({ source: "current", transactions });
  vi.mocked(readCrosscheckLog).mockReturnValue({
    version: 1, checkerVersion: "fixture", generatedAt: "2026-01-10", entries: [{
      slug, sourceUrl: url, pdfSha256: "pdf-hash", candidateSha256,
    } as CrosscheckEntry],
  });
  audit = { slug, pdfFile: "Example Filing.pdf", pdfSha256: "pdf-hash", candidateSha256, model: "grok-4.6", promptVersion: "fixture", rows: 2, pagesAudited: 2, costUsd: 0, checkedAt: "2026-01-10", missing: [], disputedIndexes: [1], confirmedIndexes: [0], notFoundIndexes: [], differences: ["row 1: unrelated audit detail", "row 2: page shows audit evidence"] };
  second = { slug, pdfFile: "Example Filing.pdf", pdfSha256: "pdf-hash", candidateSha256, model: "gpt-6-astra", rowsPrimary: 2, rowsSecond: 2, extraRows: [], costUsd: 0, checkedAt: "2026-01-10", disputedIndexes: [1], agreedIndexes: [0], unreadIndexes: [], differences: ["row 1: unrelated second detail", "row 2: second model difference"] };
  vi.mocked(readGrokAuditLog).mockReturnValue({ version: 1, model: "grok-4.6", generatedAt: "fixture", filings: { [url]: audit } });
  vi.mocked(readSecondReadLog).mockReturnValue({ version: 1, model: "gpt-6-astra", generatedAt: "fixture", filings: { [url]: second } });
});

async function render(params = {}) {
  return renderToStaticMarkup(await ReviewPage({ searchParams: Promise.resolve(params) }));
}

it.each(["open-cabinet.org", "preview.vercel.app", "localhost.evil.test", "127.0.0.1.evil.test", "localhost:3003@evil.test", "", "[::1]:3003"])("returns notFound before loading data for host %s", async (host) => {
  vi.mocked(headers).mockResolvedValue(new Headers({ host, "x-forwarded-host": "localhost:3003" }) as Awaited<ReturnType<typeof headers>>);
  await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(notFound).toHaveBeenCalledOnce();
  expect(listOpenReviews).not.toHaveBeenCalled();
  expect(readRowVerification).not.toHaveBeenCalled();
  expect(getOfficialBySlug).not.toHaveBeenCalled();
});

it.each(["localhost", "localhost:3003", "127.0.0.1", "127.0.0.1:3003"])("renders sections, decisions and matching duplicate-lot evidence on %s", async (host) => {
  vi.mocked(headers).mockResolvedValue(new Headers({ host }) as Awaited<ReturnType<typeof headers>>);
  const html = await render({ output: "rows 2\n  disputed 1" });
  for (const text of ["Held filings", "Disputed rows", "1 held filings · 1 disputed rows · 2 decisions recorded so far", "2026-01-10", "Page 2, printed row 4", "Held asset", "OCR amount", "Model amount", "Unlocated detail line", "Identical lot", "Purchase", "2026-01-01", "$1,001-$15,000", "Late flag</dt><dd>Yes", "Verification note from fixture", "row 2: page shows audit evidence", "row 2: second model difference", "Recorded: rejected", "Confirm as published", "Reject (needs a patch)", "Record decision", "Rebuild row states", "Rebuild output (last lines)"]) expect(html).toContain(text);
  expect(html).not.toContain("unrelated audit detail");
  expect(html).not.toContain("unrelated second detail");
  expect(html).toContain(`href="${url}"`);
  expect(html).toMatch(/name="evidence" required=""/);
  expect(findParseRecord).toHaveBeenCalledWith(path.join(process.cwd(), "data/pdfs/Example Filing.pdf"), {
    pdfSha256: "pdf-hash", sourceUrl: url, parserVersion: "version", model: "primary", promptSha256: promptHash("system", "extract"),
  });
});

it("keeps the published row visible when its parse record is unavailable", async () => {
  vi.mocked(findParseRecord).mockReturnValue(null);
  const html = await render();
  expect(html).toContain("Identical lot");
  expect(html).toContain("Parse record unavailable");
  expect(html).not.toContain("page shows audit evidence");
});

it("does not attach evidence from a stale candidate or a missing row", async () => {
  audit.candidateSha256 = "stale";
  second.pdfSha256 = "different-pdf";
  const html = await render();
  expect(html).toContain("different candidate or PDF");
  expect(html).not.toContain("page shows audit evidence");
  expect(html).not.toContain("second model difference");
  vi.mocked(findParseRecord).mockReturnValue({ source: "current", transactions: [] });
  expect(await render()).toContain("Published row not found in the parse record");
});

it("keeps orphan disputes visible without offering a decision on a missing published row", async () => {
  vi.mocked(getOfficialBySlug).mockResolvedValue(null);
  const html = await render();
  expect(html).toContain("Published row or official unavailable");
  expect(html).toContain("1 disputed rows");
  expect(html).not.toContain("Confirm as published");
});

it("renders empty sections and explains missing verification data", async () => {
  vi.mocked(listOpenReviews).mockReturnValue([]);
  vi.mocked(readRowVerification).mockReturnValue(null);
  const html = await render();
  expect(html).toContain("No open held filings");
  expect(html).toContain("Row verification file unavailable");
  expect(html).toContain("Disputed rows");
});
