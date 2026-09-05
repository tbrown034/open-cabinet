import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  AMOUNT_BANDS,
  AMOUNT_RANGE_KEYS,
  amountBand,
  amountRangeLabel,
  amountRangeToMax,
  amountRangeToMidpoint,
  amountRangeToMin,
  isAmountRange,
  isOpenEnded,
  sumAmountEstimates,
  transactionEstimate,
} from "./amounts";

describe("amount catalog", () => {
  it("has exactly the eleven OGE range strings", () => {
    expect(AMOUNT_RANGE_KEYS).toHaveLength(11);
    expect(new Set(AMOUNT_RANGE_KEYS).size).toBe(11);
  });

  it("every band is internally consistent", () => {
    for (const band of AMOUNT_BANDS) {
      expect(band.min).toBeGreaterThan(0);
      if (band.max === null) {
        // Open-ended policy: 1.5x the range threshold ("Over $50,000,000"
        // estimates at $75M), disclosed on /methodology.
        expect(band.estimate).toBe((band.min - 1) * 1.5);
        expect(isOpenEnded(band.key)).toBe(true);
      } else {
        expect(band.max).toBeGreaterThan(band.min);
        expect(band.estimate).toBeGreaterThan(band.min);
        expect(band.estimate).toBeLessThan(band.max);
        expect(isOpenEnded(band.key)).toBe(false);
      }
      expect(amountRangeToMin(band.key)).toBe(band.min);
      expect(amountRangeToMax(band.key)).toBe(band.max);
      expect(amountRangeLabel(band.key)).toBe(band.label);
      expect(amountRangeToMidpoint(band.key)).toBe(band.estimate);
    }
  });

  it("the two open-ended ranges are present", () => {
    expect(isAmountRange("Over $50,000,000")).toBe(true);
    expect(isAmountRange("Over $1,000,000")).toBe(true);
  });

  it("an unknown range throws instead of becoming zero or NaN", () => {
    expect(() => amountBand("$1,000,001 - $5,000,000")).toThrow(/Unknown amount range/);
    expect(() => amountRangeToMidpoint("$2,000-$4,000" as never)).toThrow();
    expect(isAmountRange("$2,000-$4,000")).toBe(false);
    expect(isAmountRange(null)).toBe(false);
  });

  it("an unknown amount is null, excluded from totals and counted", () => {
    const rows = [
      { amount: "$1,001-$15,000" as const },
      { amount: null },
      { amount: "Over $1,000,000" as const },
    ];
    expect(transactionEstimate(rows[1])).toBeNull();
    const totals = sumAmountEstimates(rows);
    expect(totals.knownCount).toBe(2);
    expect(totals.unknownCount).toBe(1);
    expect(totals.openEndedCount).toBe(1);
    expect(totals.estimate).toBe(8_000 + 1_500_000);
    expect(totals.floor).toBe(1_001 + 1_000_001);
  });
});

describe("published data uses only legal ranges", () => {
  it("every stored transaction amount is a catalog key or null with a note", () => {
    const dir = path.join(process.cwd(), "data", "officials");
    const bad: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const official = JSON.parse(readFileSync(path.join(dir, file), "utf-8"));
      for (const [i, tx] of (official.transactions as Array<Record<string, unknown>>).entries()) {
        if (tx.amount === null) {
          if (typeof tx.amountNote !== "string" || tx.amountNote.length === 0) {
            bad.push(`${official.slug}[${i}]: null amount without amountNote`);
          }
          continue;
        }
        if (!isAmountRange(tx.amount)) bad.push(`${official.slug}[${i}]: ${String(tx.amount)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
