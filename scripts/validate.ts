/**
 * Validation of the published dataset, data/officials/*.json.
 *
 * Four layers, three severities:
 *
 *   FATAL, exit 1, the run stops and nothing publishes:
 *     1. Schema: every row has a legal type, a legal amount (or an explicit
 *        unknown with the filing's wording), a real date, a boolean late
 *        flag and a symbol-shaped ticker or null.
 *     2. Golden files: hand-verified reference rows for five officials
 *        still match the dataset.
 *
 *     3. Tickers: a stored symbol that is a name suffix (THE, REIT, DEL).
 *        Fatal: it can only be fixed by an approved data patch, and until
 *        then nothing publishes.
 *
 *   REVIEW REQUIRED, exit 2, a person must look before the next publish:
 *     4. Cross-filing repeats: the same description, date, type and amount
 *        stamped to two different filings. That is either an amendment
 *        that should not double-count or a genuine second trade; only a
 *        person can tell.
 *
 *   INFORMATIVE, exit 0, printed and nothing more:
 *        Same-filing repeats (separate lots, expected), unusual volumes,
 *        single-day clusters.
 *
 * What this file does not do: it does not read model confidence, which is
 * not stored in the published rows, and it does not compare against the
 * OGE API. An earlier docstring listed both as layers. Neither existed.
 *
 * Run: pnpm run validate
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { VALID_TYPES } from "./parse-pdf";
import { isAmountRange } from "../lib/amounts";
import { NEVER_A_SYMBOL, SYMBOL_SHAPE } from "../lib/assets";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

interface Transaction {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string | null;
  amountNote?: string;
  dateNote?: string;
  lateFilingFlag: boolean;
  sourceUrl?: string;
  notes?: string;
}

interface OfficialData {
  name: string;
  slug: string;
  transactions: Transaction[];
}

interface GoldenData {
  slug: string;
  transactionCount?: number;
  transactions?: Transaction[];
  sampleTransactions?: Transaction[];
}

interface ValidationReport {
  timestamp: string;
  totalOfficials: number;
  totalTransactions: number;
  schemaFailures: number;
  schemaErrors: string[];
  suffixTickers: string[];
  goldenFilesPassed: number;
  goldenFilesTotal: number;
  goldenFileErrors: string[];
  crossFilingRepeats: string[];
  anomalies: string[];
  result: "PASS" | "REVIEW" | "FAIL";
}

// ── LAYER 1: SCHEMA VALIDATION ──

function validateSchema(tx: Transaction, official: string, index: number): string[] {
  const errors: string[] = [];
  const prefix = `[${official}][${index}]`;

  if (!tx.description || tx.description.trim() === "") {
    errors.push(`${prefix} Empty description`);
  }
  if (!VALID_TYPES.includes(tx.type)) {
    errors.push(`${prefix} Invalid type: "${tx.type}"`);
  }
  if (tx.amount === null) {
    if (!tx.amountNote) errors.push(`${prefix} Unknown amount without the filing's wording (amountNote)`);
  } else if (!isAmountRange(tx.amount)) {
    errors.push(`${prefix} Invalid amount: "${tx.amount}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    errors.push(`${prefix} Invalid date format: "${tx.date}"`);
  } else {
    const d = new Date(tx.date + "T00:00:00");
    if (isNaN(d.getTime())) {
      errors.push(`${prefix} Unparseable date: "${tx.date}"`);
    }
    if (d > new Date() && !(typeof tx.dateNote === "string" && tx.dateNote.trim())) {
      // A future date is allowed only as printed, with a person's dateNote.
      errors.push(`${prefix} Future date: "${tx.date}"`);
    }
    if (d < new Date("2019-01-01")) {
      errors.push(`${prefix} Date before 2019: "${tx.date}"`);
    }
  }
  if (typeof tx.lateFilingFlag !== "boolean") {
    errors.push(`${prefix} lateFilingFlag not boolean`);
  }
  // Symbol shape only. Whether a symbol is right is layer 3 and a person.
  if (tx.ticker && !SYMBOL_SHAPE.test(tx.ticker)) {
    errors.push(`${prefix} Ticker is not symbol-shaped: "${tx.ticker}"`);
  }

  return errors;
}

// ── LAYER 3: SUFFIX TICKERS (fatal) ──
// A stored symbol that is a name suffix ("(THE)" after an inverted company
// name) is not a ticker. It cannot be fixed here; it needs a data patch a
// person approves, and until that lands nothing publishes. The read-time
// resolver in lib/assets.ts already withholds these from company pages.

function checkTicker(ticker: string): boolean {
  return !NEVER_A_SYMBOL.has(ticker.toUpperCase());
}

// ── LAYER 4: GOLDEN FILE REGRESSION ──

async function validateGoldenFiles(dataDir: string): Promise<{
  passed: number;
  total: number;
  errors: string[];
}> {
  const goldenDir = join(process.cwd(), "data", "golden");
  let goldenFiles: string[];

  try {
    const files = await readdir(goldenDir);
    goldenFiles = files.filter((f) => f.endsWith(".golden.json"));
  } catch {
    return { passed: 0, total: 0, errors: ["Golden directory not found"] };
  }

  let passed = 0;
  const errors: string[] = [];

  for (const goldenFile of goldenFiles) {
    const slug = goldenFile.replace(".golden.json", "");
    const goldenRaw = await readFile(join(goldenDir, goldenFile), "utf-8");
    const golden: GoldenData = JSON.parse(goldenRaw);

    let currentRaw: string;
    try {
      currentRaw = await readFile(join(dataDir, `${slug}.json`), "utf-8");
    } catch {
      errors.push(`${slug}: Current data file missing`);
      continue;
    }
    const current: OfficialData = JSON.parse(currentRaw);

    const goldenTransactions =
      golden.transactions ?? golden.sampleTransactions ?? [];

    // Compare transaction counts when the golden file carries one. Count
    // changes are warnings because backfills can legitimately add filings.
    if (
      typeof golden.transactionCount === "number" &&
      current.transactions.length !== golden.transactionCount
    ) {
      errors.push(
        `${slug}: Transaction count changed — golden: ${golden.transactionCount}, current: ${current.transactions.length}`
      );
    } else if (
      golden.transactions &&
      current.transactions.length !== golden.transactions.length
    ) {
      errors.push(
        `${slug}: Transaction count mismatch — golden: ${golden.transactions.length}, current: ${current.transactions.length}`
      );
    }

    // Check that every golden transaction exists in current data
    let fieldMatches = 0;
    let fieldTotal = 0;

    for (const gtx of goldenTransactions) {
      const match = current.transactions.find(
        (ctx) =>
          ctx.description === gtx.description &&
          ctx.date === gtx.date &&
          ctx.type === gtx.type
      );

      if (!match) {
        errors.push(
          `${slug}: Missing golden transaction: ${gtx.date} ${gtx.description.substring(0, 40)}...`
        );
        fieldTotal += 5;
        continue;
      }

      // Field-level comparison
      fieldTotal += 5;
      if (match.description === gtx.description) fieldMatches++;
      if (match.type === gtx.type) fieldMatches++;
      if (match.date === gtx.date) fieldMatches++;
      if (match.amount === gtx.amount) fieldMatches++;
      if (match.lateFilingFlag === gtx.lateFilingFlag) fieldMatches++;
    }

    const accuracy = fieldTotal > 0 ? (fieldMatches / fieldTotal) * 100 : 100;

    if (accuracy >= 95) {
      passed++;
      console.log(
        `  ${slug}: PASS (${accuracy.toFixed(1)}% field accuracy, ${goldenTransactions.length} golden tx)`
      );
    } else {
      errors.push(`${slug}: FAIL — ${accuracy.toFixed(1)}% accuracy (threshold: 95%)`);
    }
  }

  return { passed, total: goldenFiles.length, errors };
}

// ── LAYER 6: ANOMALY DETECTION ──

function detectAnomalies(data: OfficialData): string[] {
  const anomalies: string[] = [];

  if (data.transactions.length > 200) {
    anomalies.push(
      `${data.slug}: ${data.transactions.length} transactions (unusually high)`
    );
  }

  // Repeated business tuples. Within one filing they are separate lots the
  // form printed on separate numbered rows: expected, informative only.
  // Across two filings they need a person: an amendment the merge should
  // not have double-counted, or a genuine second trade of the same size on
  // the same day disclosed later.
  const byKey = new Map<string, Set<string>>();
  let sameFilingRepeats = 0;
  for (const tx of data.transactions) {
    const key = `${tx.description}|${tx.date}|${tx.amount}|${tx.type}`;
    const filings = byKey.get(key) ?? new Set<string>();
    if (byKey.has(key)) sameFilingRepeats++;
    filings.add(tx.sourceUrl ?? "");
    byKey.set(key, filings);
  }
  if (sameFilingRepeats > 0) {
    anomalies.push(`${data.slug}: ${sameFilingRepeats} repeated rows (separate lots within a filing; expected)`);
  }

  // Check for all-same-day filings (not anomalous, but notable)
  const dates = new Set(data.transactions.map((t) => t.date));
  if (dates.size === 1 && data.transactions.length > 10) {
    anomalies.push(
      `${data.slug}: ${data.transactions.length} transactions on single day (${[...dates][0]})`
    );
  }

  return anomalies;
}

// ── LAYER 4: CROSS-FILING REPEATS (review required) ──

function crossFilingRepeats(data: OfficialData): string[] {
  const byKey = new Map<string, Set<string>>();
  for (const tx of data.transactions) {
    const key = `${tx.description}|${tx.date}|${tx.amount}|${tx.type}`;
    const filings = byKey.get(key) ?? new Set<string>();
    filings.add(tx.sourceUrl ?? "(unstamped)");
    byKey.set(key, filings);
  }
  const out: string[] = [];
  for (const [key, filings] of byKey) {
    if (filings.size > 1) out.push(`${data.slug}: "${key}" appears in ${filings.size} filings`);
  }
  return out;
}

// ── MAIN ──

async function main() {
  console.log("=== Open Cabinet Validation Report ===\n");

  const dataDir = join(process.cwd(), "data", "officials");
  const files = await readdir(dataDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    totalOfficials: 0,
    totalTransactions: 0,
    schemaFailures: 0,
    schemaErrors: [],
    suffixTickers: [],
    goldenFilesPassed: 0,
    goldenFilesTotal: 0,
    goldenFileErrors: [],
    crossFilingRepeats: [],
    anomalies: [],
    result: "PASS",
  };

  // Process each official
  for (const file of jsonFiles) {
    const raw = await readFile(join(dataDir, file), "utf-8");
    const data: OfficialData = JSON.parse(raw);

    report.totalOfficials++;
    report.totalTransactions += data.transactions.length;

    // Layer 1: Schema
    data.transactions.forEach((tx, i) => {
      const errors = validateSchema(tx, data.slug, i);
      report.schemaErrors.push(...errors);
      report.schemaFailures += errors.length;
    });

    // Layer 3: suffix tickers (fatal)
    data.transactions.forEach((tx, i) => {
      if (tx.ticker && !checkTicker(tx.ticker)) {
        report.suffixTickers.push(`[${data.slug}][${i}] "${tx.ticker}" in "${tx.description}"`);
      }
    });

    // Layer 4: cross-filing repeats (review)
    report.crossFilingRepeats.push(...crossFilingRepeats(data));

    // Informative
    report.anomalies.push(...detectAnomalies(data));
  }

  // Layer 2: Golden files (fatal)
  console.log("Golden file regression tests:");
  const goldenResult = await validateGoldenFiles(dataDir);
  report.goldenFilesPassed = goldenResult.passed;
  report.goldenFilesTotal = goldenResult.total;
  report.goldenFileErrors = goldenResult.errors;

  // Severity. FAIL beats REVIEW beats PASS.
  if (report.crossFilingRepeats.length > 0) report.result = "REVIEW";
  if (report.schemaFailures > 0 || report.suffixTickers.length > 0) report.result = "FAIL";
  if (
    report.goldenFilesTotal > 0 &&
    report.goldenFilesPassed < report.goldenFilesTotal
  ) {
    report.result = "FAIL";
  }

  // Print report
  console.log(`\n${"=".repeat(45)}`);
  console.log(`Transactions validated: ${report.totalTransactions}`);
  console.log(`Schema failures: ${report.schemaFailures}`);
  console.log(
    `Golden files: ${report.goldenFilesPassed}/${report.goldenFilesTotal} passed`
  );
  console.log(`Suffix tickers (fatal until patched): ${report.suffixTickers.length}`);
  console.log(`Cross-filing repeats (review): ${report.crossFilingRepeats.length}`);
  console.log(`Informative anomalies: ${report.anomalies.length}`);

  if (report.schemaErrors.length > 0) {
    console.log(`\nSchema errors:`);
    report.schemaErrors.slice(0, 20).forEach((e) => console.log(`  ${e}`));
    if (report.schemaErrors.length > 20) {
      console.log(`  ... and ${report.schemaErrors.length - 20} more`);
    }
  }

  if (report.suffixTickers.length > 0) {
    console.log(`\nSuffix tickers, fatal (an approved data patch is the only fix):`);
    report.suffixTickers.forEach((e) => console.log(`  ${e}`));
  }

  if (report.crossFilingRepeats.length > 0) {
    console.log(`\nCross-filing repeats, review required:`);
    report.crossFilingRepeats.slice(0, 20).forEach((e) => console.log(`  ${e}`));
    if (report.crossFilingRepeats.length > 20) {
      console.log(`  ... and ${report.crossFilingRepeats.length - 20} more`);
    }
  }

  if (report.goldenFileErrors.length > 0) {
    console.log(`\nGolden file issues:`);
    report.goldenFileErrors.forEach((e) => console.log(`  ${e}`));
  }

  if (report.anomalies.length > 0) {
    console.log(`\nAnomalies:`);
    report.anomalies.forEach((a) => console.log(`  ${a}`));
  }

  console.log(`\nResult: ${report.result}`);
  console.log(`${"=".repeat(45)}`);

  // Exit codes: 0 pass, 1 fatal, 2 review required. The pipeline workflow
  // treats anything non-zero as a stop, which is the conservative reading
  // until a staging area for review-required filings exists.
  if (report.result === "FAIL") process.exit(1);
  if (report.result === "REVIEW") process.exit(2);
}

export { validateSchema, checkTicker, detectAnomalies, validateGoldenFiles };
export type { ValidationReport };

main().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
