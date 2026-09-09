/**
 * Route-level tests with the model, the database and the row loader mocked.
 * They pin the order of the gates (Codex, Sept. 7: quota must be reserved
 * after every free rejection) and the correspondence check, without a
 * network call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const quotaCalls: number[] = [];
let planToReturn: unknown = null;
let modelFailure: Error | null = null;
const savedLogs: Array<{ question: string; plan?: string; reason?: string | null; status: string }> = [];
const cacheConditions: unknown[][] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: (values: typeof savedLogs[number]) => {
        if (values.question) savedLogs.push(values);
        return ({
        onConflictDoUpdate: () => ({ returning: async () => { quotaCalls.push(1); return [{ count: quotaCalls.length }]; } }),
        returning: () => Promise.resolve([{ id: 7 }]),
        catch: () => undefined,
      }); },
    }),
    select: () => ({ from: () => ({ where: (condition: SQL) => {
      const params = new PgDialect().sqlToQuery(condition).params;
      cacheConditions.push(params);
      return { orderBy: () => ({ limit: async () => savedLogs.filter((row) =>
        params.includes(row.question.toLowerCase()) && row.status === "answered" && params.includes(row.reason)
      ).slice(-1) }) };
    } }) }),
  }),
}));
vi.mock("fs/promises", () => ({ appendFile: vi.fn(async () => undefined) }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => {
        if (modelFailure) throw modelFailure;
        return {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", name: "emit_plan", input: planToReturn }],
      }; },
    };
  },
}));
vi.mock("@/lib/published-rows", () => ({
  getPublishedRows: async () => ({
    rows: [
      { id: "r1", officialName: "Christopher Wright", officialSlug: "wright-christopher", agency: "Department of Energy", title: "Secretary of Energy", description: "LIBERTY ENERGY INC", ticker: "LBRT", instrumentType: "common_stock", type: "Sale", date: "2025-03-05", amount: "$1,000,001-$5,000,000", lateFilingFlag: false, sourceUrl: null, verificationState: "checked" },
      { id: "r2", officialName: "Scott Bessent", officialSlug: "bessent-scott", agency: "Department of the Treasury", title: "Secretary of the Treasury", description: "APPLE INC", ticker: "AAPL", instrumentType: "common_stock", type: "Purchase", date: "2026-02-01", amount: "$15,001-$50,000", lateFilingFlag: true, sourceUrl: null, verificationState: "checked" },
      ...["GOOG", "GOOGL"].map((ticker) => ({ id: ticker, officialName: "Scott Bessent", officialSlug: "bessent-scott", agency: "Department of the Treasury", title: "Secretary of the Treasury", description: "Alphabet Inc", ticker, instrumentType: "common_stock", type: "Purchase", date: "2026-02-01", amount: "$15,001-$50,000", lateFilingFlag: false, sourceUrl: null, verificationState: "checked" })),
    ],
    pendingRows: [],
    officials: [
      { slug: "wright-christopher", name: "Christopher Wright", filedName: "Wright, Christopher", title: "Secretary of Energy", agency: "Department of Energy", former: false },
      { slug: "bessent-scott", name: "Scott Bessent", filedName: "Bessent, Scott", title: "Secretary of the Treasury", agency: "Department of the Treasury", former: false },
    ],
    tickers: ["LBRT", "AAPL", "GOOG", "GOOGL"],
    allTickers: ["LBRT", "AAPL", "GOOG", "GOOGL"],
    summary: { checked: 4, underReview: 0, auditPending: 0, notYetCompared: 0, parsed: 4 },
  }),
}));

process.env.ASKAI_PASSWORD = "pw";
process.env.ASKAI_COOKIE_SECRET = "secret";
process.env.ANTHROPIC_API_KEY = "test";

import { POST } from "./route";
import { ASKAI_COOKIE, askaiToken } from "@/lib/askai-access";
import { resetAskLimiter } from "@/lib/ask/limits";

function post(body: unknown, opts: { cookie?: boolean; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", origin: opts.origin ?? "http://localhost:3000" };
  if (opts.cookie !== false) headers.cookie = `${ASKAI_COOKIE}=${askaiToken()}`;
  return POST(new Request("http://localhost:3000/api/ask", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

beforeEach(() => { quotaCalls.length = 0; planToReturn = null; modelFailure = null; savedLogs.length = 0; cacheConditions.length = 0; resetAskLimiter(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("POST /api/ask gates", () => {
  it("keeps an explicit GOOG symbol separate from GOOGL, including cached repeats", async () => {
    const question = "Tell me how many trades involve GOOG.";
    savedLogs.push({ question, status: "answered", reason: `plan-cache-v2:claude-sonnet-5:${new Date().toISOString().slice(0, 10)}:all`, plan: JSON.stringify({ filters: { tickers: ["GOOG", "GOOGL"] }, aggregate: "count" }) });
    planToReturn = { filters: { tickers: ["GOOG"] }, aggregate: "count" };
    const first = await (await post({ question })).json();
    expect(first.planSource).toBe("model");
    expect(first.plan.filters.tickers).toEqual(["GOOG"]);
    expect(first.result.matchedRows).toBe(1);
    const repeat = await (await post({ question })).json();
    expect(repeat.planSource).toBe("cache");
    expect(repeat.result.matchedRows).toBe(1);
  });

  it("still includes both listed classes for an Alphabet company question", async () => {
    planToReturn = { filters: { tickers: ["GOOG"] }, aggregate: "count" };
    const j = await (await post({ question: "Count Alphabet trades." })).json();
    expect(j.plan.filters.tickers).toEqual(["GOOG", "GOOGL"]);
    expect(j.result.matchedRows).toBe(2);
  });

  it("explains filing-date limits before using a cached translation", async () => {
    const question = "How many transactions did Howard Lutnick disclose in 2025?";
    const j = await (await post({ question })).json();
    expect(j.status).toBe("declined");
    expect(j.answer).toContain("when a trade happened");
    expect(j.answer).toContain("How many trades occurred in 2025?");
    expect(quotaCalls).toHaveLength(0);
    expect(cacheConditions).toHaveLength(0);
  });

  it("explains no matching purchases without internal verification jargon", async () => {
    planToReturn = { filters: { officials: ["wright-christopher"], tickers: null, descriptionContains: null, types: ["Purchase"], instrumentTypes: null, dateFrom: null, dateTo: null, lateOnly: null, amountAtLeast: null, amountAtMost: null }, aggregate: "count", limit: null };
    const j = await (await post({ question: "How many purchases did Christopher Wright make?" })).json();
    expect(j.status).toBe("not_in_data");
    expect(j.result.matchedRows).toBe(0);
    expect(j.answer).toContain("reported no purchases");
    expect(j.answer).toContain("1 other trade");
    expect(j.answer).not.toMatch(/checked|rows/i);
  });

  it("explains a provider timeout without inventing an answer", async () => {
    modelFailure = new Error("private provider diagnostic");
    modelFailure.name = "APIConnectionTimeoutError";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await post({ question: "How many Apple purchases?" });
    const j = await res.json();
    expect(j.status).toBe("error");
    expect(j.answer).toContain("took too long");
    expect(j.answer).toContain("browse the trades");
    expect(j.answer).not.toContain("private provider diagnostic");
    expect(j.result).toBeNull();
    expect(savedLogs.at(-1)?.reason).toBe("planning timeout");
    errorLog.mockRestore();
  });

  it.each(["Which officials bought Apple but never sold it?", "Which officials have only bought Apple?", "Which officials bought Apple and sold Microsoft?"])("rejects unsupported history even when cached: %s", async (question) => {
    savedLogs.push({ question, status: "answered", reason: `plan-cache-v3:claude-sonnet-5:${new Date().toISOString().slice(0, 10)}:all`, plan: JSON.stringify({ filters: { tickers: ["AAPL"] }, aggregate: "top_officials" }) });
    const j = await (await post({ question })).json();
    expect(j.status).toBe("declined");
    expect(j.answer).toContain("purchases and sales separately");
    expect(quotaCalls).toHaveLength(0);
    expect(cacheConditions).toHaveLength(0);
  });

  it("rejects a browser-supplied plan paired with an unrelated question", async () => {
    const res = await post({ question: "How many AAPL purchases?", plan: { filters: { tickers: ["LBRT"], types: ["Sale"] }, aggregate: "count" } });
    expect(res.status).toBe(400);
    expect(quotaCalls).toHaveLength(0);
  });
  it("rejects retired follow-up tokens without reserving quota", async () => {
    const res = await post({ question: "How many AAPL purchases?", followUpToken: "old-token" });
    expect(res.status).toBe(400);
    expect(quotaCalls).toHaveLength(0);
  });
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
    expect(j.planText).toBe("Sales of Liberty Energy Inc (LBRT), ranked by official.");
    expect(j.logId).toBe(7);
    expect(j).not.toHaveProperty("followUps");
    expect(quotaCalls.length).toBe(1);
  });


  it("does not reuse legacy or follow-up log plans as question translations", async () => {
    const question = "How many AAPL purchases?";
    const wrong = { filters: { tickers: ["LBRT"], types: ["Sale"] }, aggregate: "count" };
    savedLogs.push({ question, status: "answered", reason: null, plan: JSON.stringify(wrong) });
    savedLogs.push({ question, status: "answered", reason: "follow-up", plan: JSON.stringify(wrong) });
    savedLogs.push({ question, status: "answered", reason: `plan-cache-v1:claude-sonnet-5:${new Date().toISOString().slice(0, 10)}:all`, plan: JSON.stringify(wrong) });
    planToReturn = { filters: { tickers: ["AAPL"], types: ["Purchase"] }, aggregate: "count" };
    const answer = await (await post({ question })).json();
    expect(answer.planSource).toBe("model");
    expect(answer.plan.filters.tickers).toEqual(["AAPL"]);
    expect(quotaCalls).toHaveLength(1);
    const repeat = await (await post({ question })).json();
    expect(repeat.planSource).toBe("cache");
    expect(quotaCalls).toHaveLength(1);
  });

  it("does not widen an unknown official scope to everyone", async () => {
    const res = await post({ question: "How many purchases?", officialSlug: "not-a-tracked-official" });
    expect(res.status).toBe(400);
    expect(quotaCalls).toHaveLength(0);
  });

  it("does not answer about a different named official within a page scope", async () => {
    planToReturn = { filters: { officials: ["bessent-scott"] }, aggregate: "count" };
    const j = await (await post({ question: "How many trades did Scott Bessent make?", officialSlug: "wright-christopher" })).json();
    expect(j.status).toBe("declined");
    expect(j.answer).toContain("only about Christopher Wright");
    expect(quotaCalls).toHaveLength(0);
  });

  it("separates question translations by official scope", async () => {
    planToReturn = { filters: {}, aggregate: "count" };
    const question = "How many checked trades?";
    const first = await (await post({ question, officialSlug: "wright-christopher" })).json();
    const second = await (await post({ question, officialSlug: "bessent-scott" })).json();
    expect(first.plan.filters.officials).toEqual(["wright-christopher"]);
    expect(second.plan.filters.officials).toEqual(["bessent-scott"]);
    expect(second.planSource).toBe("model");
    expect(quotaCalls).toHaveLength(2);
    expect(cacheConditions[0]).not.toEqual(cacheConditions[1]);
  });

  it("does not reuse translations across a model or UTC-date change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    vi.stubEnv("ASK_MODEL", "test-model-a");
    planToReturn = { filters: { tickers: ["AAPL"] }, aggregate: "count" };
    const question = "How many AAPL trades?";
    await post({ question });
    vi.stubEnv("ASK_MODEL", "test-model-b");
    expect((await (await post({ question })).json()).planSource).toBe("model");
    vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
    expect((await (await post({ question })).json()).planSource).toBe("model");
    expect(quotaCalls).toHaveLength(3);
  });



  it("refuses a plan that answers a different question than the one asked", async () => {
    planToReturn = { filters: { officials: ["Scott Bessent"], tickers: null, descriptionContains: null, types: null, instrumentTypes: null, dateFrom: null, dateTo: null, lateOnly: null, amountAtLeast: null, amountAtMost: null }, aggregate: "count", limit: null };
    const res = await post({ question: "How many sales did Christopher Wright make in 2025?" });
    const j = await res.json();
    expect(j.status).toBe("not_in_data");
    expect(j.answer).toMatch(/did not translate cleanly/);
  });
});
