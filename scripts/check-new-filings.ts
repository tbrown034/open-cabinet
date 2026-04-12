/**
 * OGE Filing Monitor
 *
 * Checks the OGE API for new 278-T transaction reports filed by
 * Level I, Level II, and Presidential officials. Downloads new PDFs
 * and reports what changed since the last check.
 *
 * Usage: pnpm run check-filings
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import https from "https";

const API_BASE =
  "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest";
const DATA_DIR = path.join(process.cwd(), "data");
const PDF_DIR = path.join(DATA_DIR, "pdfs");
const LAST_CHECK_PATH = path.join(DATA_DIR, "meta", "last-check.json");

interface OGERecord {
  type: string;
  name: string;
  agency: string;
  title: string;
  level: string;
  docDate: string;
  amended: string;
}

interface LastCheck {
  lastChecked: string;
  knownFilings: Record<string, number>;
  newFilings: Array<{
    name: string;
    pdfUrl: string;
    docDate: string;
    status: string;
  }>;
}

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
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse response from ${url}`));
          }
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
        file.on("finish", () => {
          file.close();
          resolve();
        });
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
  return (
    typeField.includes("278 Transaction") ||
    typeField.includes("278T") ||
    typeField.includes("278-T")
  );
}

function isTargetLevel(record: OGERecord): boolean {
  if (record.level === "Level I" || record.level === "Level II") return true;
  if (record.name === "Trump, Donald J") return true;
  return false;
}

async function main() {
  console.log("Checking OGE API for new filings...\n");

  // Load previous state
  let lastCheck: LastCheck = {
    lastChecked: "",
    knownFilings: {},
    newFilings: [],
  };
  const isFirstRun = !existsSync(LAST_CHECK_PATH);
  if (!isFirstRun) {
    const raw = await readFile(LAST_CHECK_PATH, "utf-8");
    lastCheck = JSON.parse(raw);
  }

  // Fetch all records from OGE API
  let allRecords: OGERecord[] = [];
  let start = 0;
  const pageSize = 1000;

  try {
    while (true) {
      const url = `${API_BASE}?start=${start}&length=${pageSize}`;
      console.log(`  Fetching records ${start}...`);
      const data = await fetchJSON(url);
      const records: OGERecord[] = data.data || [];
      if (records.length === 0) break;
      allRecords = allRecords.concat(records);
      const total = data.recordsTotal || 0;
      start += pageSize;
      if (start >= total) break;
      await sleep(2000);
    }
  } catch (err) {
    console.error(
      "OGE API unreachable — try again later.",
      (err as Error).message
    );
    process.exit(1);
  }

  console.log(`  Total records fetched: ${allRecords.length}\n`);

  // Filter for target officials with 278-T PDFs
  const targetFilings: Array<{
    name: string;
    pdfUrl: string;
    docDate: string;
  }> = [];

  for (const r of allRecords) {
    if (!isTargetLevel(r)) continue;
    if (!is278T(r.type)) continue;
    const pdfUrl = extractPdfUrl(r.type);
    if (!pdfUrl) continue;
    targetFilings.push({ name: r.name, pdfUrl, docDate: r.docDate });
  }

  // Count filings per official
  const currentCounts: Record<string, number> = {};
  for (const f of targetFilings) {
    currentCounts[f.name] = (currentCounts[f.name] || 0) + 1;
  }

  if (isFirstRun) {
    // First run — set baseline, don't flag anything as new
    console.log("First run — establishing baseline.\n");
    console.log(`  ${targetFilings.length} 278-T filings across ${Object.keys(currentCounts).length} officials.\n`);

    lastCheck = {
      lastChecked: new Date().toISOString(),
      knownFilings: currentCounts,
      newFilings: [],
    };
    await writeFile(LAST_CHECK_PATH, JSON.stringify(lastCheck, null, 2));
    console.log("Baseline saved to data/meta/last-check.json");
    return;
  }

  // Diff against known filings
  const newFilings: Array<{
    name: string;
    pdfUrl: string;
    docDate: string;
    status: string;
  }> = [];

  for (const [name, count] of Object.entries(currentCounts)) {
    const known = lastCheck.knownFilings[name] || 0;
    if (count > known) {
      // Find the new PDFs (ones we haven't seen)
      const officialFilings = targetFilings
        .filter((f) => f.name === name)
        .sort(
          (a, b) =>
            new Date(b.docDate).getTime() - new Date(a.docDate).getTime()
        );
      const newCount = count - known;
      for (let i = 0; i < newCount && i < officialFilings.length; i++) {
        newFilings.push({ ...officialFilings[i], status: "pending" });
      }
    }
  }

  // Also check for entirely new officials
  for (const [name, count] of Object.entries(currentCounts)) {
    if (!(name in lastCheck.knownFilings)) {
      const officialFilings = targetFilings.filter((f) => f.name === name);
      for (const f of officialFilings) {
        if (!newFilings.some((nf) => nf.pdfUrl === f.pdfUrl)) {
          newFilings.push({ ...f, status: "pending" });
        }
      }
    }
  }

  if (newFilings.length === 0) {
    console.log("No new filings since last check.\n");
  } else {
    console.log(
      `${newFilings.length} new filing(s) found since last check:\n`
    );

    // Download new PDFs
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

    console.log("\nNew filings:");
    for (const f of newFilings) {
      console.log(`  ${f.name} — ${f.docDate} [${f.status}]`);
    }
  }

  // Save updated state
  lastCheck = {
    lastChecked: new Date().toISOString(),
    knownFilings: currentCounts,
    newFilings,
  };
  await writeFile(LAST_CHECK_PATH, JSON.stringify(lastCheck, null, 2));
  console.log(`\nState saved. Last checked: ${lastCheck.lastChecked}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
