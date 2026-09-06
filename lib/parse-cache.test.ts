import { readLegacyChunkedRecord } from "./parse-cache";
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  findParseRecord,
  hasLegacyCacheOnly,
  legacyParseCachePath,
  parseCacheKey,
  parseCachePath,
  promptHash,
  readChunkedRecord,
  readParseCache,
  writeChunkManifest,
  writeParseCache,
  type ParseCacheKeyInput,
} from "./parse-cache";

const base: ParseCacheKeyInput = {
  pdfSha256: "a".repeat(64),
  sourceUrl: "https://extapps2.oge.gov/x/$FILE/Scott-Bessent-07.14.2025-278T.pdf",
  chunk: null,
  parserVersion: "2026-09-05.1",
  promptSha256: promptHash("system", "extract"),
  model: "claude-sonnet-4-6",
};

describe("parse cache key", () => {
  it("changes when any input changes", () => {
    const k = parseCacheKey(base);
    expect(k).toHaveLength(16);
    expect(parseCacheKey({ ...base, pdfSha256: "b".repeat(64) })).not.toBe(k);
    expect(parseCacheKey({ ...base, sourceUrl: base.sourceUrl + "?v=2" })).not.toBe(k);
    expect(parseCacheKey({ ...base, chunk: { first: 1, last: 10 } })).not.toBe(k);
    expect(parseCacheKey({ ...base, parserVersion: "2026-09-06.1" })).not.toBe(k);
    expect(parseCacheKey({ ...base, promptSha256: promptHash("system", "extract v2") })).not.toBe(k);
    expect(parseCacheKey({ ...base, model: "claude-haiku-4-5" })).not.toBe(k);
  });

  it("is stable for identical inputs", () => {
    expect(parseCacheKey({ ...base })).toBe(parseCacheKey(base));
  });

  it("two documents with the same filename but different bytes do not share a cache", () => {
    const a = parseCachePath("/pdfs/Same-Name.pdf", parseCacheKey(base));
    const b = parseCachePath(
      "/pdfs/Same-Name.pdf",
      parseCacheKey({ ...base, pdfSha256: "c".repeat(64) })
    );
    expect(a).not.toBe(b);
  });
});

describe("parse cache files", () => {
  it("round-trips an envelope and ignores a legacy cache", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "oc-cache-"));
    const pdf = path.join(dir, "filing.pdf");
    writeFileSync(pdf, "%PDF-1.4 stub");

    // Legacy cache present, no keyed cache: read must return null.
    writeFileSync(legacyParseCachePath(pdf), JSON.stringify({ transactions: [{ stale: true }] }));
    expect(readParseCache(pdf, base)).toBeNull();
    expect(hasLegacyCacheOnly(pdf, base)).toBe(true);

    const file = writeParseCache(pdf, base, {
      transactions: [{ description: "x" }],
      tokenUsage: { inputTokens: 1, outputTokens: 2, estimatedCostUsd: 0.01 },
    });
    expect(existsSync(file)).toBe(true);
    const env = readParseCache(pdf, base);
    expect(env?.transactions).toEqual([{ description: "x" }]);
    expect(env?.promptSha256).toBe(base.promptSha256);
    expect(env?.model).toBe(base.model);
    expect(hasLegacyCacheOnly(pdf, base)).toBe(false);

    // A different prompt does not see it.
    expect(readParseCache(pdf, { ...base, promptSha256: promptHash("s", "other") })).toBeNull();
  });

  it("rejects an envelope whose body key disagrees with its file name", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "oc-cache-"));
    const pdf = path.join(dir, "filing.pdf");
    const key = parseCacheKey(base);
    writeFileSync(
      parseCachePath(pdf, key),
      JSON.stringify({ key: "0000000000000000", transactions: [] })
    );
    expect(readParseCache(pdf, base)).toBeNull();
  });
});

