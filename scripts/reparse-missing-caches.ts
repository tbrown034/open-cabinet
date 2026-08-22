/**
 * Re-parse every top-level filing PDF that has no .parsed.json cache, so
 * that (a) backfill-tx-source.ts can attribute rows to their real source
 * filings and (b) the text-layer cross-check gate can audit historic
 * parses. Skips scans over the whole-file size limit (their chunk caches
 * already exist or they await the dedicated rebuild).
 *
 * Writes the same cache format ingest uses; existing caches are never
 * touched, so the run is resumable. Concurrency-limited to stay polite.
 *
 *   npx tsx scripts/reparse-missing-caches.ts
 */
import { readdir, writeFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import { parsePdf } from "./parse-pdf.js";

dotenv.config({ path: ".env.local" });

const PDF_DIR = path.resolve("data/pdfs");
const CONCURRENCY = 4;
// Whole-file parses only: big multi-page scans go through the chunked
// ingest path instead, and the one current example (Trump 08.12.2026)
// already has chunk caches.
const MAX_BYTES = 5_000_000;

async function main() {
  const files = await readdir(PDF_DIR);
  const targets = files.filter(
    (f) =>
      f.endsWith(".pdf") &&
      !/\.pages\d+-\d+\.pdf$/i.test(f) &&
      !existsSync(path.join(PDF_DIR, f).replace(/\.pdf$/i, ".parsed.json")) &&
      statSync(path.join(PDF_DIR, f)).size <= MAX_BYTES
  );
  console.log(`${targets.length} PDFs to parse`);

  let done = 0;
  let failed = 0;
  let costUsd = 0;
  const queue = [...targets];

  async function worker(id: number) {
    while (queue.length) {
      const f = queue.shift()!;
      const pdfPath = path.join(PDF_DIR, f);
      try {
        const result = await parsePdf(pdfPath);
        await writeFile(
          pdfPath.replace(/\.pdf$/i, ".parsed.json"),
          JSON.stringify(result, null, 2)
        );
        done++;
        costUsd += Number(result.tokenUsage.estimatedCostUsd) || 0;
        console.log(
          `[${done + failed}/${targets.length}] ${f}: ${result.transactions.length} txns ($${result.tokenUsage.estimatedCostUsd})`
        );
      } catch (err: any) {
        failed++;
        console.error(`[${done + failed}/${targets.length}] ${f} FAILED: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => worker(i))
  );
  console.log(
    `\nDone: ${done} parsed, ${failed} failed, ~$${costUsd.toFixed(2)} total`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
