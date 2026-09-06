import { readFileSync } from "fs";
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
const dataset: { transactionCount: number; officials: (Omit<OfficialData, "transactions"> & { transactions: ExportTransaction[] })[] } =
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
    expect(count).toBe(dataset.transactionCount);
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
