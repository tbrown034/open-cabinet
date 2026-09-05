import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  hasLegacyCacheOnly,
  legacyParseCachePath,
  parseCacheKey,
  parseCachePath,
  promptHash,
  readParseCache,
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
