/**
 * Parse cache with an honest key.
 *
 * A parse is a function of six inputs: the PDF bytes, where they came
 * from, which pages (when a large filing is split), the prompt, the parser
 * version and the model. The old cache keyed on the PDF's path alone, so a
 * prompt fix never reached a filing that already had a `.parsed.json` on
 * disk, and two OGE documents with the same filename would share one
 * cache. This module keys on all six and stores them in the file, so a
 * cache can be audited as well as reused.
 *
 * Legacy `.parsed.json` files are never read as authoritative and never
 * deleted. They are historical evidence of what the model said under an
 * earlier prompt.
 *
 * Reusing a cache is not the same as re-parsing. A published filing is
 * re-parsed only when someone runs the ingest against it deliberately
 * (see scripts/plan-reparse.ts); the weekly job visits new filings only.
 */
import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export interface ParseCacheKeyInput {
  /** SHA-256 of the whole filing PDF, hex. */
  pdfSha256: string;
  /** Canonical OGE URL the PDF was downloaded from. */
  sourceUrl: string;
  /** Page range when the filing was split into chunks; null for the whole file. */
  chunk: { first: number; last: number } | null;
  /** From scripts/parse-pdf.ts. Bumped when the contract changes. */
  parserVersion: string;
  /** SHA-256 of the system prompt plus the extraction prompt. */
  promptSha256: string;
  /** Model identifier the parse was made with. */
  model: string;
}

export interface ParseCacheEnvelope extends ParseCacheKeyInput {
  key: string;
  parsedAt: string;
  transactions: unknown[];
  tokenUsage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256File(filePath: string): string {
  return sha256Hex(readFileSync(filePath));
}

export function promptHash(systemPrompt: string, extractionPrompt: string): string {
  return sha256Hex(`${systemPrompt}\n---\n${extractionPrompt}`);
}

/** Sixteen hex characters of the hash over every input, in a fixed order. */
export function parseCacheKey(input: ParseCacheKeyInput): string {
  const chunk = input.chunk ? `${input.chunk.first}-${input.chunk.last}` : "whole";
  return sha256Hex(
    [
      input.pdfSha256,
      input.sourceUrl,
      chunk,
      input.parserVersion,
      input.promptSha256,
      input.model,
    ].join("\n")
  ).slice(0, 16);
}

/** `<pdf basename>.<key>.parsed.json`, beside the PDF. */
export function parseCachePath(pdfPath: string, key: string): string {
  return pdfPath.replace(/\.pdf$/i, `.${key}.parsed.json`);
}

/** The pre-2026-09 cache location, kept only as evidence. */
export function legacyParseCachePath(pdfPath: string): string {
  return pdfPath.replace(/\.pdf$/i, ".parsed.json");
}

export function readParseCache(
  pdfPath: string,
  input: ParseCacheKeyInput
): ParseCacheEnvelope | null {
  const key = parseCacheKey(input);
  const file = parseCachePath(pdfPath, key);
  if (!existsSync(file)) return null;
  try {
    const env = JSON.parse(readFileSync(file, "utf-8")) as ParseCacheEnvelope;
    // Belt and braces: the file name carries the key, the body must agree.
    if (env.key !== key || !Array.isArray(env.transactions)) return null;
    return env;
  } catch {
    return null;
  }
}

export function writeParseCache(
  pdfPath: string,
  input: ParseCacheKeyInput,
  body: {
    transactions: unknown[];
    tokenUsage?: ParseCacheEnvelope["tokenUsage"];
  }
): string {
  const key = parseCacheKey(input);
  const file = parseCachePath(pdfPath, key);
  const env: ParseCacheEnvelope = {
    key,
    ...input,
    parsedAt: new Date().toISOString(),
    transactions: body.transactions,
    ...(body.tokenUsage ? { tokenUsage: body.tokenUsage } : {}),
  };
  writeFileSync(file, JSON.stringify(env, null, 2) + "\n");
  return file;
}

/** True when only an old path-keyed cache exists for this PDF. */
export function hasLegacyCacheOnly(pdfPath: string, input: ParseCacheKeyInput): boolean {
  return (
    existsSync(legacyParseCachePath(pdfPath)) &&
    !existsSync(parseCachePath(pdfPath, parseCacheKey(input)))
  );
}

/** Is this filing a 278-TERM termination report, by file name? Shared by
 *  the sweep, the ingest and the comparator so all three agree. */
export function isTerminationForm(fileName: string): boolean {
  return /278-?TERM/i.test(fileName);
}

/** A chunked filing's record of which chunk caches compose it. */
export interface ChunkManifest {
  key: string;
  pageCount: number;
  chunks: Array<{ first: number; last: number; key: string }>;
  writtenAt: string;
}

/** `<pdf basename>.<whole-file key>.chunks.json`, beside the PDF. */
export function chunkManifestPath(pdfPath: string, wholeKey: string): string {
  return pdfPath.replace(/\.pdf$/i, `.${wholeKey}.chunks.json`);
}

export function writeChunkManifest(
  pdfPath: string,
  inputWithoutChunk: Omit<ParseCacheKeyInput, "chunk">,
  pageCount: number,
  chunks: Array<{ first: number; last: number }>
): string {
  const wholeKey = parseCacheKey({ ...inputWithoutChunk, chunk: null });
  const manifest: ChunkManifest = {
    key: wholeKey,
    pageCount,
    chunks: chunks.map((c) => ({
      first: c.first,
      last: c.last,
      key: parseCacheKey({ ...inputWithoutChunk, chunk: { first: c.first, last: c.last } }),
    })),
    writtenAt: new Date().toISOString(),
  };
  const file = chunkManifestPath(pdfPath, wholeKey);
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  return file;
}

/**
 * Assemble a chunked filing's rows from its manifest. Returns null unless
 * the manifest names chunks that cover pages 1..pageCount contiguously
 * with no overlap, every chunk cache exists, and every envelope's key and
 * PDF hash match. A partial or mismatched set never passes as a filing.
 */
export function readChunkedRecord(
  pdfPath: string,
  inputWithoutChunk: Omit<ParseCacheKeyInput, "chunk">
): { transactions: unknown[]; pageCount: number } | null {
  const wholeKey = parseCacheKey({ ...inputWithoutChunk, chunk: null });
  const file = chunkManifestPath(pdfPath, wholeKey);
  if (!existsSync(file)) return null;
  let manifest: ChunkManifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf-8")) as ChunkManifest;
  } catch {
    return null;
  }
  if (manifest.key !== wholeKey || !Array.isArray(manifest.chunks) || manifest.chunks.length === 0) return null;
  const chunks = [...manifest.chunks].sort((a, b) => a.first - b.first);
  let expectedFirst = 1;
  const transactions: unknown[] = [];
  for (const c of chunks) {
    if (c.first !== expectedFirst || c.last < c.first) return null; // gap or overlap
    const expectedKey = parseCacheKey({ ...inputWithoutChunk, chunk: { first: c.first, last: c.last } });
    if (c.key !== expectedKey) return null;
    const chunkPath = pdfPath.replace(/\.pdf$/i, `.pages${c.first}-${c.last}.pdf`);
    const env = readParseCache(chunkPath, { ...inputWithoutChunk, chunk: { first: c.first, last: c.last } });
    if (!env || env.pdfSha256 !== inputWithoutChunk.pdfSha256) return null;
    transactions.push(...env.transactions);
    expectedFirst = c.last + 1;
  }
  if (expectedFirst !== manifest.pageCount + 1) return null; // tail missing
  return { transactions, pageCount: manifest.pageCount };
}

