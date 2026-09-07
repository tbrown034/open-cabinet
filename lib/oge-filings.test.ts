import { describe, expect, it } from "vitest";
import { reconcileKnownFilings } from "./oge-filings";

describe("reconcileKnownFilings", () => {
  it("names published filings OGE no longer lists, and ones it re-dated, matching by decoded URL", async () => {
    const index = [
      { name: "A", pdfUrl: "https://x/$FILE/Name%20A-2026-278T.pdf", docDate: "2026-08-22T04:00:00" },
      { name: "B", pdfUrl: "https://x/$FILE/B-2026-278T.pdf", docDate: "2026-09-01T04:00:00" },
    ];
    const known = [
      { url: "https://x/$FILE/Name A-2026-278T.pdf", date: "2026-08-22" },
      { url: "https://x/$FILE/B-2026-278T.pdf", date: "2026-08-30" },
      { url: "https://x/$FILE/Gone-2020-278T.pdf", date: "2020-07-28" },
    ];
    const r = reconcileKnownFilings(index, known);
    expect(r.missing.map((m) => m.url)).toEqual(["https://x/$FILE/Gone-2020-278T.pdf"]);
    expect(r.redated).toEqual([{ url: "https://x/$FILE/B-2026-278T.pdf", date: "2026-08-30", indexDate: "2026-09-01" }]);
  });
});

describe("amendedFlag", () => {
  it("reads OGE's amended field, or AMENDED in the file name, and nothing else", async () => {
    const { amendedFlag } = await import("./oge-filings");
    expect(amendedFlag({ amended: "2025-08-12T00:00:00" }, "https://x/$FILE/a.pdf")).toBe("2025-08-12T00:00:00");
    expect(amendedFlag({ amended: "" }, "https://x/$FILE/Donald-J-Trump-08.12.2025-278T(2)%20AMENDED.pdf")).toBe("filename");
    expect(amendedFlag({}, "https://x/$FILE/Scott-A-Kupor-07.28.2025-278T.pdf")).toBeUndefined();
  });
});
