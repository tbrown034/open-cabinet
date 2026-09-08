import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { readFile } from "fs/promises";
import type { OfficialData, OfficialsIndex, Transaction } from "@/lib/types";
import { getTradesByTicker, officialForTotals } from "@/lib/data";
import { verificationForOfficial, type RowVerification } from "@/lib/row-verification";
import { rowsForTotals } from "@/lib/format";
import Home from "./page";
import CompaniesPage from "./companies/page";
import CompanyPage from "./companies/[ticker]/page";
import DashboardPage from "./dashboard/page";
import AllTradesPage from "./all/page";
import LateFilingsPage from "./late-filings/page";
import OGImage from "./opengraph-image";
import MethodologyPage from "./methodology/page";
import SwimLaneChart from "./components/swim-lane-chart";
import SectorTreemap from "./components/sector-treemap";
import OfficialRankings from "./components/official-rankings";
const assetFixture = vi.hoisted(() => ({ distinguishOccurrences: false }));

vi.mock("next/og", () => ({ ImageResponse: class {
  html: string;
  constructor(element: Parameters<typeof renderToStaticMarkup>[0]) { this.html = renderToStaticMarkup(element); }
} }));
vi.mock("./components/swim-lane-chart", () => ({ default: vi.fn(() => null) }));
vi.mock("./components/sector-treemap", () => ({ default: vi.fn(() => null) }));
vi.mock("./components/official-rankings", () => ({ default: vi.fn(() => null) }));
vi.mock("./components/about-scrolly", () => ({ default: () => null }));
vi.mock("./components/pipeline-flow", () => ({ default: () => null }));