export type ParseRecordSource = "current" | "current-chunks" | "legacy" | "legacy-chunks";

/**
 * Legacy chunk caches: <base>.pages{a}-{b}.parsed.json written by the old
 * ingest for large filings, with no manifest. Accepted only as a complete
 * run: the first chunk starts at page 1 and every next chunk starts where
 * the previous one ended. Rows are concatenated in page order, which is
 * document order, as the positional comparator needs.
 */
export function readLegacyChunkedRecord(pdfPath: string): unknown[] | null {
  const dir = path.dirname(pdfPath);
  const base = path.basename(pdfPath, path.extname(pdfPath));
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.pages(\\d+)-(\\d+)\\.parsed\\.json$`);
  const chunks: Array<{ first: number; last: number; file: string }> = [];
  for (const f of readdirSync(dir)) {
    const m = f.match(re);
    if (m) chunks.push({ first: Number(m[1]), last: Number(m[2]), file: path.join(dir, f) });
  }
  if (chunks.length === 0) return null;
  chunks.sort((a, b) => a.first - b.first);
  let expected = 1;
  const rows: unknown[] = [];
  for (const c of chunks) {
    if (c.first !== expected || c.last < c.first) return null;
    try {
      const parsed = JSON.parse(readFileSync(c.file, "utf-8"));
      const transactions = parsed.transactions ?? parsed;
      if (!Array.isArray(transactions)) return null;
      rows.push(...transactions);
    } catch {
      return null;
    }
    expected = c.last + 1;
  }
  return rows;
}

/**
 * The parse record to compare a filing against, newest first: a current
 * keyed cache for the whole file, else a complete manifest-verified set
 * of current chunk caches, else the legacy path-keyed cache, else a
 * complete contiguous run of legacy chunk caches, else nothing. Reports
 * which it found so a log entry can say.
 */
export function findParseRecord(
  pdfPath: string,
  inputWithoutChunk: Omit<ParseCacheKeyInput, "chunk">
): { source: ParseRecordSource; transactions: unknown[] } | null {
  const whole = readParseCache(pdfPath, { ...inputWithoutChunk, chunk: null });
  if (whole) return { source: "current", transactions: whole.transactions };

  const chunked = readChunkedRecord(pdfPath, inputWithoutChunk);
  if (chunked) return { source: "current-chunks", transactions: chunked.transactions };

  const legacy = legacyParseCachePath(pdfPath);
  if (existsSync(legacy)) {
    try {
      const c = JSON.parse(readFileSync(legacy, "utf-8"));
      const transactions = c.transactions ?? c;
      if (Array.isArray(transactions)) return { source: "legacy", transactions };
    } catch {
      /* unreadable */
    }
  }
  const legacyChunks = readLegacyChunkedRecord(pdfPath);
  if (legacyChunks) return { source: "legacy-chunks", transactions: legacyChunks };
  return null;
}

export function describeCacheKey(input: ParseCacheKeyInput): string {
  const chunk = input.chunk ? `pages ${input.chunk.first}-${input.chunk.last}` : "whole file";
  return `${path.basename(input.sourceUrl)} (${chunk}, pdf ${input.pdfSha256.slice(0, 8)}, prompt ${input.promptSha256.slice(0, 8)}, ${input.model}, parser ${input.parserVersion})`;
}
