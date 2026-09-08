import { describe, expect, it, vi } from "vitest";
import { probePdf, sourceKey, sourceAvailabilityLabel } from "./source-availability";

describe("source availability", () => {
  it.each([404, 410])("flags HTTP %i without changing or removing the source URL", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Not found", { status }));
    expect(await probePdf("https://extapps2.oge.gov/report.pdf", fetcher)).toEqual({ pdfStatus: "unavailable", httpStatus: status });
    expect(fetcher.mock.calls[0][1]?.headers).toHaveProperty("Range", "bytes=0-1023");
  });
  it.each([403, 429, 500, 503])("does not call HTTP %i a removed PDF", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Retry later", { status }));
    expect((await probePdf("https://extapps2.oge.gov/report.pdf", fetcher)).pdfStatus).toBe("unconfirmed");
  });
  it("keeps transport failures and HTML error pages inconclusive", async () => {
    const failed = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    expect((await probePdf("https://extapps2.oge.gov/report.pdf", failed)).pdfStatus).toBe("unconfirmed");
    const html = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>Unavailable</html>"));
    expect((await probePdf("https://extapps2.oge.gov/report.pdf", html)).pdfStatus).toBe("unconfirmed");
  });
  it("accepts a PDF signature split across response chunks, then cancels the download", async () => {
    const cancel = vi.fn();
    const chunks = ["%P", "DF-", "remaining PDF bytes"];
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new TextEncoder().encode(chunks.shift() ?? "unused")); }, cancel,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 206 }));
    expect(await probePdf("https://extapps2.oge.gov/report.pdf", fetcher)).toEqual({ pdfStatus: "available", httpStatus: 206 });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("distinguishes missing index entries from broken PDFs and normalizes encoded URLs", () => {
    expect(sourceKey("https://x/Name%20A.pdf")).toBe(sourceKey("https://x/Name A.pdf"));
    expect(sourceAvailabilityLabel({ url: "https://x/a.pdf", slug: "a", indexListed: false, pdfStatus: "available" })).toContain("Not listed");
  });
});
