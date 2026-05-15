/**
 * Ingest the two Trump 278-T filings posted to OGE on 2026-05-14
 * (the Reuters wire story). The second filing is 113 pages, which
 * exceeds Anthropic's 100-page PDF limit, so we split it into
 * halves, parse each, and merge.
 *
 * Usage: npx tsx scripts/ingest-trump-may14.ts
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import https from "https";
import { PDFDocument } from "pdf-lib";
import { parsePdf, type ParsedTransaction } from "./parse-pdf.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const TRUMP_JSON = path.resolve("data/officials/trump-donald-j.json");
const PDF_DIR = path.resolve("data/pdfs");

const FILINGS = [
  {
    label: "Trump 2026-05-08 278T part 1",
    docDate: "2026-05-14",
    url: "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/5326D3AF5BE7C25385258DF7002DD1B7/$FILE/Trump%2C%20Donald%20J.-05.08.2026-278T.pdf",
    filename: "Trump, Donald J.-05.08.2026-278T.pdf",
  },
  {
    label: "Trump 2026-05-08 278T part 2",
    docDate: "2026-05-14",
    url: "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/405E4EC4E27BE8D185258DF7002DD1C0/$FILE/Trump%2C%20Donald%20J.-05.08.2026-278T(2).pdf",
    filename: "Trump, Donald J.-05.08.2026-278T(2).pdf",
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = require("fs").createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "OpenCabinet/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          download(res.headers.location!, dest).then(resolve, reject);
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
      .on("error", reject);
  });
}

async function ensurePdf(url: string, filename: string): Promise<string> {
  await mkdir(PDF_DIR, { recursive: true });
  const dest = path.join(PDF_DIR, filename);
  if (existsSync(dest) && statSync(dest).size > 100_000) return dest;
  console.log(`  downloading ${filename}...`);
  await download(url, dest);
  return dest;
}

async function splitPdfIfNeeded(pdfPath: string): Promise<string[]> {
  const buf = await readFile(pdfPath);
  const doc = await PDFDocument.load(buf);
  const pageCount = doc.getPageCount();
  console.log(`  ${path.basename(pdfPath)}: ${pageCount} pages, ${(buf.length / 1024).toFixed(0)} KB`);

  // We split aggressively because Anthropic's PDF endpoint drops the
  // connection on uploads above ~1 MB in this environment. Keep chunks
  // small enough that base64 payload stays under ~700 KB on the wire.
  const bytesPerPage = buf.length / pageCount;
  const targetPerChunkBytes = 500_000;
  const pagesPerChunk = Math.max(
    1,
    Math.min(80, Math.floor(targetPerChunkBytes / bytesPerPage))
  );
  if (pageCount <= pagesPerChunk && buf.length <= targetPerChunkBytes) return [pdfPath];

  const chunkSize = pagesPerChunk;
  const chunks: string[] = [];
  for (let i = 0; i < pageCount; i += chunkSize) {
    const end = Math.min(i + chunkSize, pageCount);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(
      doc,
      Array.from({ length: end - i }, (_, k) => i + k)
    );
    pages.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    const chunkPath = pdfPath.replace(/\.pdf$/i, `.pages${i + 1}-${end}.pdf`);
    await writeFile(chunkPath, bytes);
    console.log(`    split → ${path.basename(chunkPath)} (pages ${i + 1}-${end})`);
    chunks.push(chunkPath);
  }
  return chunks;
}

function txKey(tx: ParsedTransaction): string {
  return `${tx.description.trim().toLowerCase()}|${tx.date}|${tx.type.toLowerCase()}|${tx.amount}`;
}

async function parseWithRetry(pdfPath: string, attempts = 3): Promise<ParsedTransaction[]> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await parsePdf(pdfPath);
      console.log(`    ${path.basename(pdfPath)}: ${r.transactions.length} txns, $${r.tokenUsage.estimatedCostUsd}`);
      // Cache
      await writeFile(
        pdfPath.replace(/\.pdf$/i, ".parsed.json"),
        JSON.stringify(r, null, 2)
      );
      return r.transactions;
    } catch (err: any) {
      console.warn(`    attempt ${i}/${attempts} failed: ${err.message}`);
      if (i === attempts) throw err;
      await sleep(5000 * i);
    }
  }
  return [];
}

async function main() {
  console.log("\n=== Trump 2026-05-14 ingest ===\n");

  const allNewTxs: ParsedTransaction[] = [];
  const newSources: Array<{ date: string; url: string; label: string }> = [];

  for (const f of FILINGS) {
    console.log(`\n→ ${f.label}`);
    const pdf = await ensurePdf(f.url, f.filename);
    const chunks = await splitPdfIfNeeded(pdf);
    for (const chunk of chunks) {
      const txs = await parseWithRetry(chunk);
      allNewTxs.push(...txs);
      await sleep(2000);
    }
    newSources.push({ date: f.docDate, url: f.url, label: f.label });
  }

  console.log(`\nTotal extracted across both filings: ${allNewTxs.length}`);

  // Load current Trump JSON
  const trump = JSON.parse(await readFile(TRUMP_JSON, "utf-8"));
  const existingKeys = new Set(trump.transactions.map(txKey));

  const added: ParsedTransaction[] = [];
  for (const tx of allNewTxs) {
    const k = txKey(tx);
    if (existingKeys.has(k)) continue;
    existingKeys.add(k);
    const { confidence, ...rest } = tx as any;
    added.push(rest);
  }

  console.log(`New (after dedupe vs existing ${trump.transactions.length}): ${added.length}`);

  const merged = [...added, ...trump.transactions];
  merged.sort((a: any, b: any) => {
    const d = (b.date || "").localeCompare(a.date || "");
    if (d !== 0) return d;
    return (a.description || "").localeCompare(b.description || "");
  });

  trump.transactions = merged;
  trump.sourceFilings = [...newSources, ...(trump.sourceFilings || [])];
  trump.mostRecentFilingDate = "2026-05-14";

  await writeFile(TRUMP_JSON, JSON.stringify(trump, null, 2) + "\n");
  console.log(`\nWrote ${TRUMP_JSON}`);
  console.log(`Transactions: ${merged.length} total (added ${added.length})`);
  console.log(`Source filings: ${trump.sourceFilings.length} total`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
