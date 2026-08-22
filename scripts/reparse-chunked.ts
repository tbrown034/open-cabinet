/**
 * Chunked retry for filings too large for a single-call parse (the model's
 * output limit truncates the JSON mid-row). Splits the PDF into small page
 * chunks, parses each, and writes ONE merged .parsed.json in the same
 * format the whole-file path produces.
 *
 *   npx tsx scripts/reparse-chunked.ts <filing.pdf> [pagesPerChunk=3]
 */
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import { PDFDocument } from "pdf-lib";
import { parsePdf, type ParsedTransaction } from "./parse-pdf.js";

dotenv.config({ path: ".env.local" });

async function main() {
  const pdfPath = process.argv[2];
  const pagesPerChunk = parseInt(process.argv[3] ?? "3", 10);
  if (!pdfPath || !existsSync(pdfPath)) {
    console.error("usage: npx tsx scripts/reparse-chunked.ts <filing.pdf> [pagesPerChunk]");
    process.exit(2);
  }

  const buf = await readFile(pdfPath);
  const doc = await PDFDocument.load(buf);
  const pageCount = doc.getPageCount();
  console.log(`${path.basename(pdfPath)}: ${pageCount} pages, chunks of ${pagesPerChunk}`);

  const all: ParsedTransaction[] = [];
  let costUsd = 0;
  for (let i = 0; i < pageCount; i += pagesPerChunk) {
    const end = Math.min(i + pagesPerChunk, pageCount);
    const chunkDoc = await PDFDocument.create();
    const pages = await chunkDoc.copyPages(
      doc,
      Array.from({ length: end - i }, (_, k) => i + k)
    );
    pages.forEach((p) => chunkDoc.addPage(p));
    const chunkPath = pdfPath.replace(
      /\.pdf$/i,
      `.retry-pages${i + 1}-${end}.pdf`
    );
    await writeFile(chunkPath, await chunkDoc.save());
    const result = await parsePdf(chunkPath);
    all.push(...result.transactions);
    costUsd += Number(result.tokenUsage.estimatedCostUsd) || 0;
    console.log(`  pages ${i + 1}-${end}: ${result.transactions.length} txns`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  const outPath = pdfPath.replace(/\.pdf$/i, ".parsed.json");
  await writeFile(
    outPath,
    JSON.stringify(
      { transactions: all, pdfPath, model: "chunked", tokenUsage: { estimatedCostUsd: costUsd.toFixed(4) } },
      null,
      2
    )
  );
  console.log(`wrote ${outPath}: ${all.length} txns, ~$${costUsd.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
