/**
 * Plan a deliberate re-parse of already-published filings. Prints, never
 * parses, never pays.
 *
 * The weekly ingest visits new OGE URLs only, so changing the prompt or
 * the parser does not re-read anything already on the site. When a prompt
 * fix should reach published filings, the operator chooses targets here,
 * reads the estimated cost, and then runs:
 *
 *   npx tsx scripts/ingest-new-filings.ts --from-file <plan.json> --force-reparse
 *
 * Usage:
 *   npx tsx scripts/plan-reparse.ts                 # every published filing
 *   npx tsx scripts/plan-reparse.ts bessent-scott   # one or more slugs
 *   npx tsx scripts/plan-reparse.ts --write plan.json
 *
 * Cost estimates come from the legacy cache's recorded token usage when one
 * exists and from PDF size otherwise. They are estimates, not quotes.
 */
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from "fs";
import path from "path";
import { legacyParseCachePath, parseCacheKey, parseCachePath, promptHash, sha256File } from "../lib/parse-cache";
import { EXTRACTION_PROMPT, SYSTEM_PROMPT, PARSER_VERSION, DEFAULT_MODEL } from "./parse-pdf.js";

const PDF_DIR = path.resolve("data/pdfs");
const OFFICIALS_DIR = path.resolve("data/officials");

interface PlanRow {
  slug: string;
  filingDate: string;
  url: string;
  pdfFile: string;
  present: boolean;
  currentCache: boolean;
  legacyCache: boolean;
  estimatedCostUsd: number | null;
}

function pdfFilenameFromUrl(url: string): string {
  return decodeURIComponent(url.split("/").pop() || "filing.pdf");
}

function main() {
  const args = process.argv.slice(2);
  const writeIdx = args.indexOf("--write");
  const writeTo = writeIdx >= 0 ? args[writeIdx + 1] : null;
  const slugs = args.filter((a, i) => !a.startsWith("--") && !(writeIdx >= 0 && i === writeIdx + 1));
  const promptSha256 = promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT);

  const rows: PlanRow[] = [];
  for (const file of readdirSync(OFFICIALS_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const official = JSON.parse(readFileSync(path.join(OFFICIALS_DIR, file), "utf-8"));
    if (slugs.length && !slugs.includes(official.slug)) continue;
    for (const filing of official.sourceFilings ?? []) {
      if (!filing.url) continue;
      const pdfFile = pdfFilenameFromUrl(filing.url);
      const pdfPath = path.join(PDF_DIR, pdfFile);
      const present = existsSync(pdfPath);
      let currentCache = false;
      let estimatedCostUsd: number | null = null;
      if (present) {
        const key = parseCacheKey({
          pdfSha256: sha256File(pdfPath),
          sourceUrl: filing.url,
          chunk: null,
          parserVersion: PARSER_VERSION,
          promptSha256,
          model: DEFAULT_MODEL,
        });
        currentCache = existsSync(parseCachePath(pdfPath, key));
        const legacy = legacyParseCachePath(pdfPath);
        if (existsSync(legacy)) {
          try {
            const c = JSON.parse(readFileSync(legacy, "utf-8"));
            const recorded = Number(c?.tokenUsage?.estimatedCostUsd);
            if (Number.isFinite(recorded)) estimatedCostUsd = recorded;
          } catch {
            /* unreadable legacy cache: fall through to the size estimate */
          }
        }
        if (estimatedCostUsd === null) {
          // Rough: a text filing runs 2 to 5 cents; scans scale with size.
          estimatedCostUsd = Math.max(0.02, Math.round((statSync(pdfPath).size / 1_000_000) * 0.4 * 100) / 100);
        }
      }
      rows.push({
        slug: official.slug,
        filingDate: String(filing.date).slice(0, 10),
        url: filing.url,
        pdfFile,
        present,
        currentCache,
        legacyCache: present && existsSync(legacyParseCachePath(pdfPath)),
        estimatedCostUsd,
      });
    }
  }

  const needs = rows.filter((r) => !r.currentCache);
  const total = needs.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);
  console.log(`\nRe-parse plan (parser ${PARSER_VERSION}, prompt ${promptSha256.slice(0, 8)}, ${DEFAULT_MODEL})\n`);
  console.log(`  filings considered: ${rows.length}`);
  console.log(`  already have a current-key cache: ${rows.length - needs.length}`);
  console.log(`  would be re-parsed: ${needs.length}`);
  console.log(`  estimated cost: about $${total.toFixed(2)} (estimate, not a quote)\n`);
  for (const r of needs) {
    console.log(
      `  ${r.slug.padEnd(24)} ${r.filingDate}  ${r.present ? "" : "PDF MISSING  "}${r.legacyCache ? "legacy cache  " : ""}~$${(r.estimatedCostUsd ?? 0).toFixed(2)}  ${r.pdfFile}`
    );
  }

  if (writeTo) {
    // Same shape scripts/ingest-new-filings.ts --from-file reads.
    const plan: Record<string, Array<[string, string]>> = {};
    for (const r of needs) {
      plan[r.slug] ||= [];
      plan[r.slug].push([r.filingDate, r.url]);
    }
    writeFileSync(writeTo, JSON.stringify(plan, null, 2) + "\n");
    console.log(`\nWrote ${writeTo}. Nothing was parsed. Run the ingest with --from-file ${writeTo} --force-reparse after approving the cost.`);
  }
}

main();
