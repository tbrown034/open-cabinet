/**
 * OGE Filing Monitor
 *
 * Checks the OGE API for new 278-T transaction reports filed by
 * Level I, Level II, and Presidential officials. Downloads new PDFs
 * and reports what changed since the last check.
 *
 * Usage: pnpm run check-filings
 */

import { mkdir, readdir, readFile } from "fs/promises";
import path from "path";
import https from "https";
import {
  diffNewFilings,
  fetchOgeRecords,
  getTargetFilings,
  loadKnownFilingUrlsFromData,
  writeLastCheckState,
  MIN_DOC_DATE,
  type TargetFiling,
} from "../lib/oge-filings";

const DATA_DIR = path.join(process.cwd(), "data");
const PDF_DIR = path.join(DATA_DIR, "pdfs");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = require("fs").createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "OpenCabinet/1.0" } }, (res: any) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          if (res.headers.location) {
            downloadFile(res.headers.location, dest).then(resolve, reject);
          } else {
            reject(new Error("Redirect with no location"));
          }
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err: Error) => {
        try {
          require("fs").unlinkSync(dest);
        } catch {
          // Nothing to remove.
        }
        reject(err);
      });
  });
}

interface CadenceProjection {
  name: string;
  filingCount: number;
  medianGapDays: number;
  lastFiling: string;
  projectedNext: string;
  daysPastProjection: number;
}

/**
 * Internal monitoring only — never publish these projections. A filer who
 * blows past their historical cadence has usually just stopped trading
 * (divestiture complete), not missed a deadline. Forward-looking "expected"
 * dates would be misleading on the public site.
 */
async function projectFilingCadence(): Promise<CadenceProjection[]> {
  const officialsDir = path.join(DATA_DIR, "officials");
  const projections: CadenceProjection[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const file of await readdir(officialsDir)) {
    if (!file.endsWith(".json")) continue;
    const official = JSON.parse(
      await readFile(path.join(officialsDir, file), "utf-8")
    ) as { name: string; sourceFilings?: Array<{ date?: string }> };

    // Restrict to the current administration's window so pre-2025 annual
    // filings from holdover officials don't distort the gap statistics.
    const dates = [
      ...new Set(
        (official.sourceFilings || [])
          .map((f) => f.date?.slice(0, 10))
          .filter((d): d is string => Boolean(d) && d! >= MIN_DOC_DATE)
      ),
    ].sort();

    // Below 4 filings a "median gap" is noise, not a pattern.
    if (dates.length < 4) continue;

    const gaps = dates
      .slice(1)
      .map((d, i) => Math.round((Date.parse(d) - Date.parse(dates[i])) / DAY_MS))
      .filter((g) => g > 0)
      .sort((a, b) => a - b);
    if (gaps.length === 0) continue;

    const medianGapDays = gaps[Math.floor(gaps.length / 2)];
    const lastFiling = dates[dates.length - 1];
    const projectedMs = Date.parse(lastFiling) + medianGapDays * DAY_MS;
    projections.push({
      name: official.name,
      filingCount: dates.length,
      medianGapDays,
      lastFiling,
      projectedNext: new Date(projectedMs).toISOString().slice(0, 10),
      daysPastProjection: Math.floor((Date.now() - projectedMs) / DAY_MS),
    });
  }

  return projections.sort((a, b) => b.daysPastProjection - a.daysPastProjection);
}

function printCadenceProjections(projections: CadenceProjection[]) {
  if (projections.length === 0) return;
  console.log("\nFiling cadence projections (internal only — do not publish):");
  for (const p of projections) {
    const status =
      p.daysPastProjection > 0
        ? `${p.daysPastProjection}d past pattern — likely stopped trading, or a filing is coming`
        : `in ~${-p.daysPastProjection}d`;
    console.log(
      `  ${p.name}: ${p.filingCount} filings, median gap ${p.medianGapDays}d, ` +
        `last ${p.lastFiling}, next ~${p.projectedNext} (${status})`
    );
  }
}

async function main() {
  console.log("Checking OGE API for new filings...\n");

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const noDownload = dryRun || args.has("--no-download");

  let records;
  try {
    ({ records } = await fetchOgeRecords({
      log: (message) => console.log(`  ${message}`),
    }));
  } catch (err) {
    console.error(
      "OGE API unreachable — try again later.",
      (err as Error).message
    );
    process.exit(1);
  }

  console.log(`  Total records fetched: ${records.length}\n`);

  const targetFilings = getTargetFilings(records);
  // Same guard as /api/cron: a healthy portal always has ~100+ in-scope
  // 278-Ts. Zero means a malformed response, and continuing would overwrite
  // last-check.json's known-URL list with an empty one (every filing would
  // re-flag as "new" on the next healthy run).
  if (targetFilings.length === 0) {
    console.error(
      `OGE response had ${records.length} records but zero target 278-T filings — response likely malformed. First record: ${JSON.stringify(records[0] ?? null).slice(0, 400)}`
    );
    process.exit(1);
  }
  const knownUrls = await loadKnownFilingUrlsFromData();
  const newFilings = diffNewFilings(targetFilings, knownUrls).map(
    (filing): TargetFiling & { status: string } => ({
      ...filing,
      status: noDownload ? "pending" : "pending_download",
    })
  );

  if (newFilings.length === 0) {
    console.log("No new filings since last check.\n");
  } else {
    console.log(
      `${newFilings.length} new filing(s) found since last check:\n`
    );

    // Download new PDFs
    if (!noDownload) {
      await mkdir(PDF_DIR, { recursive: true });
      for (const filing of newFilings) {
        const filename = filing.pdfUrl.split("/").pop() || "unknown.pdf";
        const dest = path.join(PDF_DIR, decodeURIComponent(filename));
        try {
          console.log(`  Downloading: ${filename}`);
          await downloadFile(filing.pdfUrl, dest);
          filing.status = "downloaded";
          await sleep(1000);
        } catch {
          console.log(`  FAILED: ${filename}`);
          filing.status = "download_failed";
        }
      }
    } else {
      console.log("Download skipped.\n");
    }

    console.log("\nNew filings:");
    for (const f of newFilings) {
      console.log(`  ${f.name} — ${f.docDate} [${f.status}]`);
    }
  }

  printCadenceProjections(await projectFilingCadence());

  // Save updated state
  if (!dryRun) {
    await writeLastCheckState({ filings: targetFilings, newFilings });
    console.log("\nState saved to data/meta/last-check.json");
  } else {
    console.log("\nDry run — state not saved.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
