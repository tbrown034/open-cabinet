import { readFile } from "fs/promises";
import path from "path";

interface ParsedTransactionsFile {
  count: number;
  transactions: unknown[];
}

interface OfficialData {
  slug: string;
  transactions: unknown[];
}

async function readJson<T>(relativePath: string): Promise<T> {
  const raw = await readFile(path.join(process.cwd(), relativePath), "utf-8");
  return JSON.parse(raw) as T;
}

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected.toLocaleString()}, got ${actual.toLocaleString()}`);
  }
  console.log(`PASS ${label}: ${actual.toLocaleString()}`);
}

async function main() {
  const trump = await readJson<OfficialData>("data/officials/trump-donald-j.json");
  const may8Part2 = await readJson<ParsedTransactionsFile>(
    "data/pdfs/Trump, Donald J.-05.08.2026-278T(2).text-parsed.json"
  );
  const fullDataset = await readJson<{
    officialCount: number;
    transactionCount: number;
    officials: OfficialData[];
  }>("public/data/full-dataset.json");

  assertEqual(may8Part2.count, 3642, "Trump May 8, 2026 part-two parsed count");
  assertEqual(
    may8Part2.transactions.length,
    3642,
    "Trump May 8, 2026 part-two transaction rows"
  );
  assertEqual(trump.transactions.length, 7699, "Trump aggregate profile transaction count");
  assertEqual(fullDataset.officialCount, 37, "Full dataset official count");
  assertEqual(fullDataset.transactionCount, 10033, "Full dataset transaction count");

  const exportedTrump = fullDataset.officials.find((official) => official.slug === "trump-donald-j");
  if (!exportedTrump) {
    throw new Error("Full dataset is missing trump-donald-j");
  }
  assertEqual(
    exportedTrump.transactions.length,
    7699,
    "Full dataset Trump aggregate transaction count"
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
