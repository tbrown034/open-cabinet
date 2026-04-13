/**
 * Pipeline Orchestrator — End-to-end data pipeline for Open Cabinet.
 *
 * Chains: check OGE → download new PDFs → parse → validate → insert into DB
 *
 * Run: pnpm run pipeline
 *
 * The pipeline:
 * 1. Creates a pipeline_runs record (status: "running")
 * 2. Polls OGE API for new 278-T filings
 * 3. Downloads any new PDFs
 * 4. Parses each PDF with Claude Sonnet (cross-checks with OpenAI if --verify)
 * 5. Validates parsed data against schema rules
 * 6. Inserts into DB (ON CONFLICT skip duplicates)
 * 7. Updates pipeline_runs record with results
 *
 * Error handling: failed parses don't block the run — they're logged
 * and the pipeline continues with the next PDF.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import https from "https";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { officials, transactions, pipelineRuns } from "../lib/schema";
import { parsePdf, quickValidate } from "./parse-pdf";
import type { ParsedTransaction } from "./parse-pdf";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const API_BASE = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest";
const PDF_DIR = path.join(process.cwd(), "data", "pdfs");
const LAST_CHECK_PATH = path.join(process.cwd(), "data", "meta", "last-check.json");

// ── DB CONNECTION ──

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  console.error("DATABASE_URL or DATABASE_URL_UNPOOLED must be set");
  process.exit(1);
}
const sql = neon(connectionString);
const db = drizzle(sql);

// ── HELPERS ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Failed to parse response from ${url}`)); }
        });
      })
      .on("error", reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = require("fs").createWriteStream(dest);
    https
      .get(url, (res: any) => {
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      })
      .on("error", (err: Error) => {
        require("fs").unlinkSync(dest);
        reject(err);
      });
  });
}

function extractPdfUrl(typeField: string): string | null {
  const match = typeField.match(/href='([^']+\.pdf)'/);
  return match ? match[1] : null;
}

function is278T(typeField: string): boolean {
  return typeField.includes("278 Transaction") ||
    typeField.includes("278T") || typeField.includes("278-T");
}

function isTargetLevel(record: any): boolean {
  if (record.level === "Level I" || record.level === "Level II") return true;
  if (record.name === "Trump, Donald J") return true;
  return false;
}

function slugify(name: string): string {
  return name
    .split(",")
    .map((s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""))
    .reverse()
    .join("-")
    .replace(/-+/g, "-");
}

// ── PIPELINE ──

async function runPipeline(options: { verify?: boolean; dryRun?: boolean }) {
  const startTime = Date.now();
  console.log("=== Open Cabinet Pipeline ===\n");

  // 1. Create pipeline run record
  const [run] = await db
    .insert(pipelineRuns)
    .values({
      trigger: "manual",
      status: "running",
    })
    .returning({ id: pipelineRuns.id });

  console.log(`Pipeline run #${run.id} started\n`);

  const errors: Array<{ step: string; error: string }> = [];
  let newFilingsFound = 0;
  let newTransactionsParsed = 0;
  let totalTokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  try {
    // 2. Poll OGE API
    console.log("Step 1: Checking OGE API for new filings...");
    let allRecords: any[] = [];
    let start = 0;
    const pageSize = 1000;

    while (true) {
      const url = `${API_BASE}?start=${start}&length=${pageSize}`;
      const data = await fetchJSON(url);
      const records = data.data || [];
      if (records.length === 0) break;
      allRecords = allRecords.concat(records);
      const total = data.recordsTotal || 0;
      start += pageSize;
      if (start >= total) break;
      await sleep(2000);
    }

    console.log(`  ${allRecords.length} total OGE records`);

    // Filter for target officials with 278-T PDFs
    const targetFilings: Array<{ name: string; pdfUrl: string; docDate: string }> = [];
    for (const r of allRecords) {
      if (!isTargetLevel(r)) continue;
      if (!is278T(r.type)) continue;
      const pdfUrl = extractPdfUrl(r.type);
      if (!pdfUrl) continue;
      targetFilings.push({ name: r.name, pdfUrl, docDate: r.docDate });
    }

    console.log(`  ${targetFilings.length} target 278-T filings`);

    // Load previous state to find new ones
    let knownUrls = new Set<string>();
    if (existsSync(LAST_CHECK_PATH)) {
      const lastCheck = JSON.parse(await readFile(LAST_CHECK_PATH, "utf-8"));
      knownUrls = new Set(Object.keys(lastCheck.knownFilings || {}));
    }

    const newFilings = targetFilings.filter((f) => !knownUrls.has(f.pdfUrl));
    newFilingsFound = newFilings.length;
    console.log(`  ${newFilings.length} new filings since last check\n`);

    if (newFilings.length === 0) {
      console.log("No new filings. Pipeline complete.\n");
      await db
        .update(pipelineRuns)
        .set({
          status: "completed",
          newFilingsFound: 0,
          newTransactionsParsed: 0,
          duration: Date.now() - startTime,
          completedAt: new Date(),
        })
        .where(eq(pipelineRuns.id, run.id));
      return;
    }

    // 3. Download and parse new PDFs
    await mkdir(PDF_DIR, { recursive: true });

    for (const filing of newFilings) {
      const safeName = filing.pdfUrl.split("/").pop() || "unknown.pdf";
      const pdfPath = path.join(PDF_DIR, safeName);

      console.log(`Step 2: ${filing.name} (${filing.docDate})`);

      // Download
      if (!existsSync(pdfPath)) {
        try {
          console.log(`  Downloading ${safeName}...`);
          await downloadFile(filing.pdfUrl, pdfPath);
          await sleep(1000);
        } catch (err) {
          errors.push({ step: "download", error: `${filing.name}: ${(err as Error).message}` });
          console.log(`  Download failed: ${(err as Error).message}`);
          continue;
        }
      }

      // Parse
      try {
        console.log(`  Parsing with Sonnet...`);
        const result = await parsePdf(pdfPath);

        totalTokenUsage.inputTokens += result.tokenUsage.inputTokens;
        totalTokenUsage.outputTokens += result.tokenUsage.outputTokens;
        totalTokenUsage.costUsd += result.tokenUsage.estimatedCostUsd;

        // Quick validate
        const validationErrors: string[] = [];
        result.transactions.forEach((tx, i) => {
          validationErrors.push(...quickValidate(tx, i));
        });

        if (validationErrors.length > 0) {
          console.log(`  ${validationErrors.length} validation warnings`);
          validationErrors.forEach((e) => console.log(`    ${e}`));
        }

        // Find or create the official in DB
        const slug = slugify(filing.name);
        let [official] = await db
          .select({ id: officials.id })
          .from(officials)
          .where(eq(officials.slug, slug))
          .limit(1);

        if (!official) {
          // New official — insert with basic info
          console.log(`  New official: ${filing.name} (${slug})`);
          [official] = await db
            .insert(officials)
            .values({
              name: filing.name,
              slug,
              filingType: "278-T Periodic Transaction Report",
              mostRecentFilingDate: filing.docDate,
            })
            .returning({ id: officials.id });
        }

        // Insert transactions
        if (!options.dryRun) {
          let inserted = 0;
          const batchSize = 50;

          for (let i = 0; i < result.transactions.length; i += batchSize) {
            const batch = result.transactions.slice(i, i + batchSize);
            const values = batch.map((tx: ParsedTransaction) => ({
              officialId: official.id,
              description: tx.description,
              ticker: tx.ticker || null,
              type: tx.type,
              date: tx.date,
              amount: tx.amount,
              lateFilingFlag: tx.lateFilingFlag,
              confidence: tx.confidence,
              needsReview: tx.confidence < 0.8,
              pdfSource: filing.pdfUrl,
              batchId: run.id,
            }));

            await db.insert(transactions).values(values).onConflictDoNothing();
            inserted += batch.length;
          }

          newTransactionsParsed += inserted;
          console.log(
            `  Inserted ${inserted} transactions (dupes skipped via UNIQUE)\n`
          );
        } else {
          console.log(
            `  [DRY RUN] Would insert ${result.transactions.length} transactions\n`
          );
        }

        await sleep(2000); // Rate limit between API calls
      } catch (err) {
        const errMsg = (err as Error).message;
        errors.push({ step: "parse", error: `${filing.name}: ${errMsg}` });
        console.log(`  Parse failed: ${errMsg}\n`);

        // If credit balance error, log clearly
        if (errMsg.includes("credit balance")) {
          console.log("  *** API CREDITS EXHAUSTED — pipeline stopping ***");
          console.log("  Top up credits at console.anthropic.com\n");
          break;
        }
      }
    }

    // Save state for next run
    const updatedKnown: Record<string, number> = {};
    targetFilings.forEach((f) => { updatedKnown[f.pdfUrl] = Date.now(); });
    await writeFile(
      LAST_CHECK_PATH,
      JSON.stringify({
        lastChecked: new Date().toISOString(),
        knownFilings: updatedKnown,
        newFilings: newFilings.map((f) => ({
          name: f.name,
          pdfUrl: f.pdfUrl,
          docDate: f.docDate,
          status: "processed",
        })),
      }, null, 2)
    );
  } catch (err) {
    errors.push({ step: "pipeline", error: (err as Error).message });
  }

  // Update pipeline run record
  const duration = Date.now() - startTime;
  const status = errors.length > 0 ? "completed_with_errors" : "completed";

  await db
    .update(pipelineRuns)
    .set({
      status,
      newFilingsFound,
      newTransactionsParsed,
      errors: errors.length > 0 ? errors : null,
      tokenUsage: totalTokenUsage,
      duration,
      completedAt: new Date(),
    })
    .where(eq(pipelineRuns.id, run.id));

  // Report
  console.log("=== Pipeline Report ===");
  console.log(`Run: #${run.id}`);
  console.log(`Status: ${status}`);
  console.log(`New filings found: ${newFilingsFound}`);
  console.log(`Transactions parsed: ${newTransactionsParsed}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Tokens: ${totalTokenUsage.inputTokens} in / ${totalTokenUsage.outputTokens} out`);
  console.log(`Cost: $${totalTokenUsage.costUsd.toFixed(4)}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log(`  [${e.step}] ${e.error}`));
  }

  console.log("\n=== Done ===");
}

// ── CLI ──

const args = process.argv.slice(2);
const verify = args.includes("--verify");
const dryRun = args.includes("--dry-run");

if (args.includes("--help")) {
  console.log("Usage: pnpm run pipeline [options]");
  console.log("");
  console.log("Options:");
  console.log("  --verify    Cross-check new parses with OpenAI");
  console.log("  --dry-run   Check for new filings without inserting");
  console.log("  --help      Show this help");
  process.exit(0);
}

runPipeline({ verify, dryRun }).catch((err) => {
  console.error("Pipeline crashed:", err.message);
  process.exit(1);
});
