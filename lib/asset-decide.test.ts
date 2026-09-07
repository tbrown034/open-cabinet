import { describe, expect, it } from "vitest";
import { acceptName, assetQueue } from "../scripts/asset-decide";

describe("asset queue decisions", () => {
  it("refuses a symbol the lists do not carry, a non-stock listing, and a mismatch without evidence", () => {
    // Dry checks only: each refusal returns before any file is written.
    expect(acceptName("ZYXWV WIDGETS", "ZZZZQ", "x", "test")).toMatchObject({ ok: false });
    expect(acceptName("KEYCORP DP SH PFD H", "KEY-PI", "x", "test")).toMatchObject({ ok: false });
    expect(acceptName("SOME OTHER NAME", "AAPL", "short", "test")).toMatchObject({ ok: false });
  });
  it("lists unresolved stock and ETF names most rows first, never decided exceptions", () => {
    const q = assetQueue(3);
    expect(q.length).toBeGreaterThan(0);
    for (let i = 1; i < q.length; i++) expect(q[i - 1].rows).toBeGreaterThanOrEqual(q[i].rows);
    expect(q.some((l) => l.rule.startsWith("R0"))).toBe(false);
    expect(q.every((l) => l.type === "common_stock" || l.type === "etf")).toBe(true);
  });
});
