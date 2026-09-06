import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { OfficialData, Transaction } from "@/lib/types";
import { getOfficialBySlug, getOfficialsIndex } from "@/lib/data";
import { verificationForOfficial, type RowVerification } from "@/lib/row-verification";
import OfficialPage from "./page";

vi.mock("@/lib/data", () => ({ getOfficialBySlug: vi.fn(), getOfficialsIndex: vi.fn() }));
vi.mock("@/lib/row-verification", () => ({ verificationForOfficial: vi.fn() }));
vi.mock("@/lib/news", () => ({ getNewsForOfficial: async () => [] }));
vi.mock("@/lib/fee-payments", () => ({ getFeePaymentsBySlug: async () => [] }));
vi.mock("@/lib/divestiture", () => ({ getDivestitureData: async () => null }));
vi.mock("@/lib/source-docs", () => ({ getSourceDocuments: async () => null }));
// Keep the real server table; unrelated client charts and controls are outside this test.
vi.mock("@/app/components/transaction-timeline", () => ({ default: () => null }));
vi.mock("@/app/components/monthly-bars", () => ({ default: () => null }));
vi.mock("@/app/components/range-filter", () => ({ default: () => null }));
vi.mock("@/app/components/transaction-filters", () => ({ default: () => null }));
vi.mock("@/app/components/pagination", () => ({ default: () => null }));
vi.mock("@/app/components/view-toggle", () => ({ default: () => null }));
vi.mock("@/app/components/official-avatar", () => ({ default: () => null }));
vi.mock("@/app/components/alert-signup-form", () => ({ default: () => null }));

let transactions: Transaction[];
beforeEach(() => {
  transactions = Array.from({ length: 104 }, (_, i) => ({
    description: i < 2 ? "Identical lot" : `Trade ${i}`,
    ticker: null, type: i === 103 ? "Sale" : "Purchase",
    date: new Date(Date.UTC(2026, 0, Math.max(i, 1))).toISOString().slice(0, 10),
    amount: "$1,001-$15,000", lateFilingFlag: false,
  }));
  vi.mocked(getOfficialBySlug).mockResolvedValue({
    name: "Example, Person", slug: "example-person", title: "Secretary", agency: "Example",
    level: "Cabinet", filingType: "278-T", mostRecentFilingDate: "2026-05-01", transactions,
  } satisfies OfficialData);
  vi.mocked(getOfficialsIndex).mockResolvedValue({ lastUpdated: "2026-05-01", officials: [] });
  vi.mocked(verificationForOfficial).mockImplementation((_slug, rows) => rows.map((_tx, i) => ({
    id: `row-${i}`, slug: "example-person", score: i === 0 ? 0 : i === 1 ? 3 : 1,
    state: i === 0 ? "disputed" : i === 1 ? "deterministic_agree" : "single_read",
    lane: null, sourceUrl: null, note: `Recorded note ${i}`,
  } satisfies RowVerification)));
});

it("keeps duplicate-lot verdicts attached through filtering, date sorting and pagination", async () => {
  const html = renderToStaticMarkup(await OfficialPage({
    params: Promise.resolve({ slug: "example-person" }),
    searchParams: Promise.resolve({ type: "purchase", page: "2" }),
  }));
  expect(verificationForOfficial).toHaveBeenCalledWith("example-person", transactions);
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
  const rows = [...body.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((match) => match[0]);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain("Trade 2");
  expect(rows[0]).toContain(">Not yet checked</summary>");
  expect(rows[1]).toContain("Identical lot");
  expect(rows[1]).toContain(">Under review</summary>");
  expect(rows[1]).toContain("bg-amber-50");
  expect(rows[1]).toContain("Recorded note 0</p>");
  expect(rows[2]).toContain("Identical lot");
  expect(rows[2]).toContain(">Checked</summary>");
  expect(rows[2]).toContain("Recorded note 1</p>");
});

it("still marks every displayed row when verification data is missing", async () => {
  vi.mocked(verificationForOfficial).mockReturnValue(transactions.map(() => null));
  const html = renderToStaticMarkup(await OfficialPage({
    params: Promise.resolve({ slug: "example-person" }),
    searchParams: Promise.resolve({ type: "sale" }),
  }));
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
  expect(body).toContain("Trade 103");
  expect(body).toContain(">Not yet checked</summary>");
  expect(body).toContain("No verification record is available for this row");
});
