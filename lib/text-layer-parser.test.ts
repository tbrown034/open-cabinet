import { describe, expect, it } from "vitest";
import { parseTextLayer } from "../scripts/text-layer-crosscheck";

const header = `
 #         DESCRIPTION                                                        TYPE                   DATE                   NOTIFICATION RECEIVED   AMOUNT
                                                                                                                             OVER 30 DAYS AGO
`;

describe("text-layer column parser", () => {
  it("reads an ordinary row", () => {
    const r = parseTextLayer(`${header}
 1         SPDR Gold Shares (GLD)                                             Sale                   03/04/2025             No                     $50,001 - $100,000
`);
    expect(r.kind).toBe("rows");
    if (r.kind !== "rows") return;
    expect(r.rows).toEqual([
      { rowNumber: 1, type: "Sale", date: "2025-03-04", amount: "$50,001-$100,000", lateFilingFlag: false, description: "SPDR Gold Shares (GLD)" },
    ]);
  });

  it("pairs a wrapped upper bound and skips an option strike price in the description", () => {
    // MacGregor 08.07.2025: the old parser produced "$50,001-$57".
    const r = parseTextLayer(`${header}
 2         NextEra Energy, Inc. (NEE) (option strike price                   Purchase               07/10/2025             No                     $50,001 -
           $57.27)                                                                                                                                $100,000
`);
    if (r.kind !== "rows") throw new Error(r.kind);
    expect(r.rows[0].amount).toBe("$50,001-$100,000");
  });

  it("treats numbered account headers and blank lines as placeholders, not missing rows", () => {
    // Burgum 06.12.2025: rows 1, 4, 8, 9 are numbered but hold no transaction.
    const r = parseTextLayer(`${header}
 1         Spouse Investment Account #1                                                                                             No

 2         Goldman Sachs GQG Partners International                                    Purchase              05/02/2025             No                    $1,001 - $15,000
           Opportunities Fund Institutional Class Shs (GSIMX)

 3         Line is intentionally left blank                                                                                         No

 4         Retirement Account #1                                                                                                    No

 5         Vanguard Total Stock Market ETF (VTI)                                       Sale                  05/03/2025             Yes                   $15,001 - $50,000
`);
    if (r.kind !== "rows") throw new Error(r.kind);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([2, 5]);
    expect(r.placeholderRows).toEqual([1, 3, 4]);
    expect(r.rows[1].lateFilingFlag).toBe(true);
  });

  it("reports a filing typo faithfully instead of correcting it", () => {
    // Kennedy 05.09.2025 prints 04/04/2225. The lane must say 2225 so a
    // person sees the disagreement with the model's silent correction.
    const r = parseTextLayer(`${header}
 9         NIKE, Inc. (NKE)                                                   Sale                   04/04/2225             No                     $1,001 - $15,000
`);
    if (r.kind !== "rows") throw new Error(r.kind);
    expect(r.rows[0].date).toBe("2225-04-04");
  });

  it("maps the filing's not-ascertainable wording to the shared unknown token", () => {
    const r = parseTextLayer(`${header}
 1         Total return swap contract with JPMorgan                           Purchase               10/22/2025             No                     Value Not Readily Ascertainable
`);
    if (r.kind !== "rows") throw new Error(r.kind);
    expect(r.rows[0].amount).toBe("unknown");
  });

  it("fails closed when a table is present but no rows parse", () => {
    const r = parseTextLayer(
      `Transactions\n   Purchase   01/02/2025   $1,001 - $15,000  (layout with no numbered rows)\n`
    );
    expect(r.kind).toBe("tool-error");
  });

  it("calls a page with no table text a scan", () => {
    expect(parseTextLayer("").kind).toBe("no-text");
  });

  it("reads a wrapped description across lines and flags a different asset name softly", async () => {
    const { compareExtraction } = await import("../scripts/text-layer-crosscheck");
    const r = parseTextLayer(`${header}
 1         NextEra Energy, Inc. (NEE) (option strike price                   Purchase               07/10/2025             No                     $50,001 -
           $57.27)                                                                                                                                $100,000
`);
    if (r.kind !== "rows") throw new Error(r.kind);
    expect(r.rows[0].description).toBe("NextEra Energy, Inc. (NEE) (option strike price");
    const same = compareExtraction(r, [{ type: "Purchase", date: "2025-07-10", amount: "$50,001-$100,000", lateFilingFlag: false, description: "NEXTERA ENERGY INC" }]);
    expect(same.status).toBe("ok");
    const other = compareExtraction(r, [{ type: "Purchase", date: "2025-07-10", amount: "$50,001-$100,000", lateFilingFlag: false, description: "Duke Energy Corp" }]);
    expect(other.status).toBe("mismatch");
    if (other.status === "mismatch") expect(other.problems[0]).toMatch(/name differs/);
  });
});
