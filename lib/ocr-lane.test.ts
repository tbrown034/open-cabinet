import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { alignByPrintedRow, columnizeOcrRows, extractOcrRows, repairOcrText, repairRowSequence, withholdRepairs, OCR_LANE_VERSION } from "./ocr-lane";
import { compareExtraction } from "../scripts/text-layer-crosscheck";

const header = `
 #         DESCRIPTION                                                        TYPE                   DATE                   NOTIFICATION RECEIVED   AMOUNT
                                                                                                                             OVER 30 DAYS AGO
`;

describe("OCR repairs", () => {
  it("fixes O-for-0 and l-for-1 only inside dollar amounts, dates and row numbers", () => {
    const line = " 1O        Coca Cola Company (KO) Class O shares         Sale     O4/O4/2O25    No     $1,OOl - $l5,OOO";
    const fixed = repairOcrText(line);
    expect(fixed).toContain("04/04/2025");
    expect(fixed).toContain("$1,001 - $15,000");
    expect(fixed.startsWith(" 10        ")).toBe(true);
    // The description is untouched: "Class O shares" keeps its O.
    expect(fixed).toContain("Class O shares");
  });

  it("pads a hand-typed date and capitalizes a type word that stands alone in its column", () => {
    const line = " 34        Goldman Sachs Group Inc                    purchase        6/15/2026        Yes $250,001 - $500,000";
    const fixed = repairOcrText(line);
    expect(fixed).toContain("Purchase        06/15/2026");
    // The e-filed form scans print "no" in lowercase.
    expect(repairOcrText("1 BLACK BELT ENERGY 4.00 % Due Oct 1, 2052 purchase 2/23/2026 no | $100,001 - $250,000")).toContain("02/23/2026 no".replace("no", "No"));
    // A type word inside a description is left alone.
    expect(repairOcrText(" 2         Wholesale purchase club (BJ)   Sale    04/01/2026   No   $1,001 - $15,000")).toContain("purchase club");
  });

  it("restores a dollar sign read as S", () => {
    expect(repairOcrText("  S1,001 - S15,000")).toBe("  $1,001 - $15,000");
    // A real word starting with S is left alone.
    expect(repairOcrText("  Sale  S&P 500")).toBe("  Sale  S&P 500");
  });
});

describe("OCR lane through the shared parser and comparator", () => {
  const ocrPage = `${header}
 1         KROGER CO (THE)                                                    Purchase               O5/11/2026             Yes                    $1OO,OOl - $250,000

 2         CIGNA GROUP (THE)                                                  Sale                   04/27/2026             Yes                    $15,001 - $50,000

 3         Line is intentionally left blank                                                                                         No

 4         COCA COLA COMPANY (THE)                                            Sale                   04/27/2026             Yes                    $1,001 - $15,000
`;

  it("parses OCR text into the same row shape as the text lane", () => {
    const r = extractOcrRows(ocrPage);
    expect(r.kind).toBe("rows");
    if (r.kind !== "rows") return;
    expect(r.rows.map((x) => x.rowNumber)).toEqual([1, 2, 4]);
    expect(r.rows[0]).toEqual({ rowNumber: 1, type: "Purchase", date: "2026-05-11", amount: "$100,001-$250,000", lateFilingFlag: true });
    expect(r.placeholderRows).toEqual([3]);
  });

  it("agrees row for row with a matching parse and names the OCR lane in a disagreement", () => {
    const parsed = [
      { type: "Purchase", date: "2026-05-11", amount: "$100,001-$250,000", lateFilingFlag: true },
      { type: "Sale", date: "2026-04-27", amount: "$15,001-$50,000", lateFilingFlag: true },
      { type: "Sale", date: "2026-04-27", amount: "$1,001-$15,000", lateFilingFlag: true },
    ];
    expect(compareExtraction(extractOcrRows(ocrPage), parsed, "OCR")).toEqual({ status: "ok", rowCount: 3 });
    const wrong = [...parsed];
    wrong[1] = { ...wrong[1], amount: "$1,001-$15,000" };
    const r = compareExtraction(extractOcrRows(ocrPage), wrong, "OCR");
    expect(r.status).toBe("mismatch");
    if (r.status !== "mismatch") return;
    expect(r.problems[0]).toMatch(/^row 2: OCR \[Sale\|2026-04-27\|\$15,001-\$50,000\|late\] vs AI parse/);
  });

  it("says when OCR text held no rows, instead of calling the filing a scan", () => {
    const r = extractOcrRows("random noise\n\f more noise");
    expect(r.kind).toBe("tool-error");
    if (r.kind !== "tool-error") return;
    expect(r.message).toMatch(/ocr: no transaction rows/);
  });
});

