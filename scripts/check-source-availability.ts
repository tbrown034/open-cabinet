/** Read-only OGE checks; writes only the review report, never PDFs or official rows.
 * Scheduled by the weekly workflow. No email or model calls. */
import { writeFile } from "node:fs/promises";
import {
  fetchOgeRecords, getAllIndexedFilings, getTargetFilings, loadKnownFilingsFromData,
} from "../lib/oge-filings";
import { probePdf, sourceKey, SOURCE_AVAILABILITY_PATH, type SourceAvailability } from "../lib/source-availability";

async function main() {
  const { records, totalRecords } = await fetchOgeRecords({ log: console.log });
  if (records.length !== totalRecords || getTargetFilings(records).length === 0) {
    throw new Error("Incomplete or malformed OGE index; source report was not replaced");
  }
  const indexed = new Set(getAllIndexedFilings(records).map((f) => sourceKey(f.pdfUrl)));
  const known = [...new Map((await loadKnownFilingsFromData()).map((f) => [sourceKey(f.url), f])).values()];
  const report: SourceAvailability = { checkedAt: new Date().toISOString(), totalOgeRecords: totalRecords, filings: {} };
  // Three requests at a time; never download or replace the saved source files.
  for (let i = 0; i < known.length; i += 3) {
    const batch = await Promise.all(known.slice(i, i + 3).map(async (f) => ({
      url: f.url, slug: f.slug, indexListed: indexed.has(sourceKey(f.url)), ...await probePdf(f.url),
    })));
    for (const check of batch) report.filings[sourceKey(check.url)] = check;
    console.log(`Checked ${Math.min(i + 3, known.length)}/${known.length} PDF links`);
  }
  await writeFile(SOURCE_AVAILABILITY_PATH, JSON.stringify(report, null, 2) + "\n");
  const issues = Object.values(report.filings).filter((f) => !f.indexListed || f.pdfStatus !== "available");
  for (const f of issues) console.warn(`${f.slug}: index=${f.indexListed}, PDF=${f.pdfStatus}, HTTP=${f.httpStatus ?? "unknown"}: ${f.url}`);
  console.log(`${issues.length} source availability flags saved for review. Original records preserved.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
