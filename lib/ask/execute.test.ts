import { describe, it, expect } from "vitest";
import { execute, filterRows, countPending } from "./execute";
import type { QueryPlan } from "./plan";
import type { PendingRow, PublishedRow, PublishedRowsData } from "../published-rows";

function row(partial: Partial<PublishedRow> & { id: string }): PublishedRow {
  return {
    officialName: "Scott Bessent",
    officialSlug: "bessent-scott",
    agency: "Treasury",
    title: "Secretary of the Treasury",
    description: "NVIDIA Corporation",
    ticker: "NVDA",
    type: "Purchase",
    date: "2025-03-04",
    amount: "$15,001-$50,000",
    lateFilingFlag: false,
    sourceUrl: "https://example.gov/a.pdf",
    verificationState: "checked",
    ...partial,
  };
}

const ROWS: PublishedRow[] = [
  row({ id: "a", amount: "$15,001-$50,000" }),
  row({ id: "b", type: "Sale (Partial)", amount: "$50,001-$100,000", date: "2025-04-10", lateFilingFlag: true }),
  // Unknown amount: counted, never summed.
  row({ id: "c", type: "Sale", amount: null, date: "2025-05-20" }),
  row({
    id: "d",
    officialName: "Doug Burgum",
    officialSlug: "burgum-doug",
    agency: "Interior",
    description: "Apple Inc.",
    ticker: "AAPL",
    type: "Sale",
    amount: "$1,000,001-$5,000,000",
    date: "2026-01-15",
  }),
];

// Rows the site holds but no check has cleared. They are never answered from
// and never counted in an aggregate; they exist so a query that matches
// nothing verified can still say how much is waiting.
const PENDING: PendingRow[] = [
  {
    ...row({ id: "p1", officialName: "Donald J Trump", officialSlug: "trump-donald-j", ticker: "DJT", description: "Trump Media", type: "Purchase", date: "2026-02-02" }),
    verificationState: "disputed",
    pending: "underReview",
  },
  {
    ...row({ id: "p2", officialName: "Donald J Trump", officialSlug: "trump-donald-j", ticker: "DJT", description: "Trump Media", type: "Sale", date: "2026-03-03" }),
    verificationState: "single_read",
    pending: "notYetChecked",
  },
  {
    ...row({ id: "p3", officialName: "Donald J Trump", officialSlug: "trump-donald-j", ticker: "DJT", description: "Trump Media", type: "Sale", date: "2026-04-04" }),
    verificationState: "single_read",
    pending: "notYetChecked",
  },
];

const DATA: PublishedRowsData = {
  rows: ROWS,
  pendingRows: PENDING,
  summary: { published: 4, underReview: 7, notYetChecked: 11 },
  officials: [
    { slug: "bessent-scott", name: "Scott Bessent", filedName: "Bessent, Scott", title: "Secretary of the Treasury", agency: "Treasury" },
    { slug: "burgum-doug", name: "Doug Burgum", filedName: "Burgum, Doug", title: "Secretary of the Interior", agency: "Interior" },
  ],
  tickers: ["AAPL", "NVDA"],
};

const plan = (p: Partial<QueryPlan>): QueryPlan => ({
  filters: {},
  aggregate: "count",
  ...p,
});

