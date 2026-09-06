import { describe, expect, it } from "vitest";
import type { CrosscheckEntry } from "./crosscheck-log";
import type { Transaction } from "./types";
import { deriveRowVerification, locateInParseRecord, makeRecordId, printedRowForIndex, recordIdsFor } from "./row-verification";
import { compareSecondRead } from "./second-read";

const URL = "https://example.gov/f.pdf";
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  description: "Apple Inc. (AAPL)",
  ticker: "AAPL",
  type: "Sale",
  date: "2026-06-12",
  amount: "$1,001-$15,000",
  lateFilingFlag: true,
  sourceUrl: URL,
  ...over,
});
const entry = (over: Partial<CrosscheckEntry>): CrosscheckEntry => ({
  sourceUrl: URL, slug: "x", filingDate: "2026-06-20", pdfFile: "f.pdf", pdfSha256: "abc", candidateSha256: "def",
  checkerVersion: "t", state: "no_usable_text", comparedFields: [], rowsCompared: null, publishedRows: 1, checkedAt: "now",
  ...over,
});

describe("record ids", () => {
  it("are stable, and two identical lots get different ids without depending on order", () => {
    const a = tx(), b = tx(), c = tx({ description: "Other" });
    expect(makeRecordId(a, 0)).toBe(makeRecordId(b, 0));
    expect(recordIdsFor([a, b, c])).toEqual([makeRecordId(a, 0), makeRecordId(a, 1), makeRecordId(c, 0)]);
    expect(recordIdsFor([c, a, b]).sort()).toEqual(recordIdsFor([a, b, c]).sort());
  });
});

describe("locating a published row in the parse record", () => {
  it("pairs by description and tuple, consuming lots one to one", () => {
    const record = [tx({ description: "Other" }), tx(), tx()];
    expect(locateInParseRecord([tx(), tx(), tx()], record)).toEqual([1, 2, -1]);
  });

  it("maps parsed indexes back to printed rows across placeholders", () => {
    // Printed rows 1, 3, 4 are transactions; 2 is "Line is intentionally left blank".
    expect([0, 1, 2].map((i) => printedRowForIndex(i, [2]))).toEqual([1, 3, 4]);
  });
});

describe("deriveRowVerification", () => {
  const base = { slug: "x", parseRecordByUrl: new Map(), entriesByUrl: new Map<string, CrosscheckEntry>() };

  it("scores 3 when a deterministic lane agreed on the filing", () => {
    const out = deriveRowVerification({ ...base, transactions: [tx()], entriesByUrl: new Map([[URL, entry({ state: "checked_tuple_agreement" })]]) });
    expect(out[0]).toMatchObject({ score: 3, state: "deterministic_agree", lane: "text" });
  });

  it("credits a filing-level agreement only to rows the checked candidate contains", () => {
    const rows = [tx({ description: "A" }), tx({ description: "B" })];
    const out = deriveRowVerification({
      ...base,
      transactions: rows,
      entriesByUrl: new Map([[URL, entry({ state: "checked_tuple_agreement" })]]),
      parseRecordByUrl: new Map([[URL, [tx({ description: "A" })]]]),
    });
    expect(out.map((v) => v.score)).toEqual([3, 1]);
    expect(out[1].note).toMatch(/does not contain this row/);
  });

  it("scores 0 for the whole filing when the text lane disagreed", () => {
    const out = deriveRowVerification({ ...base, transactions: [tx()], entriesByUrl: new Map([[URL, entry({ state: "checked_tuple_mismatch" })]]) });
    expect(out[0]).toMatchObject({ score: 0, state: "disputed" });
  });

  it("scores 1 for a scan nobody could read, and for an unattributed row", () => {
    const out = deriveRowVerification({ ...base, transactions: [tx(), tx({ sourceUrl: undefined })], entriesByUrl: new Map([[URL, entry({ state: "no_usable_text" })]]) });
    expect(out.map((v) => v.score)).toEqual([1, 1]);
    expect(out[1].note).toMatch(/Not attributed/);
  });

  it("scores rows one by one from the OCR alignment on an OCR mismatch", () => {
    const rows = [tx({ description: "A" }), tx({ description: "B" }), tx({ description: "C" })];
    const e = entry({
      state: "ocr_tuple_mismatch",
      ocr: {
        engine: "tesseract", version: "5", dpi: 400, psm: 4, laneVersion: "v", pages: 1, textFile: "t", textSha256: "s", textLaneState: "no_usable_text",
        aligned: { compared: 2, agree: 1, differ: 1, unread: 1, differences: [], agreedPrintedRows: [1], disputedPrintedRows: [2], placeholderRows: [] },
      },
    });
    const out = deriveRowVerification({ ...base, transactions: rows, entriesByUrl: new Map([[URL, e]]), parseRecordByUrl: new Map([[URL, rows]]) });
    expect(out.map((v) => [v.score, v.state])).toEqual([[3, "deterministic_agree"], [0, "disputed"], [1, "single_read"]]);
  });

  it("lets a second model lift an unread row to 2, and a human decision to 3", () => {
    const rows = [tx({ description: "A" }), tx({ description: "B" })];
    const e = entry({ state: "no_usable_text" });
    const out = deriveRowVerification({
      ...base,
      transactions: rows,
      entriesByUrl: new Map([[URL, e]]),
      parseRecordByUrl: new Map([[URL, rows]]),
      model2ByUrl: new Map([[URL, { agreedIndexes: new Set([0]), disputedIndexes: new Set([1]) }]]),
    });
    expect(out.map((v) => v.score)).toEqual([2, 0]);
    const ids = recordIdsFor(rows);
    const decided = deriveRowVerification({
      ...base,
      transactions: rows,
      entriesByUrl: new Map([[URL, e]]),
      decisionsById: new Map([[ids[1], { recordId: ids[1], slug: "x", decision: "confirmed", evidence: "page 1 row 2", decidedBy: "trevor", decidedAt: "2026-09-06T00:00:00Z" }]]),
    });
    expect(decided[1]).toMatchObject({ score: 3, state: "human_verified" });
  });
});

describe("compareSecondRead", () => {
  it("pairs by asset and reports a tuple that differs; a trailing symbol never breaks the pairing", () => {
    const p = [tx({ description: "Apple Inc." }), tx({ description: "B" })];
    const s = [tx({ description: "APPLE INC (AAPL)" }), tx({ description: "B", amount: "$15,001-$50,000" })];
    const r = compareSecondRead(p, s);
    expect(r.agreedIndexes).toEqual([0]);
    expect(r.disputedIndexes).toEqual([1]);
    expect(r.differences[0]).toMatch(/^row 2: second model/);
  });

  it("never pairs by position: a skipped row is unread and an invented one is extra", () => {
    const p = [tx({ description: "A" }), tx({ description: "B" }), tx({ description: "C" })];
    const s = [tx({ description: "A" }), tx({ description: "C" }), tx({ description: "D" })];
    const r = compareSecondRead(p, s);
    expect(r.agreedIndexes).toEqual([0, 2]);
    expect(r.unreadIndexes).toEqual([1]);
    expect(r.extraRows.map((x) => x.description)).toEqual(["D"]);
  });
});
