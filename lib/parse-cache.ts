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
import { existsSync, readFileSync, writeFileSync } from "fs";
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

export function describeCacheKey(input: ParseCacheKeyInput): string {
  const chunk = input.chunk ? `pages ${input.chunk.first}-${input.chunk.last}` : "whole file";
  return `${path.basename(input.sourceUrl)} (${chunk}, pdf ${input.pdfSha256.slice(0, 8)}, prompt ${input.promptSha256.slice(0, 8)}, ${input.model}, parser ${input.parserVersion})`;
}
