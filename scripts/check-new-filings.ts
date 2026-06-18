/**
 * OGE Filing Monitor
 *
 * Checks the OGE API for new 278-T transaction reports filed by
 * Level I, Level II, and Presidential officials. Downloads new PDFs
 * and reports what changed since the last check.
 *
 * Usage: pnpm run check-filings
 */

import { mkdir } from "fs/promises";
import path from "path";
import https from "https";
import {
  diffNewFilings,
  fetchOgeRecords,
  getTargetFilings,
  loadKnownFilingUrlsFromData,
  writeLastCheckState,
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
