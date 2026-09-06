import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { sumAmountEstimates } from "@/lib/format";
import path from "path";
import { describe, expect, it } from "vitest";
import { readRowVerification, recordIdsFor } from "@/lib/row-verification";
import type { OfficialData, Transaction } from "@/lib/types";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf-8");
type ExportTransaction = Transaction & {
  recordId: string;
  verificationScore: number | null;
  verificationState: string | null;
};
const dataset: { transactionCount: number; underReviewCount: number; officials: (Omit<OfficialData, "transactions"> & { transactionCount: number; underReviewCount: number; transactions: ExportTransaction[] })[] } =
  JSON.parse(read("public/data/full-dataset.json"));

// CSV fields may contain escaped quotes, commas and newlines.
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === "\n")) {
      row.push(field);
      field = "";
      if (ch === "\n") { rows.push(row); row = []; }
    } else field += ch;
  }
  return rows;
}

describe("published verification exports", () => {
  it("preserves every source transaction and appends its occurrence ID and recorded verdict", () => {
    const file = readRowVerification();
    expect(file).not.toBeNull();
    if (!file) return;
    let count = 0;
    for (const official of dataset.officials) {
      const source: OfficialData = JSON.parse(read(`data/officials/${official.slug}.json`));
      const ids = recordIdsFor(source.transactions);
      expect(official.transactions).toHaveLength(source.transactions.length);
      const counted = official.transactions.filter((tx) => tx.verificationScore !== 0);
      expect(official.transactionCount).toBe(counted.length);
      expect(official.underReviewCount).toBe(source.transactions.length - counted.length);
      official.transactions.forEach((tx, i) => {
        const { recordId, verificationScore, verificationState, ...raw } = tx;
        expect(raw).toEqual(source.transactions[i]);
        expect(Object.keys(tx).slice(-3)).toEqual(["recordId", "verificationScore", "verificationState"]);
        expect(recordId).toBe(ids[i]);
        expect(file.rows[recordId], `${official.slug}: ${recordId}`).toBeDefined();
        expect(verificationScore).toBe(file.rows[recordId].score);
        expect(verificationState).toBe(file.rows[recordId].state);
        count++;
      });
    }
    expect(count).toBe(dataset.transactionCount + dataset.underReviewCount);
    expect(count).toBe(file.summary.rows);
  });

  it("keeps CSV columns in place and matches every JSON row, including score zero", () => {
    const [headers, ...rows] = parseCsv(read("public/data/all-transactions.csv"));
    expect(headers).toEqual([
      "official_name", "official_title", "agency", "departed_date", "description", "ticker", "type",
      "date", "amount_range", "amount_midpoint", "late_filing", "source_filing_url", "amount_note",
      "recordId", "verificationScore", "verificationState",
    ]);
    const transactions = dataset.officials.flatMap((official) => official.transactions);
    expect(rows).toHaveLength(transactions.length);
    rows.forEach((row, i) => {
      const tx = transactions[i];
      expect(row).toHaveLength(headers.length);
      expect(row[4]).toBe(tx.description);
      expect(row[12]).toBe(tx.amountNote ?? "");
      expect(row.slice(-3)).toEqual([tx.recordId, String(tx.verificationScore), tx.verificationState]);
    });
  });
});


it("generates counted JSON and summary totals while preserving a disputed duplicate in CSV", () => {
  const root = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), "gate2-exports-"));
  const tx: Transaction = {
    description: "Identical lot", ticker: null, type: "Purchase", date: "2026-01-01",
    amount: "$1,001-$15,000", lateFilingFlag: true,
  };
  const source: OfficialData = {
    name: "Example, Person", slug: "example-person", title: "Secretary", agency: "Example",
    level: "Cabinet", filingType: "278-T", mostRecentFilingDate: "2026-05-01",
    transactions: [tx, { ...tx }, { ...tx, type: "Sale", lateFilingFlag: false }],
  };
  const ids = recordIdsFor(source.transactions);
  try {
    mkdirSync(path.join(dir, "data", "officials"), { recursive: true });
    mkdirSync(path.join(dir, "data", "meta"), { recursive: true });
    writeFileSync(path.join(dir, "data", "officials", "example-person.json"), JSON.stringify(source));
    writeFileSync(path.join(dir, "data", "meta", "row-verification.json"), JSON.stringify({
      rows: Object.fromEntries(ids.map((id, i) => [id, {
        id, slug: source.slug, score: i === 0 ? 0 : 1, state: i === 0 ? "disputed" : "single_read",
      }])),
    }));
    const run = () => execFileSync(process.execPath, [
      "--import", createRequire(import.meta.url).resolve("tsx"), path.join(root, "scripts", "generate-exports.ts"),
    ], { cwd: dir, encoding: "utf-8", timeout: 30_000 });
    run();
    const readExport = (file: string) => readFileSync(path.join(dir, "public", "data", file), "utf-8");
    const json = readExport("full-dataset.json");
    const exported = JSON.parse(json);
    expect(exported.transactionCount).toBe(2);
    expect(exported.underReviewCount).toBe(1);
    expect(exported.officials[0].transactionCount).toBe(2);
    expect(exported.officials[0].underReviewCount).toBe(1);
    expect(exported.officials[0].transactions).toHaveLength(3);
    const [headers, summary] = parseCsv(readExport("officials-summary.csv"));
    const values = Object.fromEntries(headers.map((header, i) => [header, summary[i]]));
    expect(values).toMatchObject({
      transaction_count: "2", sales_count: "1", purchases_count: "1", late_filing_count: "1",
      estimated_total_value: String(sumAmountEstimates(source.transactions.slice(1)).estimate),
      under_review_count: "1",
    });
    const [txHeaders, ...csvRows] = parseCsv(readExport("all-transactions.csv"));
    expect(csvRows).toHaveLength(3);
    expect(csvRows[0][txHeaders.indexOf("verificationState")]).toBe("disputed");
    expect(csvRows[0][txHeaders.indexOf("recordId")]).not.toBe(csvRows[1][txHeaders.indexOf("recordId")]);
    run();
    expect(readExport("full-dataset.json")).toBe(json);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
