import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

/** Dense transaction tables can exhaust the response limit before the PDF input limit. */
export const MAX_PAGES_PER_UNIT = 8;
/** A conservative chunk target, not the provider's request-size limit. */
const TARGET_CHUNK_BYTES = 500_000;

/** One piece of a filing to parse. Page ranges are one-based and inclusive. */
export interface ParseUnit {
  path: string;
  chunk: { first: number; last: number } | null;
}

export async function splitPdfIfNeeded(
  pdfPath: string
): Promise<{ units: ParseUnit[]; pageCount: number | null }> {
  const buf = await readFile(pdfPath);
  const doc = await PDFDocument.load(buf);
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error(`PDF has no pages: ${pdfPath}`);
  if (buf.length <= TARGET_CHUNK_BYTES && pageCount <= MAX_PAGES_PER_UNIT) {
    return { units: [{ path: pdfPath, chunk: null }], pageCount: null };
  }

  // Keep the existing initial grouping for cache reuse. Uneven scans can make
  // a group much larger than this average predicts, so measure each saved PDF.
  const bytesPerPage = buf.length / pageCount;
  const pagesPerChunk = Math.max(1, Math.min(MAX_PAGES_PER_UNIT, Math.floor(TARGET_CHUNK_BYTES / bytesPerPage)));
  const units: ParseUnit[] = [];
  const basename = pdfPath.replace(/\.pdf$/i, "");

  async function saveRange(start: number, end: number): Promise<void> {
    const chunkDoc = await PDFDocument.create();
    const pages = await chunkDoc.copyPages(doc, Array.from({ length: end - start }, (_, k) => start + k));
    pages.forEach((page) => chunkDoc.addPage(page));
    const bytes = await chunkDoc.save();
    if (bytes.length > TARGET_CHUNK_BYTES && end - start > 1) {
      const middle = start + Math.floor((end - start) / 2);
      await saveRange(start, middle);
      await saveRange(middle, end);
      return;
    }
    if (bytes.length > TARGET_CHUNK_BYTES) {
      console.warn(
        `PDF page ${start + 1} of ${path.basename(pdfPath)} is ${bytes.length} bytes, above the ${TARGET_CHUNK_BYTES}-byte chunk target. Keeping the single page intact. Review this page against the provider request limits before sending.`
      );
    }
    const chunkPath = `${basename}.pages${start + 1}-${end}.pdf`;
    await writeFile(chunkPath, bytes);
    units.push({ path: chunkPath, chunk: { first: start + 1, last: end } });
  }

  for (let start = 0; start < pageCount; start += pagesPerChunk) {
    await saveRange(start, Math.min(start + pagesPerChunk, pageCount));
  }
  console.log(`           split ${path.basename(pdfPath)} into ${units.length} chunks`);
  return { units, pageCount };
}
