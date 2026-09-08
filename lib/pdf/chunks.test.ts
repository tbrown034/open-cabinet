import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, degrees } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitPdfIfNeeded } from "./chunks";

describe("PDF chunking", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "open-cabinet-pdf-chunks-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  async function fixture(pageSizes: number[], rotation = 0, filename = "filing.pdf") {
    const doc = await PDFDocument.create();
    pageSizes.forEach((size, index) => {
      // Distinct widths let the tests detect reordered or repeated pages.
      const page = doc.addPage([300 + index, 400]);
      page.setRotation(degrees(rotation));
      if (size) {
        // An uncompressed PDF comment makes selected pages reliably large.
        const stream = doc.context.stream(`%${"x".repeat(size)}\n`);
        page.node.addContentStream(doc.context.register(stream));
      }
    });
    const bytes = await doc.save({ addDefaultPage: false });
    const file = path.join(dir, filename);
    await writeFile(file, bytes);
    return { file, bytes: Buffer.from(bytes) };
  }

  it("keeps a small whole PDF as the original input", async () => {
    const { file, bytes } = await fixture([0, 0]);
    expect(await splitPdfIfNeeded(file)).toEqual({ units: [{ path: file, chunk: null }], pageCount: null });
    expect(await readFile(file)).toEqual(bytes);
  });

  it("keeps eight-page grouping for small pages and preserves rotation", async () => {
    const { file, bytes } = await fixture(Array(10).fill(0), 90);
    const result = await splitPdfIfNeeded(file);
    expect(result.pageCount).toBe(10);
    expect(result.units.map((unit) => unit.chunk)).toEqual([{ first: 1, last: 8 }, { first: 9, last: 10 }]);
    for (const unit of result.units) {
      const chunk = await PDFDocument.load(await readFile(unit.path));
      expect(chunk.getPages().map((page) => page.getRotation().angle)).toEqual(Array(chunk.getPageCount()).fill(90));
    }
    expect(await readFile(file)).toEqual(bytes);
  });

  it("splits an unexpectedly large group without gaps, duplicates, or reordered pages", async () => {
    const { file, bytes } = await fixture([300_000, 300_000, ...Array(10).fill(0)]);
    // The old average-based grouping puts both large pages in one chunk.
    const initialGroupSize = Math.min(8, Math.floor(500_000 / (bytes.length / 12)));
    expect(initialGroupSize).toBeGreaterThan(1);
    const { units, pageCount } = await splitPdfIfNeeded(file);
    expect(pageCount).toBe(12);
    expect(units[0].chunk).toEqual({ first: 1, last: 1 });
    expect(units[1].chunk).toEqual({ first: 2, last: 2 });
    let nextPage = 1;
    const widths: number[] = [];
    for (const unit of units) {
      expect(unit.chunk?.first).toBe(nextPage);
      expect((await stat(unit.path)).size).toBeLessThanOrEqual(500_000);
      const chunk = await PDFDocument.load(await readFile(unit.path));
      expect(chunk.getPageCount()).toBe(unit.chunk!.last - unit.chunk!.first + 1);
      expect(chunk.getPageCount()).toBeLessThanOrEqual(8);
      widths.push(...chunk.getPages().map((page) => page.getWidth()));
      nextPage = unit.chunk!.last + 1;
    }
    expect(nextPage).toBe(13);
    expect(widths).toEqual(Array.from({ length: 12 }, (_, index) => 300 + index));
    expect(await readFile(file)).toEqual(bytes);
  });

  it("warns and preserves an oversized single page rather than shrinking it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A source without a .pdf suffix must also never be overwritten.
    const { file, bytes } = await fixture([600_000], 270, "filing");
    const { units } = await splitPdfIfNeeded(file);
    expect(units).toHaveLength(1);
    expect(units[0].chunk).toEqual({ first: 1, last: 1 });
    expect(units[0].path).not.toBe(file);
    expect((await stat(units[0].path)).size).toBeGreaterThan(500_000);
    const chunk = await PDFDocument.load(await readFile(units[0].path));
    expect(chunk.getPage(0).getRotation().angle).toBe(270);
    expect(await readFile(file)).toEqual(bytes);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Keeping the single page intact"));
  });

  it("rejects an empty PDF with a clear error", async () => {
    const { file } = await fixture([]);
    await expect(splitPdfIfNeeded(file)).rejects.toThrow("PDF has no pages");
  });
});