describe("filterRows", () => {
  it("filters by official slug", () => {
    expect(filterRows(plan({ filters: { officials: ["burgum-doug"] } }), ROWS)).toHaveLength(1);
  });

  it("filters by ticker", () => {
    expect(filterRows(plan({ filters: { tickers: ["NVDA"] } }), ROWS)).toHaveLength(3);
  });

  it("treats Sale as the whole sale family", () => {
    const sales = filterRows(plan({ filters: { types: ["Sale"] } }), ROWS);
    expect(sales.map((r) => r.id).sort()).toEqual(["b", "c", "d"]);
  });

  it("filters by date range inclusively", () => {
    const rows = filterRows(
      plan({ filters: { dateFrom: "2025-04-10", dateTo: "2025-05-20" } }),
      ROWS
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("filters late-only", () => {
    expect(filterRows(plan({ filters: { lateOnly: true } }), ROWS).map((r) => r.id)).toEqual(["b"]);
  });

  it("excludes unknown amounts from a dollar floor", () => {
    const rows = filterRows(plan({ filters: { amountAtLeast: 50_000 } }), ROWS);
    expect(rows.map((r) => r.id).sort()).toEqual(["b", "d"]);
  });

  it("matches a description substring case-insensitively", () => {
    expect(
      filterRows(plan({ filters: { descriptionContains: "apple" } }), ROWS).map((r) => r.id)
    ).toEqual(["d"]);
  });
});

describe("execute", () => {
  it("counts matched rows", () => {
    const result = execute(plan({ aggregate: "count" }), DATA);
    expect(result.count).toBe(4);
    expect(result.matchedRows).toBe(4);
    expect(result.numbers).toContain(4);
  });

  it("sums estimates and counts unknown amounts separately", () => {
    const result = execute(plan({ aggregate: "sum_estimate" }), DATA);
    // 32,500 + 75,000 + 3,000,000. The null-amount row contributes nothing.
    expect(result.totals?.estimate).toBe(3_107_500);
    expect(result.totals?.knownCount).toBe(3);
    expect(result.totals?.unknownCount).toBe(1);
    expect(result.totals?.estimateDisplay).toBe("$3,107,500");
  });

  it("never returns a row the source did not publish", () => {
    // Rows under review are already absent from PublishedRowsData; the
    // executor has no path to them and the excluded counts survive.
    const result = execute(plan({ aggregate: "list" }), DATA);
    expect(result.rows?.every((r) => r.verificationState !== "disputed")).toBe(true);
    expect(result.rows).toHaveLength(4);
    expect(DATA.summary.underReview).toBe(7);
  });

  it("honors the list limit", () => {
    const result = execute(plan({ aggregate: "list", limit: 2 }), DATA);
    expect(result.rows).toHaveLength(2);
    expect(result.shownRows).toBe(2);
    expect(result.matchedRows).toBe(4);
  });

  it("ranks officials by estimated value", () => {
    const result = execute(plan({ aggregate: "top_officials" }), DATA);
    expect(result.topOfficials?.[0].slug).toBe("burgum-doug");
    expect(result.topOfficials?.[0].estimateDisplay).toBe("$3,000,000");
    expect(result.topOfficials?.[1].count).toBe(3);
  });

  it("ranks assets by how often they appear", () => {
    const result = execute(plan({ aggregate: "top_assets" }), DATA);
    expect(result.topAssets?.[0].ticker).toBe("NVDA");
    expect(result.topAssets?.[0].count).toBe(3);
  });

  it("buckets by month in order", () => {
    const result = execute(plan({ aggregate: "by_month" }), DATA);
    expect(result.byMonth).toEqual([
      { month: "2025-03", count: 1 },
      { month: "2025-04", count: 1 },
      { month: "2025-05", count: 1 },
      { month: "2026-01", count: 1 },
    ]);
  });

  it("returns the first and last dates", () => {
    const result = execute(plan({ aggregate: "first_last_dates" }), DATA);
    expect(result.firstDate).toBe("2025-03-04");
    expect(result.lastDate).toBe("2026-01-15");
  });

  it("returns zero rather than an error when nothing matches", () => {
    const result = execute(plan({ filters: { tickers: ["AAPL"], lateOnly: true } }), DATA);
    expect(result.matchedRows).toBe(0);
    expect(result.count).toBe(0);
  });

  it("vouches for the query's own date range so a sentence may restate it", () => {
    const result = execute(
      plan({ filters: { dateFrom: "2025-01-01", dateTo: "2025-06-30" } }),
      DATA
    );
    expect(result.displayStrings).toContain("2025-01-01");
    expect(result.displayStrings).toContain("2025-06-30");
  });

  it("never answers from a pending row", () => {
    const p = plan({ filters: { officials: ["trump-donald-j"] }, aggregate: "count" });
    const result = execute(p, DATA);
    expect(result.matchedRows).toBe(0);
    expect(result.count).toBe(0);
  });

  it("publishes both raw numbers and display strings for the check", () => {
    const result = execute(plan({ aggregate: "sum_estimate" }), DATA);
    expect(result.numbers).toContain(3_107_500);
    expect(result.displayStrings).toContain("$3.1 million");
    expect(result.displayStrings).toContain("$3.1M");
  });
});

describe("countPending", () => {
  it("counts the rows an official has waiting on a check", () => {
    expect(
      countPending(plan({ filters: { officials: ["trump-donald-j"] } }), PENDING)
    ).toEqual({ underReview: 1, notYetChecked: 2 });
  });

  it("applies the same filters as the published query", () => {
    expect(
      countPending(
        plan({ filters: { officials: ["trump-donald-j"], types: ["Sale"] } }),
        PENDING
      )
    ).toEqual({ underReview: 0, notYetChecked: 2 });
  });

  it("returns zeros for an official with nothing pending", () => {
    expect(countPending(plan({ filters: { officials: ["bessent-scott"] } }), PENDING)).toEqual({
      underReview: 0,
      notYetChecked: 0,
    });
  });
});
