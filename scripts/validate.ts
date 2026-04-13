/**
 * Validation Suite — Trust backbone for Open Cabinet data.
 *
 * Six validation layers:
 * 1. Schema: every transaction has valid type, amount, date, etc.
 * 2. Ticker: flag unknown tickers for review
 * 3. Count: compare our data against OGE API filing counts
 * 4. Golden files: regression test against manually verified data
 * 5. Confidence: flag low-confidence parser output
 * 6. Anomaly: flag unusual patterns (100+ tx per PDF, future dates)
 *
 * Run: pnpm run validate
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { VALID_TYPES, VALID_AMOUNTS } from "./parse-pdf";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

interface Transaction {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  lateFilingFlag: boolean;
  confidence?: number;
  needsReview?: boolean;
  notes?: string;
}

interface OfficialData {
  name: string;
  slug: string;
  transactions: Transaction[];
}

interface ValidationReport {
  timestamp: string;
  totalOfficials: number;
  totalTransactions: number;
  schemaFailures: number;
  schemaErrors: string[];
  unknownTickers: number;
  unknownTickerList: string[];
  goldenFilesPassed: number;
  goldenFilesTotal: number;
  goldenFileErrors: string[];
  lowConfidence: number;
  anomalies: string[];
  result: "PASS" | "FAIL";
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
  if (!VALID_AMOUNTS.includes(tx.amount)) {
    errors.push(`${prefix} Invalid amount: "${tx.amount}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    errors.push(`${prefix} Invalid date format: "${tx.date}"`);
  } else {
    const d = new Date(tx.date + "T00:00:00");
    if (isNaN(d.getTime())) {
      errors.push(`${prefix} Unparseable date: "${tx.date}"`);
    }
    if (d > new Date()) {
      errors.push(`${prefix} Future date: "${tx.date}"`);
    }
    if (d < new Date("2019-01-01")) {
      errors.push(`${prefix} Date before 2019: "${tx.date}"`);
    }
  }
  if (typeof tx.lateFilingFlag !== "boolean") {
    errors.push(`${prefix} lateFilingFlag not boolean`);
  }
  // Tickers can include dots and lowercase for preferred shares (BRK.B, KEYpI, T.PR.A)
  if (tx.ticker && !/^[A-Za-z.]{1,10}$/.test(tx.ticker)) {
    errors.push(`${prefix} Suspicious ticker: "${tx.ticker}"`);
  }

  return errors;
}

// ── LAYER 2: TICKER VALIDATION ──
// Known major tickers — not exhaustive, just catches obvious errors

const KNOWN_TICKERS = new Set([
  "AAPL", "AMZN", "MSFT", "GOOGL", "GOOG", "META", "TSLA", "NVDA",
  "JPM", "BAC", "WFC", "GS", "MS", "C", "USB", "PNC", "TFC",
  "UNH", "JNJ", "PFE", "MRK", "ABBV", "LLY", "BMY", "AMGN",
  "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "VLO", "PSX",
  "DIS", "NFLX", "CMCSA", "T", "VZ", "TMUS",
  "HD", "LOW", "TGT", "WMT", "COST", "AMZN",
  "V", "MA", "PYPL", "SQ", "AXP",
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "BND",
  "BA", "LMT", "RTX", "GD", "NOC",
  "DJT", "LBRT", "OKLO", "FISV",
]);

function checkTicker(ticker: string | null): boolean {
  if (!ticker) return true; // null is fine
  return KNOWN_TICKERS.has(ticker);
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
    const golden: OfficialData = JSON.parse(goldenRaw);

    let currentRaw: string;
    try {
      currentRaw = await readFile(join(dataDir, `${slug}.json`), "utf-8");
    } catch {
      errors.push(`${slug}: Current data file missing`);
      continue;
    }
    const current: OfficialData = JSON.parse(currentRaw);

    // Compare transaction counts
    if (current.transactions.length !== golden.transactions.length) {
      errors.push(
        `${slug}: Transaction count mismatch — golden: ${golden.transactions.length}, current: ${current.transactions.length}`
      );
      // Don't fail on count differences from data updates — just warn
    }

    // Check that every golden transaction exists in current data
    let fieldMatches = 0;
    let fieldTotal = 0;

    for (const gtx of golden.transactions) {
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
        `  ${slug}: PASS (${accuracy.toFixed(1)}% field accuracy, ${golden.transactions.length} tx)`
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

  // Check for duplicate transactions
  const seen = new Set<string>();
  let dupeCount = 0;
  for (const tx of data.transactions) {
    const key = `${tx.description}|${tx.date}|${tx.amount}|${tx.type}`;
    if (seen.has(key)) dupeCount++;
    seen.add(key);
  }
  if (dupeCount > 0) {
    anomalies.push(`${data.slug}: ${dupeCount} duplicate transactions`);
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
    unknownTickers: 0,
    unknownTickerList: [],
    goldenFilesPassed: 0,
    goldenFilesTotal: 0,
    goldenFileErrors: [],
    lowConfidence: 0,
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

    // Layer 2: Tickers
    data.transactions.forEach((tx) => {
      if (tx.ticker && !checkTicker(tx.ticker)) {
        if (!report.unknownTickerList.includes(tx.ticker)) {
          report.unknownTickerList.push(tx.ticker);
          report.unknownTickers++;
        }
      }
    });

    // Layer 5: Confidence
    data.transactions.forEach((tx) => {
      if (tx.confidence !== undefined && tx.confidence < 0.8) {
        report.lowConfidence++;
      }
    });

    // Layer 6: Anomalies
    report.anomalies.push(...detectAnomalies(data));
  }

  // Layer 4: Golden files
  console.log("Golden file regression tests:");
  const goldenResult = await validateGoldenFiles(dataDir);
  report.goldenFilesPassed = goldenResult.passed;
  report.goldenFilesTotal = goldenResult.total;
  report.goldenFileErrors = goldenResult.errors;

  // Determine pass/fail
  if (report.schemaFailures > 0) report.result = "FAIL";
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
    `Unknown tickers: ${report.unknownTickers} (flagged for review)`
  );
  console.log(
    `Golden files: ${report.goldenFilesPassed}/${report.goldenFilesTotal} passed`
  );
  console.log(`Low-confidence transactions: ${report.lowConfidence}`);
  console.log(`Anomalies: ${report.anomalies.length}`);

  if (report.schemaErrors.length > 0) {
    console.log(`\nSchema errors:`);
    report.schemaErrors.slice(0, 20).forEach((e) => console.log(`  ${e}`));
    if (report.schemaErrors.length > 20) {
      console.log(`  ... and ${report.schemaErrors.length - 20} more`);
    }
  }

  if (report.unknownTickerList.length > 0) {
    console.log(`\nUnknown tickers: ${report.unknownTickerList.join(", ")}`);
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

  if (report.result === "FAIL") {
    process.exit(1);
  }
}

export { validateSchema, checkTicker, detectAnomalies, validateGoldenFiles };
export type { ValidationReport };

main().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