describe("chunked filings", () => {
  const input = { ...base };
  const { chunk: _c, ...noChunk } = input;
  void _c;

  function setup() {
    const dir = mkdtempSync(path.join(tmpdir(), "oc-chunks-"));
    const pdf = path.join(dir, "big.pdf");
    writeFileSync(pdf, "%PDF-1.4 big");
    const write = (first: number, last: number, rows: unknown[], override?: Partial<ParseCacheKeyInput>) =>
      writeParseCache(
        path.join(dir, `big.pages${first}-${last}.pdf`),
        { ...noChunk, ...override, chunk: { first, last } },
        { transactions: rows }
      );
    return { dir, pdf, write };
  }

  it("assembles a complete contiguous set in page order", () => {
    const { pdf, write } = setup();
    write(1, 10, [{ r: 1 }]);
    write(11, 20, [{ r: 2 }]);
    writeChunkManifest(pdf, noChunk, 20, [{ first: 11, last: 20 }, { first: 1, last: 10 }]);
    expect(readChunkedRecord(pdf, noChunk)?.transactions).toEqual([{ r: 1 }, { r: 2 }]);
    expect(findParseRecord(pdf, noChunk)?.source).toBe("current-chunks");
  });

  it("rejects a set with a missing tail, a gap, an overlap, or a wrong key", () => {
    const { pdf, write } = setup();
    write(1, 10, [{ r: 1 }]);
    write(11, 20, [{ r: 2 }]);
    // Missing tail: manifest says 30 pages, chunks stop at 20.
    writeChunkManifest(pdf, noChunk, 30, [{ first: 1, last: 10 }, { first: 11, last: 20 }]);
    expect(readChunkedRecord(pdf, noChunk)).toBeNull();
    // Gap: caches exist for 1-9 and 11-20, page 10 is covered by nothing.
    write(1, 9, [{ r: "a" }]);
    writeChunkManifest(pdf, noChunk, 20, [{ first: 1, last: 9 }, { first: 11, last: 20 }]);
    expect(readChunkedRecord(pdf, noChunk)).toBeNull();
    // Overlap: caches exist for 1-11 and 11-20, page 11 is covered twice.
    write(1, 11, [{ r: "b" }]);
    writeChunkManifest(pdf, noChunk, 20, [{ first: 1, last: 11 }, { first: 11, last: 20 }]);
    expect(readChunkedRecord(pdf, noChunk)).toBeNull();
    // A chunk cached under a different PDF hash does not count.
    writeChunkManifest(pdf, noChunk, 20, [{ first: 1, last: 10 }, { first: 11, last: 20 }]);
    write(11, 20, [{ r: "other" }], { pdfSha256: "d".repeat(64) });
    // (the correctly keyed 11-20 cache still exists, so this still passes)
    expect(readChunkedRecord(pdf, noChunk)?.transactions).toEqual([{ r: 1 }, { r: 2 }]);
    // A manifest whose recorded chunk key does not match the expected key is rejected
    // even when the chunk caches exist.
    const wholeKey = parseCacheKey({ ...noChunk, chunk: null });
    const manifestFile = pdf.replace(/\.pdf$/i, `.${wholeKey}.chunks.json`);
    const forged = JSON.parse(readFileSync(manifestFile, "utf-8"));
    forged.chunks[1].key = "0000000000000000";
    writeFileSync(manifestFile, JSON.stringify(forged));
    expect(readChunkedRecord(pdf, noChunk)).toBeNull();
  });
});

describe("readLegacyChunkedRecord", () => {
  it("assembles a contiguous run of legacy chunk caches in page order and rejects a gap", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "legacy-chunks-"));
    const pdf = path.join(dir, "Some-Filing-278T.pdf");
    writeFileSync(pdf, "not really a pdf");
    const chunk = (a: number, b: number, rows: string[]) =>
      writeFileSync(path.join(dir, `Some-Filing-278T.pages${a}-${b}.parsed.json`), JSON.stringify({ transactions: rows.map((description) => ({ description })) }));
    chunk(3, 4, ["c"]);
    chunk(1, 2, ["a", "b"]);
    expect((readLegacyChunkedRecord(pdf) as Array<{ description: string }>).map((r) => r.description)).toEqual(["a", "b", "c"]);
    chunk(6, 6, ["e"]);
    expect(readLegacyChunkedRecord(pdf)).toBeNull();
  });
});
