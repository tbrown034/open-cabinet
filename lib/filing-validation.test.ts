import { describe, expect, it } from "vitest";
import { assertParsedRows, validateParsedRows } from "./filing-validation";

const today = new Date("2026-09-05T12:00:00Z");

const good = {
  description: "SPDR Gold Shares (GLD)",
  ticker: "GLD",
  type: "Sale",
  date: "2025-03-04",
  amount: "$50,001-$100,000",
  lateFilingFlag: false,
  confidence: 0.95,
};

describe("validateParsedRows", () => {
  it("accepts a well-formed row", () => {
    const r = validateParsedRows([good], { today });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("rejects a response that is not an array", () => {
    expect(validateParsedRows({ status: "ok" }, { today }).ok).toBe(false);
  });

  it("rejects an amount string the catalog does not know", () => {
    const r = validateParsedRows([{ ...good, amount: "$1,000,001 - $5,000,000" }], { today });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/invalid amount range/);
  });

  it("accepts a null amount only with the filing's wording", () => {
    expect(validateParsedRows([{ ...good, amount: null }], { today }).ok).toBe(false);
    expect(
      validateParsedRows(
        [{ ...good, amount: null, amountNote: "Value Not Readily Ascertainable" }],
        { today }
      ).ok
    ).toBe(true);
  });

  it("rejects an impossible or future calendar date", () => {
    expect(validateParsedRows([{ ...good, date: "2025-02-30" }], { today }).errors[0]).toMatch(
      /not a real calendar date/
    );
    expect(validateParsedRows([{ ...good, date: "2225-04-04" }], { today }).errors[0]).toMatch(
      /in the future/
    );
    expect(validateParsedRows([{ ...good, date: "03/04/2025" }], { today }).ok).toBe(false);
  });

  it("rejects a boolean written as a string and a missing confidence", () => {
    expect(validateParsedRows([{ ...good, lateFilingFlag: "false" }], { today }).ok).toBe(false);
    const { confidence, ...noConfidence } = good;
    void confidence;
    expect(validateParsedRows([noConfidence], { today }).ok).toBe(false);
    expect(validateParsedRows([{ ...good, confidence: Number.NaN }], { today }).ok).toBe(false);
  });

  it("allows a dotted share-class symbol and withholds an implausible one with a warning", () => {
    expect(validateParsedRows([{ ...good, ticker: "BRK.B" }], { today }).ok).toBe(true);
    const r = validateParsedRows([{ ...good, ticker: "KEYpI" }], { today });
    expect(r.ok).toBe(true);
    expect(r.rows[0].ticker).toBeNull();
    expect(r.rows[0].description).toBe(good.description);
    expect(r.warnings[0]).toMatch(/ticker withheld/);
    expect(validateParsedRows([{ ...good, ticker: null }], { today }).ok).toBe(true);
  });

  it("rejects an unexpected field, so an injected or renamed key cannot ride along", () => {
    const r = validateParsedRows([{ ...good, status: "ok" }], { today });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unexpected field "status"/);
  });

  it("rejects an invalid type and an empty description", () => {
    expect(validateParsedRows([{ ...good, type: "Sold" }], { today }).ok).toBe(false);
    expect(validateParsedRows([{ ...good, description: "  " }], { today }).ok).toBe(false);
  });

  it("assertParsedRows lists every problem in the thrown message", () => {
    expect(() =>
      assertParsedRows([{ ...good, type: "Sold", amount: "$2-$3" }], "test.pdf")
    ).toThrow(/invalid type[\s\S]*invalid amount range/);
  });
});
