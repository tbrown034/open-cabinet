import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { diffNewFilings, loadDiscoveredFilingUrls, loadImportedFilingUrls, reconcileKnownFilings, writeLastCheckState } from "./oge-filings";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("discovery versus successful import", () => {
  async function fixture() {
    const root = await mkdtemp(path.join(tmpdir(), "oc-filing-progress-"));
    roots.push(root);
    await mkdir(path.join(root, "data/officials"), { recursive: true });
    const saved = { name: "Example", pdfUrl: "https://example.org/saved.pdf", docDate: "2026-08-01" };
    const pending = { name: "Example", pdfUrl: "https://example.org/pending.pdf", docDate: "2026-09-01" };
    const officialPath = path.join(root, "data/officials/example.json");
    await writeFile(officialPath, JSON.stringify({ sourceFilings: [{ url: saved.pdfUrl }], transactions: [] }));
    return { root, saved, pending, officialPath };
  }

  it.each(["pending", "downloaded", "download_failed", "held", "processed"])(
    "retries an unsaved filing even if discovery recorded %s; skips saved filings",
    async (status) => {
      const { root, saved, pending, officialPath } = await fixture();
      const filings = [saved, pending];
      await writeLastCheckState({ root, filings, newFilings: [{ ...pending, status }] });
      expect(diffNewFilings(filings, await loadDiscoveredFilingUrls(root))).toEqual([]);
      expect(diffNewFilings(filings, await loadImportedFilingUrls(root))).toEqual([pending]);

      // A failed or held attempt saves no source entry. A second run must
      // still select it, regardless of the monitor's historical labels.
      expect(diffNewFilings(filings, await loadImportedFilingUrls(root))).toEqual([pending]);

      // Acceptance saves source provenance even when dedup adds zero rows.
      await writeFile(officialPath, JSON.stringify({ sourceFilings: filings.map((f) => ({ url: f.pdfUrl })), transactions: [] }));
      expect(diffNewFilings(filings, await loadImportedFilingUrls(root))).toEqual([]);
    }
  );

  it("ignores historical discovery URL maps for import selection", async () => {
    const { root, pending } = await fixture();
    await mkdir(path.join(root, "data/meta"), { recursive: true });
    await writeFile(path.join(root, "data/meta/last-check.json"), JSON.stringify({ knownFilings: { [pending.pdfUrl]: 1 } }));
    expect((await loadDiscoveredFilingUrls(root)).has(pending.pdfUrl)).toBe(true);
    expect((await loadImportedFilingUrls(root)).has(pending.pdfUrl)).toBe(false);
  });

  it("does not reimport the same PDF when the saved URL uses a literal space", async () => {
    const { root, officialPath, pending } = await fixture();
    const rawUrl = "https://example.org/Donald-J-Trump-06.25.2026-278T (2).pdf";
    await writeFile(officialPath, JSON.stringify({ sourceFilings: [{ url: rawUrl }] }));
    const filing = { ...pending, pdfUrl: rawUrl.replace(" ", "%20") };
    expect(diffNewFilings([filing], await loadImportedFilingUrls(root))).toEqual([]);
    expect(diffNewFilings([{ ...filing, pdfUrl: rawUrl }], new Set([filing.pdfUrl]))).toEqual([]);
    expect(diffNewFilings([{ ...filing, pdfUrl: rawUrl.replace("(2)", "(3)") }], new Set([filing.pdfUrl]))).toHaveLength(1);
  });

  it("stops on unreadable official data instead of selecting every filing again", async () => {
    const { root, officialPath } = await fixture();
    await writeFile(officialPath, "not JSON");
    await expect(loadImportedFilingUrls(root)).rejects.toThrow();
    await rm(path.join(root, "data/officials"), { recursive: true });
    await expect(loadImportedFilingUrls(root)).rejects.toThrow();
  });
});

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
