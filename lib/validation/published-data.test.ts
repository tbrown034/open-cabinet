import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cli = resolve("scripts/validate.ts");
const tsx = resolve("node_modules/tsx/dist/cli.mjs");
const fixtures: string[] = [];
const row = {
  description: "Example company",
  ticker: "MSFT",
  type: "Sale",
  date: "2025-03-04",
  amount: "$50,001-$100,000",
  lateFilingFlag: false,
  sourceUrl: "https://example.com/first.pdf",
};

function runValidation(transactions: typeof row[]) {
  const dir = mkdtempSync(join(tmpdir(), "open-cabinet-validation-"));
  fixtures.push(dir);
  mkdirSync(join(dir, "data", "officials"), { recursive: true });
  mkdirSync(join(dir, "data", "golden"), { recursive: true });
  writeFileSync(join(dir, "data", "officials", "example.json"), JSON.stringify({
    name: "Example Official", slug: "example", transactions,
  }));
  writeFileSync(join(dir, "data", "golden", "example.golden.json"), JSON.stringify({
    slug: "example", sampleTransactions: [row],
  }));
  return spawnSync(process.execPath, [tsx, cli], { cwd: dir, encoding: "utf-8" });
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("published-data validation command", () => {
  it("exits 0 for a valid dataset matching its golden reference", () => {
    const result = runValidation([row]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Golden files: 1/1 passed");
    expect(result.stdout).toContain("Result: PASS");
  });

  it("exits 2 when the same transaction appears in different filings", () => {
    const result = runValidation([row, { ...row, sourceUrl: "https://example.com/second.pdf" }]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Cross-filing repeats (review): 1");
    expect(result.stdout).toContain("Result: REVIEW");
  });

  it("exits 1 for schema failures even when there are review-required repeats", () => {
    const result = runValidation([
      row,
      { ...row, sourceUrl: "https://example.com/second.pdf" },
      { ...row, amount: "not a legal range" },
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Schema failures: 1");
    expect(result.stdout).toContain("Cross-filing repeats (review): 1");
    expect(result.stdout).toContain("Result: FAIL");
  });

  it("exits 1 when the golden reference no longer matches", () => {
    const result = runValidation([{ ...row, amount: "$1,001-$15,000" }]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Golden files: 0/1 passed");
    expect(result.stdout).toContain("Result: FAIL");
  });
});