vi.mock("fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("@/lib/row-verification", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/row-verification")>()), verificationForOfficial: vi.fn() }));
vi.mock("@/lib/news", () => ({ getNewsCoverage: async () => [] }));
// Company pages take rows only from the asset resolution sidecar at the
// top tier. The fixture's three Apple rows resolve by rule R1 (printed
// symbol corroborated by the Nasdaq listing); build that sidecar from the
// real resolver so the test follows the same rules as production.
vi.mock("@/lib/asset-resolution", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/asset-resolution")>();
  const { recordIdsFor } = await vi.importActual<typeof import("@/lib/row-verification")>("@/lib/row-verification");
  return {
    ...mod,
    readAssetResolution: () => {
      const ctx = mod.defaultContext();
      const ids = recordIdsFor(transactions);
      const rows: Record<string, ReturnType<typeof mod.resolveAsset> & { slug: string }> = {};
      transactions.forEach((tx, i) => { rows[ids[i]] = { ...mod.resolveAsset(tx, ctx), slug: "example-person" }; });
      // Different types on identical occurrences expose accidental re-hashing
      // after filtering: the retained second row must keep its own asset ID.
      if (assetFixture.distinguishOccurrences) rows[ids[0]].instrumentType = "preferred";
      return { version: 1, generatedAt: "", generatedBy: "test", sources: {}, summary: { rows: 3, byType: {}, byTier: {}, byRule: {} }, rows };
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./components/hero-monthly-chart", () => ({ default: () => null }));
vi.mock("./components/official-avatar", () => ({ default: () => null }));
vi.mock("./components/alert-signup-form", () => ({ default: () => null }));
vi.mock("./components/company-bar-chart", () => ({ default: () => null }));
vi.mock("./components/officials-table", () => ({
  default: ({ officials }: { officials: OfficialsIndex["officials"] }) =>
    `Directory trades: ${officials[0].transactionCount}`,
}));

const transactions: Transaction[] = [
  { description: "Apple Inc.", ticker: "AAPL", type: "Purchase", date: "2026-01-01", amount: "$1,001-$15,000", lateFilingFlag: true },
  { description: "Apple Inc.", ticker: "AAPL", type: "Purchase", date: "2026-01-01", amount: "$1,001-$15,000", lateFilingFlag: true },
  { description: "Apple Inc.", ticker: "AAPL", type: "Sale", date: "2026-01-03", amount: "$1,001-$15,000", lateFilingFlag: false },
];
const official: OfficialData = {
  name: "Example, Person", slug: "example-person", title: "Secretary", agency: "Example",
  level: "Cabinet", filingType: "278-T", mostRecentFilingDate: "2026-05-01", transactions,
};
const index: OfficialsIndex = {
  lastUpdated: "2026-05-01",
  officials: [{ ...official, dataStatus: "parsed", transactionCount: 999 }],
};
function verdict(score: RowVerification["score"], i: number): RowVerification {
  return {
    id: `row-${i}`, slug: official.slug, score,
    state: score === 0 ? "disputed" : score === 2 ? "two_models_agree" : "single_read",
    lane: null, sourceUrl: null, note: `Verdict ${i}`,
    gates: { read1Confidence: null, text: "agree", ocr: "none", model2: "none", session: "none", audit: "none", human: null, implausible: [], name: "agree" },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  assetFixture.distinguishOccurrences = false;
  vi.mocked(readFile).mockImplementation(async (file) => {
    if (String(file).endsWith("officials-index.json")) return JSON.stringify(index);
    if (String(file).endsWith("example-person.json")) return JSON.stringify(official);
    throw new Error(`Unexpected file read: ${file}`);
  });
  vi.mocked(verificationForOfficial).mockImplementation((_slug, rows) =>
    rows.map((_tx, i) => verdict(i === 0 ? 0 : i === 1 ? 2 : 1, i))
  );
});

it("excludes disputes from overview totals, rankings and asset categories", async () => {
  assetFixture.distinguishOccurrences = true;
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).toMatch(/>2<\/span>transactions/);
  expect(html).toContain("~$16K");
  expect(html).toContain("1 row under review is not counted");
  expect(vi.mocked(OfficialRankings).mock.calls[0][0].rankings[0].tradeCount).toBe(2);
  expect(vi.mocked(SectorTreemap).mock.calls[0][0].data).toEqual([{ name: "Stock", value: 16000 }]);
});

it("excludes disputes from all-trades headlines and plotted rows", async () => {
  const html = renderToStaticMarkup(await AllTradesPage());
  expect(html).toContain("2 trades disclosed");
  expect(html).toContain("1 row under review is not counted");
  expect(html).toContain("officials&#x27; trade tables");
  expect(vi.mocked(SwimLaneChart).mock.calls[0][0].officials[0].transactions).toHaveLength(2);
});

it("counts undated eligible trades in headlines without plotting them", async () => {
  const date = transactions[2].date;
  transactions[2].date = null;
  try {
    const html = renderToStaticMarkup(await AllTradesPage());
    expect(html).toContain("2 trades disclosed");
    expect(html).toContain("1 counted trade has no reported date");
    expect(vi.mocked(SwimLaneChart).mock.calls[0][0].officials[0].transactions).toHaveLength(1);
  } finally { transactions[2].date = date; }
});

it("uses counted late rows and a counted denominator for late-filing rates", async () => {
  const html = renderToStaticMarkup(await LateFilingsPage());
  expect(html).toContain("50.0%");
  expect(html).toMatch(/>1<\/span>late-filed transactions/);
  expect(html).toContain("1 row under review is not counted");
});

it("shows zero, not NaN, when every row is under review", async () => {
  vi.mocked(verificationForOfficial).mockReturnValue(transactions.map((_tx, i) => verdict(0, i)));
  const html = renderToStaticMarkup(await LateFilingsPage());
  expect(html).toContain("0.0%");
  expect(html).not.toContain("NaN");
});

it("builds the share-card total from eligible rows instead of stale index counts", async () => {
  const response = await OGImage() as unknown as { html: string };
  expect(response.html).toMatch(/>2<\/span>/);
  expect(response.html).not.toContain(">999</span>");
});

it("uses the same counted population in methodology's aggregate comparison", async () => {
  const html = renderToStaticMarkup(await MethodologyPage());
  expect(html).toContain("2 tracked transactions");
  expect(html).toContain("1 row under review is not counted");
});

it("filters by occurrence before company grouping and preserves all original rows", async () => {
  const counted = officialForTotals(official);
  expect(counted.transactions).toEqual(transactions.slice(1));
  expect(counted.underReviewCount).toBe(1);
  expect(official.transactions).toHaveLength(3);
  const company = (await getTradesByTicker()).get("AAPL")!;
  expect(company.trades).toHaveLength(3);
  expect(company.trades.map((t) => t.verification?.score)).toEqual([0, 2, 1]);
});

it("counts scores 1, 2, 3 and missing verdicts, excluding only zero", () => {
  expect(rowsForTotals(["disputed", "single", "models", "checked", "missing"],
    [{ score: 0 }, { score: 1 }, { score: 2 }, { score: 3 }, null]
  )).toEqual(["single", "models", "checked", "missing"]);
});

it("uses counted rows for homepage headlines and directory instead of cached index counts", async () => {
  const html = renderToStaticMarkup(await Home());
  expect(html).toMatch(/>2<\/span>transactions/);
  expect(html).toContain("~$16K");
  expect(html).toContain("1 row under review is not counted");
  expect(html).toContain("Directory trades: 2");
  expect(html).not.toContain(">999</span>");
});

it("excludes disputes from company totals and keeps them in the marked trade table", async () => {
  const html = renderToStaticMarkup(await CompanyPage({ params: Promise.resolve({ ticker: "aapl" }) }));
  expect(html).toMatch(/>2<\/span>trades/);
  expect(html).toContain("~$16K");
  expect(html).toContain("1 row under review is not counted");
  expect(html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1].match(/<tr\b/g)).toHaveLength(3);
  expect(html).toContain(">Under review</summary>");
});

it("excludes disputes from company lookup buys, sells and value and shows a note", async () => {
  const html = renderToStaticMarkup(await CompaniesPage());
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
  expect(body).toContain("1 row under review is not counted");
  expect(body).toContain("$16K");
  expect(body).toMatch(/text-red-700">1<\/td>/);
  expect(body).toMatch(/text-emerald-700">1<\/td>/);
});

it("keeps a company searchable when all its trades are under review", async () => {
  vi.mocked(verificationForOfficial).mockReturnValue(transactions.map((_tx, i) => verdict(0, i)));
  const html = renderToStaticMarkup(await CompanyPage({ params: Promise.resolve({ ticker: "aapl" }) }));
  expect(html).toMatch(/>0<\/span>trades/);
  expect(html).toContain("~$0");
  expect(html).toContain("3 rows under review are not counted");
});

it("omits the exclusion note when no rows are disputed", async () => {
  vi.mocked(verificationForOfficial).mockReturnValue(transactions.map(() => null));
  const html = renderToStaticMarkup(await Home());
  expect(html).toMatch(/>3<\/span>transactions/);
  expect(html).not.toContain("not counted");
});
