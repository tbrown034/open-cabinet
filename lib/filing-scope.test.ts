import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { OfficialData } from "./types";
import { getAllOfficials, officialForTotals } from "./data";
import { transactionScopeLabel } from "./format";
import { recordIdsFor } from "./row-verification";
import { computeStats, type SummaryInput } from "./summary-facts";

const readOfficial = (slug: string): OfficialData => JSON.parse(readFileSync(`data/officials/${slug}.json`, "utf8"));

describe("historical filing scope", () => {
  it("preserves MacGregor's source rows and verification IDs while excluding only historical reports", () => {
    const official = readOfficial("macgregor-katharine");
    const before = structuredClone(official);
    const ids = recordIdsFor(official.transactions);
    const counted = officialForTotals(official);
    expect(official).toEqual(before);
    expect(official.transactions).toHaveLength(23);
    expect(counted.transactions).toHaveLength(20);
    expect(counted.historicalCount).toBe(3);
    expect(counted.underReviewCount).toBe(0);
    expect(counted.transactions.every((tx) => !tx.sourceUrl?.includes("2020"))).toBe(true);
    expect(recordIdsFor(counted.transactions)).toEqual(ids.filter((_, i) => !official.transactions[i].historical));
    const withoutFlags = official.transactions.map((tx) => { const copy = { ...tx }; delete copy.historical; return copy; });
    expect(recordIdsFor(withoutFlags)).toEqual(ids);
    expect(computeStats(official as unknown as SummaryInput).total).toBe(20);
  });

  it("retains earlier trades disclosed in second-term reports and leaves former profiles out of the roster", async () => {
    const officials = await getAllOfficials();
    expect(officials.some((o) => ["criswell-deanne", "dixon-stacey", "whitaker-michael"].includes(o.slug))).toBe(false);
    expect(officials.flatMap((o) => o.transactions).some((tx) => tx.historical)).toBe(false);
    for (const [slug, expected] of [["burgum-douglas-j", 2], ["kennedy-robert-f", 2], ["mcmahon-linda", 24]] as const) {
      const rows = officials.find((o) => o.slug === slug)!.transactions.filter((t) => t.date && t.date < "2025-01-20");
      expect(rows).toHaveLength(expected);
      expect(rows.every((tx) => transactionScopeLabel(tx) === "Trade before second term")).toBe(true);
    }
    expect(transactionScopeLabel({ date: "2020-01-01", historical: true })).toContain("excluded from current totals");
    expect(transactionScopeLabel({ date: "2025-01-20" })).toBeNull();
  });
});
