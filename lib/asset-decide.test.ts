import { describe, expect, it } from "vitest";
import { parseRecommendationsCsv } from "../scripts/asset-decide";

describe("parseRecommendationsCsv", () => {
  it("keeps commas and quotes inside a quoted reason", () => {
    const rows = parseRecommendationsCsv('nameKey,symbol,confidence,reason\nINTL BUSINESS MACHS,IBM,High,"Abbreviation of International Business Machines; listing ""International Business Machines Corp"", one match"\nSOME FUND,,Low,no symbol\n');
    expect(rows).toEqual([
      { nameKey: "INTL BUSINESS MACHS", symbol: "IBM", confidence: "High", reason: 'Abbreviation of International Business Machines; listing "International Business Machines Corp", one match' },
      { nameKey: "SOME FUND", symbol: "", confidence: "Low", reason: "no symbol" },
    ]);
  });
  it("returns nothing for an empty file", () => {
    expect(parseRecommendationsCsv("")).toEqual([]);
  });
});
