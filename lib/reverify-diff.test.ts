import { describe, expect, it } from "vitest";
import { diffRows, type RowLike } from "./reverify-diff";

const row = (over: Partial<RowLike> = {}): RowLike => ({
  description: "SPDR Gold Shares (GLD)",
  ticker: "GLD",
  type: "Sale",
  date: "2025-03-04",
  amount: "$50,001-$100,000",
  lateFilingFlag: false,
  sourceUrl: "https://x/f.pdf",
  ...over,
});

describe("diffRows", () => {
  it("reports no changes when the fresh reading reproduces the published rows, lots included", () => {
    const pub = [row(), row(), row({ description: "Old Farm Partners", ticker: null, amount: "$100,001-$250,000" })];
    const d = diffRows(pub, [...pub]);
    expect(d).toMatchObject({ published: 3, fresh: 3, matched: 3, changed: [], removed: [], added: [] });
  });

  it("pairs the same trade with different words as changed, not removed plus added", () => {
    const d = diffRows([row()], [row({ description: "SPDR Gold Shares" })]);
    expect(d.matched).toBe(0);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].before.description).toBe("SPDR Gold Shares (GLD)");
    expect(d.changed[0].after.description).toBe("SPDR Gold Shares");
    expect(d.removed).toEqual([]);
    expect(d.added).toEqual([]);
  });

  it("reports a lost lot as removed and a new trade as added", () => {
    const d = diffRows([row(), row()], [row(), row({ date: "2025-04-01", amount: "$1,001-$15,000" })]);
    expect(d.matched).toBe(1);
    expect(d.removed).toHaveLength(1);
    expect(d.added).toHaveLength(1);
    expect(d.changed).toEqual([]);
  });

  it("an unknown amount compares as unknown on both sides", () => {
    const d = diffRows([row({ amount: null })], [row({ amount: null })]);
    expect(d.matched).toBe(1);
  });
});
