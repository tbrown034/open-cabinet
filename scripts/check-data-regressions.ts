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
    historicalCount: number;
    officials: OfficialData[];
  }>("public/data/full-dataset.json");

  assertEqual(may8Part2.count, 3642, "Trump May 8, 2026 part-two parsed count");
  assertEqual(
    may8Part2.transactions.length,
    3642,
    "Trump May 8, 2026 part-two transaction rows"
  );
  assertEqual(trump.transactions.length, 8940, "Trump aggregate profile transaction count");
  // Aug 22, 2026 ingest: Trump 08.12.2026 filing (+1,051, rows 1-1051 visually
  // reconciled against printed row numbers), Kupor 07.15 + 07.20 (+5)
  assertEqual(fullDataset.officialCount, 40, "Full dataset official count");
  // Sep 6, 2026: re-read applied (Trump 8,940 -> 8,944), Landau/Bisignano and others +10,
  // Chavez-DeRemer name-wrap -1, Dixon duplicate -1, four superseded rows of the
  // Aug 12, 2025 amendment removed (Trump 8,944 -> 8,940): 11,509.
  // Sep 8: three MacGregor rows remain in the export as history; no rows removed.
  // Sep 11: Warsh 08.06 (+5), Ueland 08.06 (+37, new official), McMaster 06.11(1) (+4): 11,555.
  assertEqual(fullDataset.transactionCount, 11552, "Full dataset counted transaction count");
  assertEqual(fullDataset.historicalCount, 3, "Full dataset historical transaction count");
  assertEqual(fullDataset.officials.reduce((n, o) => n + o.transactions.length, 0), 11555, "Full dataset preserved rows");

  const exportedTrump = fullDataset.officials.find((official) => official.slug === "trump-donald-j");
  if (!exportedTrump) {
    throw new Error("Full dataset is missing trump-donald-j");
  }
  assertEqual(
    exportedTrump.transactions.length,
    8940,
    "Full dataset Trump aggregate transaction count"
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
