/**
 * Route-level tests with the model, the database and the row loader mocked.
 * They pin the order of the gates (Codex, Sept. 7: quota must be reserved
 * after every free rejection) and the correspondence check, without a
 * network call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const quotaCalls: number[] = [];
let planToReturn: unknown = null;

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: async () => { quotaCalls.push(1); return [{ count: quotaCalls.length }]; } }),
        catch: () => undefined,
      }),
    }),
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", name: "emit_plan", input: planToReturn }],
      }),
    };
  },
}));
vi.mock("@/lib/published-rows", () => ({
  getPublishedRows: async () => ({
    rows: [
      { id: "r1", officialName: "Christopher Wright", officialSlug: "wright-christopher", agency: "Department of Energy", title: "Secretary of Energy", description: "LIBERTY ENERGY INC", ticker: "LBRT", instrumentType: "common_stock", type: "Sale", date: "2025-03-05", amount: "$1,000,001-$5,000,000", lateFilingFlag: false, sourceUrl: null, verificationState: "checked" },
      { id: "r2", officialName: "Scott Bessent", officialSlug: "bessent-scott", agency: "Department of the Treasury", title: "Secretary of the Treasury", description: "APPLE INC", ticker: "AAPL", instrumentType: "common_stock", type: "Purchase", date: "2026-02-01", amount: "$15,001-$50,000", lateFilingFlag: true, sourceUrl: null, verificationState: "checked" },
    ],
    pendingRows: [],
    officials: [
      { slug: "wright-christopher", name: "Christopher Wright", filedName: "Wright, Christopher", title: "Secretary of Energy", agency: "Department of Energy", former: false },
      { slug: "bessent-scott", name: "Scott Bessent", filedName: "Bessent, Scott", title: "Secretary of the Treasury", agency: "Department of the Treasury", former: false },
    ],
    tickers: ["LBRT", "AAPL"],
    allTickers: ["LBRT", "AAPL"],
    summary: { checked: 2, underReview: 0, auditPending: 0, notYetCompared: 0, parsed: 2 },
  }),
}));

process.env.ASKAI_PASSWORD = "pw";
process.env.ASKAI_COOKIE_SECRET = "secret";
process.env.ANTHROPIC_API_KEY = "test";

import { POST } from "./route";
import { ASKAI_COOKIE, askaiToken } from "@/lib/askai-access";

function post(body: unknown, opts: { cookie?: boolean; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", origin: opts.origin ?? "http://localhost:3000" };
  if (opts.cookie !== false) headers.cookie = `${ASKAI_COOKIE}=${askaiToken()}`;
  return POST(new Request("http://localhost:3000/api/ask", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

beforeEach(() => { quotaCalls.length = 0; planToReturn = null; });

describe("POST /api/ask gates", () => {
  it("refuses without the alpha cookie and spends nothing", async () => {
    const res = await post({ question: "Who sold Liberty Energy?" }, { cookie: false });
    expect(res.status).toBe(403);
    expect(quotaCalls.length).toBe(0);
  });

  it("declines by code before reserving quota", async () => {
    const res = await post({ question: "Is Wright's trading illegal?" });
    const j = await res.json();
    expect(j.status).toBe("declined");
    expect(quotaCalls.length).toBe(0);
  });

  it("rejects an empty body without reserving quota", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(quotaCalls.length).toBe(0);
  });

  it("answers a translated question, reserving quota exactly once", async () => {
    planToReturn = { filters: { officials: null, tickers: ["LBRT"], descriptionContains: null, types: ["Sale", "Sale (Partial)", "Sale (Full)"], instrumentTypes: null, dateFrom: null, dateTo: null, lateOnly: null, amountAtLeast: null, amountAtMost: null }, aggregate: "top_officials", limit: null };
    const res = await post({ question: "Who sold Liberty Energy?" });
    const j = await res.json();
    expect(j.status).toBe("answered");
    expect(j.answer).toContain("Christopher Wright, Secretary of Energy");
    expect(j.answer).toContain("1 sale");
    expect(quotaCalls.length).toBe(1);
  });

  it("refuses a plan that answers a different question than the one asked", async () => {
    planToReturn = { filters: { officials: ["Scott Bessent"], tickers: null, descriptionContains: null, types: null, instrumentTypes: null, dateFrom: null, dateTo: null, lateOnly: null, amountAtLeast: null, amountAtMost: null }, aggregate: "count", limit: null };
    const res = await post({ question: "How many sales did Christopher Wright report in 2025?" });
    const j = await res.json();
    expect(j.status).toBe("not_in_data");
    expect(j.answer).toMatch(/did not translate cleanly/);
  });
});