describe("OCR row handling", () => {
  const row = (rowNumber: number) => ({ rowNumber, type: "Sale", date: "2026-06-18", amount: "$1,001-$15,000", lateFilingFlag: true });

  it("repairs a misread row number only when sandwiched between rows that agree on its place", () => {
    // Trump Aug 2026: 297, 1298, 299 (gridline as a leading 1) and 848, 349, 850.
    const r = repairRowSequence([row(297), row(1298), row(299), row(848), row(349), row(850)]);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([297, 298, 299, 848, 849, 850]);
    expect(r.repaired).toBe(2);
  });

  it("repairs the leading-1 gridline artifact by its exact offset when the next row cannot vouch", () => {
    const r = repairRowSequence([row(283), row(1284), row(1286)]);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([283, 284, 1286]);
    expect(r.repaired).toBe(1);
  });

  it("never lets a repaired number become agreement: [1, 3, 3] cannot pass as [1, 2, 3]", () => {
    // Review, Sep 6: the sandwich rule turned a duplicate into a filled gap
    // and the comparator said ok. The repair still happens (it is the
    // best guess of where the row sits) but the filing is never ok as a
    // whole and the row is excluded from the agreed list.
    const r = repairRowSequence([row(1), row(3), row(3)]);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([1, 2, 3]);
    expect(r.repairedRowNumbers).toEqual([2]);
    const held = withholdRepairs({ status: "ok", rowCount: 3 }, r.repairedRowNumbers);
    expect(held.status).toBe("mismatch");
    const parsed = [row(1), row(2), row(3)].map((x) => ({ type: x.type, date: x.date, amount: x.amount, lateFilingFlag: x.lateFilingFlag }));
    const a = alignByPrintedRow({ kind: "rows", rows: r.rows, placeholderRows: [], repairedRowNumbers: r.repairedRowNumbers }, parsed)!;
    expect(a.agreedPrintedRows).toEqual([1, 3]);
    expect(a.repairedPrintedRows).toEqual([2]);
  });

  it("leaves a real gap alone", () => {
    const r = repairRowSequence([row(11), row(14), row(15)]);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([11, 14, 15]);
    expect(r.repaired).toBe(0);
  });

  it("rebuilds column gaps from a mode-4 line and keeps wrapped text with its row", () => {
    const text = "34 Goldman Sachs Group Inc Purchase 06/15/2026 Yes $250,001 - $500,000\nwrapped tail\n35 Broadcom Inc Purchase 06/15/2026 Yes $100,001 - $250,000";
    const out = columnizeOcrRows(text);
    const r = extractOcrRows(out);
    if (r.kind !== "rows") throw new Error(r.kind);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([34, 35]);
    expect(r.rows[0].amount).toBe("$250,001-$500,000");
  });

  it("aligns readable rows by printed number when the count differs, and counts the unread", () => {
    const extraction = { kind: "rows" as const, rows: [row(1), row(3)], placeholderRows: [] };
    const parsed = [
      { type: "Sale", date: "2026-06-18", amount: "$1,001-$15,000", lateFilingFlag: true },
      { type: "Sale", date: "2026-06-18", amount: "$1,001-$15,000", lateFilingFlag: true },
      { type: "Sale", date: "2026-06-18", amount: "$15,001-$50,000", lateFilingFlag: true },
    ];
    const a = alignByPrintedRow(extraction, parsed)!;
    expect(a).toMatchObject({ compared: 2, agree: 1, differ: 1, unread: 1 });
    expect(a.differences[0]).toMatch(/^row 3: OCR \[Sale\|2026-06-18\|\$1,001-\$15,000\|late\] vs AI parse \[Sale\|2026-06-18\|\$15,001-\$50,000\|late\]/);
  });
});

describe("OCR states are rendered and documented", () => {
  it("the methodology page renders both OCR states from the log", () => {
    const page = readFileSync(path.join(process.cwd(), "app", "methodology", "page.tsx"), "utf-8");
    expect(page).toContain("ocr_tuple_agreement");
    expect(page).toContain("ocr_tuple_mismatch");
  });

  it("the pipeline page describes the OCR lane and the lane version is dated", () => {
    const doc = readFileSync(path.join(process.cwd(), "research", "pipeline.md"), "utf-8");
    expect(doc).toContain("lib/ocr-lane.ts");
    expect(doc).toContain("ocr_tuple_agreement");
    expect(OCR_LANE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});
