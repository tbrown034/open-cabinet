import { describe, expect, it } from "vitest";
import { foldAudit, auditCacheFile } from "./grok-audit";

describe("audit lane folding", () => {
  it("maps chunk verdicts to candidate indexes and treats a row with no verdict as not found", () => {
    const usage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
    const folded = foldAudit([
      { offset: 0, rows: 2, result: { verdicts: [{ i: 0, verdict: "match" }, { i: 1, verdict: "differs", pageShows: "amount $15,001 - $50,000" }], missing: [], usage, cached: false } },
      { offset: 2, rows: 2, result: { verdicts: [{ i: 0, verdict: "match" }], missing: [{ description: "Extra Co", type: "Sale", date: "2026-01-01", amount: "$1,001 - $15,000", lateFilingFlag: false, page: 2 }], usage, cached: false } },
    ]);
    expect(folded.confirmedIndexes).toEqual([0, 2]);
    expect(folded.disputedIndexes).toEqual([1]);
    expect(folded.notFoundIndexes).toEqual([3]);
    expect(folded.missing).toHaveLength(1);
    expect(folded.differences[0]).toBe("row 2: page shows amount $15,001 - $50,000");
  });

  it("caches per PDF hash, page range and the rows shown", () => {
    const a = auditCacheFile("/x/Filing.pdf", "sha", 1, 3, "rows1");
    const b = auditCacheFile("/x/Filing.pdf", "sha", 1, 3, "rows2");
    expect(a).not.toBe(b);
    expect(a).toMatch(/Filing\.pages1-3\.[0-9a-f]{16}\.grok-audit\.json$/);
  });
});
