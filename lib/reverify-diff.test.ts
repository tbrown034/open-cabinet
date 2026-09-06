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

  it("pairs the same asset whose trade reads differently as a trade change, for a person", () => {
    const d = diffRows([row(), row()], [row(), row({ date: "2025-04-01", amount: "$1,001-$15,000" })]);
    expect(d.matched).toBe(1);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].fields).toEqual(["date", "amount"]);
    expect(d.changed[0].wordingOnly).toBe(false);
    expect(d.tradeChanged).toBe(1);
    expect(d.removed).toEqual([]);
    expect(d.added).toEqual([]);
  });

  it("reports a different asset on a new date as removed plus added, never a random pairing", () => {
    const d = diffRows([row()], [row({ description: "Apple Inc. (AAPL)", ticker: "AAPL", date: "2025-04-01" })]);
    expect(d.changed).toEqual([]);
    expect(d.removed).toHaveLength(1);
    expect(d.added).toHaveLength(1);
  });

  it("never pairs many identical trades at random: a symbol appended to each description is wording only", () => {
    // Edgar 05.01.2025: 63 sales, same day, same range. The old matcher
    // paired IBM with Accenture.
    const names = ["International Business Machines Corp.", "Wells Fargo & Co.", "Walmart, Inc.", "Visa, Inc."];
    const syms = ["IBM", "WFC", "WMT", "V"];
    const pub = names.map((description, i) => row({ description, ticker: syms[i] }));
    const fresh = names.map((description, i) => row({ description: `${description} (${syms[i]})`, ticker: syms[i] }));
    const d = diffRows(pub, fresh);
    expect(d.changed).toHaveLength(4);
    expect(d.changed.every((c) => c.wordingOnly)).toBe(true);
    expect(d.changed.map((c) => c.before.ticker)).toEqual(d.changed.map((c) => c.after.ticker));
    expect(d.wordingChanged).toBe(4);
    expect(d.tradeChanged).toBe(0);
  });

  it("never pairs two different assets as a wording change, even as unique leftovers", () => {
    const d = diffRows([row({ description: "Apple Inc.", ticker: "AAPL" })], [row({ description: "Microsoft Corp.", ticker: "MSFT" })]);
    expect(d.changed).toEqual([]);
    expect(d.removed).toHaveLength(1);
    expect(d.added).toHaveLength(1);
  });

  it("treats a changed maturity or note as substantive, not wording", () => {
    const d = diffRows(
      [row({ description: "Acme 4% bond due 2030", ticker: null })],
      [row({ description: "Acme 4% bond due 2040", ticker: null })]
    );
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].wordingOnly).toBe(false);
    expect(d.tradeChanged).toBe(1);
    const n = diffRows([row({ amount: null, amountNote: "Value not readily ascertainable" })], [row({ amount: null, amountNote: "Illegible" })]);
    expect(n.matched).toBe(0);
    expect(n.changed[0]?.fields).toEqual(["amountNote"]);
  });

  it("a two-letter company name is a name, and See Endnote is not part of one", async () => {
    const { sharesAssetWord } = await import("./reverify-diff");
    expect(sharesAssetWord("HP INC COM See Endnote", "HP INC COM")).toBe(true);
    expect(sharesAssetWord("GE Aerospace", "GE AEROSPACE (GE)")).toBe(true);
    expect(sharesAssetWord("HP INC COM", "GE AEROSPACE")).toBe(false);
  });

  it("pairs a same-trade leftover only when the pairing is unambiguous", () => {
    const pub = [row({ description: "A", ticker: null }), row({ description: "B", ticker: null })];
    const fresh = [row({ description: "C", ticker: null }), row({ description: "D", ticker: null })];
    const d = diffRows(pub, fresh);
    expect(d.changed).toEqual([]);
    expect(d.removed).toHaveLength(2);
    expect(d.added).toHaveLength(2);
    const one = diffRows([row({ description: "Acme Holdings", ticker: null })], [row({ description: "Acme Holdings Class B", ticker: null })]);
    expect(one.changed).toHaveLength(1);
  });

  it("pairs an identical row attributed to a different same-day filing as an attribution change", () => {
    const d = diffRows([row({ sourceUrl: "https://x/f(3).pdf" })], [row({ sourceUrl: "https://x/f(2).pdf" })]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].fields).toEqual(["sourceUrl"]);
    expect(d.changed[0].wordingOnly).toBe(true);
    expect(d.removed).toEqual([]);
  });

  it("an unknown amount compares as unknown on both sides", () => {
    const d = diffRows([row({ amount: null })], [row({ amount: null })]);
    expect(d.matched).toBe(1);
  });
});
