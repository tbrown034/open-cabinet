/**
 * Stamp each transaction with the URL of the filing that actually disclosed
 * it (tx.sourceUrl), reconstructed from the on-disk parse caches.
 *
 * Why: the UI previously attributed rows to filings with a date heuristic
 * (earliest filing posted on/after the trade date). That guess is wrong
 * whenever an earlier-posted filing predates a later-disclosed trade —
 * e.g. Kupor's July 17 trades sat undisclosed past his July 25 filing and
 * arrived in the one posted Aug 21; the heuristic pinned them to July 25
 * and understated the disclosure lag 8d vs 35d. With the "Disclosed"
 * column making that lag visible, the attribution has to be real.
 *
 * Method: every filing with a local .parsed.json cache (whole-file or
 * page-chunk) yields the exact multiset of rows it disclosed. Walking
 * filings in posted order and consuming rows by key gives each transaction
 * its FIRST disclosing filing. Rows with no cache coverage stay unstamped
 * and fall back to the old heuristic in the UI.
 *
 * Dry run by default; --write to save.
 *   npx tsx scripts/backfill-tx-source.ts [--write]
 */
import { readFile, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const PDF_DIR = path.resolve("data/pdfs");
const WRITE = process.argv.includes("--write");

interface Tx {
  description: string;
  type: string;
  date: string;
  amount: string;
  sourceUrl?: string;
  [k: string]: unknown;
}
interface SourceFiling {
  date: string;
  url: string;
  label: string;
}

function txKey(t: { description: string; type: string; date: string; amount: string }) {
  // Stored data strips trailing "(TICKER)" parentheticals into the ticker
  // field; fresh parses keep them in the description. Normalize both sides
  // so the same printed row matches across that cleaning step.
  const desc = t.description
    .replace(/\s*\([A-Z]{1,6}(\.[A-Z])?\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${desc}|${t.date}|${t.type.toLowerCase()}|${t.amount}`;
}

/** All cached parsed rows for one filing, found by the URL's PDF basename:
 * either "<base>.parsed.json" or the "<base>.pagesN-N.parsed.json" chunks. */
async function cachedRowsForFiling(
  url: string,
  pdfFiles: string[]
): Promise<Tx[] | null> {
  if (!url) return null;
  const base = decodeURIComponent(url.split("/").pop() ?? "").replace(
    /\.pdf$/i,
    ""
  );
  if (!base) return null;

  // ".text-parsed.json" is the May 2026 rebuild's cache suffix for Trump's
  // giant part-two filing; same shape as ".parsed.json".
  for (const suffix of [".parsed.json", ".text-parsed.json"]) {
    const whole = `${base}${suffix}`;
    if (pdfFiles.includes(whole)) {
      const parsed = JSON.parse(
        await readFile(path.join(PDF_DIR, whole), "utf-8")
      );
      return Array.isArray(parsed?.transactions) ? parsed.transactions : null;
    }
  }

  const chunkRe = new RegExp(
    `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.pages(\\d+)-\\d+\\.parsed\\.json$`
  );
  const chunks = pdfFiles
    .map((f) => ({ f, m: f.match(chunkRe) }))
    .filter((x): x is { f: string; m: RegExpMatchArray } => !!x.m)
    .sort((a, b) => parseInt(a.m[1], 10) - parseInt(b.m[1], 10));
  if (chunks.length === 0) return null;

  const rows: Tx[] = [];
  for (const { f } of chunks) {
    const parsed = JSON.parse(await readFile(path.join(PDF_DIR, f), "utf-8"));
    if (Array.isArray(parsed?.transactions)) rows.push(...parsed.transactions);
  }
  return rows.length ? rows : null;
}

async function main() {
  const officialsDir = path.resolve("data/officials");
  const pdfFiles = await readdir(PDF_DIR);
  let totalTx = 0;
  let stamped = 0;
  let changedAttribution = 0;

  for (const file of (await readdir(officialsDir)).filter((f) =>
    f.endsWith(".json")
  )) {
    const p = path.join(officialsDir, file);
    const official = JSON.parse(await readFile(p, "utf-8"));
    const txs: Tx[] = official.transactions ?? [];
    const filings: SourceFiling[] = official.sourceFilings ?? [];
    totalTx += txs.length;
    if (!txs.length || !filings.length) continue;

    // Filings in posted order — the first filing to assert a row is its
    // disclosure. Ties (same posted date) keep sourceFilings order.
    const ordered = [...filings].sort((a, b) =>
      a.date.slice(0, 10).localeCompare(b.date.slice(0, 10))
    );

    // Per-filing key multisets from caches.
    const budgets: Array<{ url: string; counts: Map<string, number> } | null> =
      [];
    for (const f of ordered) {
      const rows = await cachedRowsForFiling(f.url, pdfFiles);
      if (!rows) {
        budgets.push(null);
        continue;
      }
      const counts = new Map<string, number>();
      for (const r of rows) {
        const k = txKey(r);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      budgets.push({ url: f.url, counts });
    }

    let officialStamped = 0;

    // Trivial case: one filing means one possible source for every row.
    const withUrls = ordered.filter((f) => f.url);
    if (withUrls.length === 1) {
      for (const tx of txs) {
        tx.sourceUrl = withUrls[0].url;
        officialStamped++;
      }
    } else {
      for (const tx of txs) {
        const k = txKey(tx);
        for (const b of budgets) {
          if (!b) continue;
          const n = b.counts.get(k) ?? 0;
          if (n > 0) {
            b.counts.set(k, n - 1);
            if (tx.sourceUrl && tx.sourceUrl !== b.url) changedAttribution++;
            tx.sourceUrl = b.url;
            officialStamped++;
            break;
          }
        }
      }
      // Residual inference: if exactly one filing lacks a cache, every row
      // that matched NO cached filing can only have come from it. (A row
      // shared between the uncached filing and a cached one was already
      // consumed by the cache pass; only cross-filing amendment duplicates
      // could mis-order that, and those are deduped at ingest.)
      const uncached = ordered.filter((f, i) => f.url && budgets[i] === null);
      if (uncached.length === 1) {
        for (const tx of txs) {
          if (!tx.sourceUrl) {
            tx.sourceUrl = uncached[0].url;
            officialStamped++;
          }
        }
      }
    }
    stamped += officialStamped;
    console.log(
      `${official.slug}: ${officialStamped}/${txs.length} stamped (${budgets.filter(Boolean).length}/${ordered.length} filings have caches)`
    );

    if (WRITE) {
      await writeFile(p, JSON.stringify(official, null, 2));
    }
  }

  console.log(
    `\nTOTAL: ${stamped}/${totalTx} transactions stamped (${((stamped / totalTx) * 100).toFixed(1)}%)${WRITE ? " — written" : " — DRY RUN, pass --write to save"}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
