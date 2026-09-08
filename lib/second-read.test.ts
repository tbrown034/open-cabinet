import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { promptHash, writeParseCache } from "./parse-cache";
import { readSecondReadLog, recordSecondRead, secondReadFiling, SECOND_READ_INPUT, SECOND_READ_MODEL } from "./second-read";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const row = {
  description: "Apple Inc.", ticker: "AAPL", type: "Sale" as const,
  date: "2025-01-02", amount: "$1,001-$15,000" as const, lateFilingFlag: false, confidence: 0.9,
};
const tokenUsage = { inputTokens: 10, outputTokens: 10, estimatedCostUsd: 0.01 };

function setup(transactions: unknown[]) {
  const folder = mkdtempSync(path.join(tmpdir(), "second-read-test-"));
  folders.push(folder);
  const pdfPath = path.join(folder, "filing.pdf");
  const read = vi.fn(async () => ({ transactions, tokenUsage }));
  const input = {
    slug: "example-official", pdfPath, pdfSha256: "pdf-hash", sourceUrl: "https://example.org/filing.pdf",
    candidateSha256: "candidate-hash", primary: [row], units: [{ path: pdfPath, chunk: null }],
    parserVersion: "test-version", systemPrompt: "system", extractionPrompt: "extract", read,
  };
  return { folder, input, read };
}

describe("second-read evidence validation", () => {
  it("does not turn an invalid fresh read into agreement when its cache is reused", async () => {
    // Confidence is outside the compared tuple: both reads used to agree
    // despite the shape gate rejecting the second model's output.
    const { input, read } = setup([{ ...row, confidence: 2 }]);
    const fresh = await secondReadFiling(input);
    const cached = await secondReadFiling(input);
    for (const result of [fresh, cached]) {
      expect(result.failed).toContain("confidence");
      expect(result.agreedIndexes).toEqual([]);
      expect(result.unreadIndexes).toEqual([0]);
      expect(result.pairedDescriptions ?? {}).toEqual({});
    }
    expect(cached.failed).toBe(fresh.failed);
    expect(cached.costUsd).toBe(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("preserves valid agreement on a free cached replay", async () => {
    const { input, read } = setup([row]);
    const fresh = await secondReadFiling(input);
    const cached = await secondReadFiling(input);
    expect(fresh.failed).toBeNull();
    expect(cached.failed).toBeNull();
    expect(cached.agreedIndexes).toEqual([0]);
    expect(cached.costUsd).toBe(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("holds malformed cached rows without crashing or paying for another read", async () => {
    const { input, read } = setup([]);
    writeParseCache(input.pdfPath, {
      pdfSha256: input.pdfSha256, sourceUrl: input.sourceUrl, chunk: null,
      parserVersion: `${input.parserVersion}+${SECOND_READ_INPUT}`,
      promptSha256: promptHash(input.systemPrompt, input.extractionPrompt), model: SECOND_READ_MODEL,
    }, { transactions: [null] });
    const result = await secondReadFiling(input);
    expect(result.failed).toContain("not an object");
    expect(result.rowsSecond).toBe(1);
    expect(result.agreedIndexes).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("withholds agreement for the whole filing when only one chunk fails", async () => {
    const { input, read } = setup([row]);
    input.units.push({ path: input.pdfPath.replace(".pdf", ".second.pdf"), chunk: null });
    read.mockResolvedValueOnce({ transactions: [row], tokenUsage });
    read.mockResolvedValueOnce({ transactions: [{ ...row, confidence: 2 }], tokenUsage });
    const result = await secondReadFiling(input);
    expect(result.failed).toContain("filing.second.pdf");
    expect(result.rowsSecond).toBe(2);
    expect(result.agreedIndexes).toEqual([]);
    expect(result.unreadIndexes).toEqual([0]);
  });

  it("holds invalid legacy file caches without a paid image retry", async () => {
    const { input, read } = setup([]);
    writeParseCache(input.pdfPath, {
      pdfSha256: input.pdfSha256, sourceUrl: input.sourceUrl, chunk: null,
      parserVersion: input.parserVersion,
      promptSha256: promptHash(input.systemPrompt, input.extractionPrompt), model: SECOND_READ_MODEL,
    }, { transactions: [null] });
    const result = await secondReadFiling(input);
    expect(result.failed).toContain("not an object");
    expect(result.agreedIndexes).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("retains failure in the stored log and rejects legacy failure-marked agreements on read", async () => {
    const { folder, input } = setup([{ ...row, confidence: 2 }]);
    const result = await secondReadFiling(input);
    const file = path.join(folder, "second-read-log.json");
    // Simulate an older caller supplying agreement despite a failed read.
    recordSecondRead({ ...result, agreedIndexes: [0] }, input.sourceUrl, file);
    const stored = JSON.parse(readFileSync(file, "utf-8"));
    expect(stored.filings[input.sourceUrl].failed).toContain("shape gate");
    expect(stored.filings[input.sourceUrl].agreedIndexes).toEqual([]);

    delete stored.filings[input.sourceUrl].failed;
    stored.filings[input.sourceUrl].agreedIndexes = [0];
    stored.filings[input.sourceUrl].pairedDescriptions = { "0": row.description };
    writeFileSync(file, JSON.stringify(stored));
    const replayed = readSecondReadLog(file)!.filings[input.sourceUrl];
    expect(replayed.failed).toContain("shape gate");
    expect(replayed.agreedIndexes).toEqual([]);
    expect(replayed.unreadIndexes).toEqual([0]);
    expect(replayed.pairedDescriptions ?? {}).toEqual({});
    // Reading old evidence does not silently rewrite it.
    expect(JSON.parse(readFileSync(file, "utf-8")).filings[input.sourceUrl].agreedIndexes).toEqual([0]);
  });
});
