import { readFileSync } from "node:fs";
import path from "node:path";

export type PdfStatus = "available" | "unavailable" | "unconfirmed";
export interface SourceCheck {
  url: string;
  slug: string;
  indexListed: boolean;
  pdfStatus: PdfStatus;
  httpStatus?: number;
  detail?: string;
}
export interface SourceAvailability {
  checkedAt: string;
  totalOgeRecords: number;
  filings: Record<string, SourceCheck>;
}
export const SOURCE_AVAILABILITY_PATH = path.resolve("data/meta/source-availability.json");

export function sourceKey(url: string): string {
  try { return decodeURIComponent(url); } catch { return url; }
}

export function readSourceAvailability(): SourceAvailability | null {
  try {
    const value = JSON.parse(readFileSync(SOURCE_AVAILABILITY_PATH, "utf8"));
    return typeof value.checkedAt === "string" && value.filings && typeof value.filings === "object" ? value : null;
  }
  catch { return null; }
}

/** Read only the start of the response. A timeout, 403 or server error is
 * inconclusive; only 404/410 establish that the original URL is unavailable. */
export async function probePdf(url: string, fetcher: typeof fetch = fetch): Promise<{
  pdfStatus: PdfStatus; httpStatus?: number; detail?: string;
}> {
  try {
    const response = await fetcher(url, {
      headers: { "User-Agent": "OpenCabinet/1.0", Range: "bytes=0-1023" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return {
        pdfStatus: response.status === 404 || response.status === 410 ? "unavailable" : "unconfirmed",
        httpStatus: response.status,
      };
    }
    const reader = response.body?.getReader();
    if (!reader) return { pdfStatus: "unconfirmed", httpStatus: response.status, detail: "Empty response" };
    let prefix = "";
    try {
      while (prefix.length < 5) {
        const chunk = await reader.read();
        if (chunk.done) break;
        prefix += new TextDecoder().decode(chunk.value.slice(0, 5 - prefix.length));
      }
    } finally { await reader.cancel(); }
    return {
      pdfStatus: prefix === "%PDF-" ? "available" : "unconfirmed",
      httpStatus: response.status,
      ...(prefix === "%PDF-" ? {} : { detail: "Response did not start with a PDF header" }),
    };
  } catch {
    return { pdfStatus: "unconfirmed", detail: "Request failed or timed out; retry needed" };
  }
}

export function sourceAvailabilityLabel(check: SourceCheck): string | null {
  if (check.pdfStatus === "unavailable") return `OGE PDF unavailable (HTTP ${check.httpStatus})`;
  if (!check.indexListed) return "Not listed in OGE’s index at last check";
  if (check.pdfStatus === "unconfirmed") return "PDF availability could not be confirmed";
  return null;
}
