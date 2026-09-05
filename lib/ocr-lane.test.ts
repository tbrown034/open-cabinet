import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { extractOcrRows, repairOcrText, OCR_LANE_VERSION } from "./ocr-lane";
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
