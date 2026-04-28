/**
 * Divestiture data loader (PILOT — Lutnick only).
 *
 * Reads structured data combining four OGE document types per official:
 *   - Nominee 278 (entry holdings)
 *   - Ethics Agreement (what they promised to divest)
 *   - 278-T Periodic Transaction Reports (trades on file)
 *   - Compliance Certification (OGE's official sign-off)
 *
 * The site does not issue compliance verdicts — it shows what each document
 * says and lets readers connect the facts themselves.
 */
import { readFile } from "fs/promises";
import path from "path";
import type { Transaction } from "./types";
import { amountRangeToMidpoint } from "./format";

export interface SourceDocument {
  kind:
    | "nominee_278"
    | "ethics_agreement"
    | "compliance_cert"
    | "transaction_reports";
  title: string;
  subtitle: string;
  filedDate: string;
  pdfPath: string | null;
  ogeUrl: string;
}

export interface ComplianceVerdict {
  certifiedDate: string;
  summary: string;
  keyExcerpt: string;
  excerptSource: string;
}

export interface DivestiturePromise {
  entity: string;
  ticker: string | null;
  section: string;
  action: string;
  deadline: string | null;
  matchedSaleTickers: string[];
  matchedSaleDescriptionTokens: string[];
}

export interface DivestitureData {
  official: string;
  displayName: string;
  confirmedDate: string;
  deadline90Days: string;
  sourceDocuments: SourceDocument[];
  complianceVerdict: ComplianceVerdict;
  promises: DivestiturePromise[];
  retainedPositions: {
    summary: string;
    section9Count: number;
    section10Count: number;
    trusteePositionsRetained: number;
  };
}

export interface PromiseEvidence {
  promise: DivestiturePromise;
  matchingSales: Transaction[];
  earliestSaleDate: string | null;
  latestSaleDate: string | null;
  saleVolumeMidpoint: number;
  status: "sales-on-file" | "no-sales-on-file";
}

const DIR = path.join(process.cwd(), "data", "divestiture");

export async function getDivestitureData(
  slug: string
): Promise<DivestitureData | null> {
  try {
    const raw = await readFile(path.join(DIR, `${slug}.json`), "utf-8");
    return JSON.parse(raw) as DivestitureData;
  } catch {
    return null;
  }
}

/**
 * Match each promise against the official's 278-T transactions. Ticker match
 * first (high confidence), then case-insensitive description token match.
 * Sales must be dated on or after the official's confirmation date.
 */
export function buildPromiseEvidence(
  data: DivestitureData,
  transactions: Transaction[]
): PromiseEvidence[] {
  const sales = transactions.filter(
    (t) =>
      t.type.startsWith("Sale") &&
      t.date >= data.confirmedDate
  );

  return data.promises.map((promise) => {
    const matchingSales: Transaction[] = [];

    for (const sale of sales) {
      // Ticker match
      if (sale.ticker && promise.matchedSaleTickers.includes(sale.ticker)) {
        matchingSales.push(sale);
        continue;
      }
      // Description token match (all tokens must appear in description)
      const desc = (sale.description ?? "").toLowerCase();
      const tokens = promise.matchedSaleDescriptionTokens;
      if (
        tokens.length > 0 &&
        tokens.every((tok) => desc.includes(tok.toLowerCase()))
      ) {
        matchingSales.push(sale);
      }
    }

    matchingSales.sort((a, b) => a.date.localeCompare(b.date));

    return {
      promise,
      matchingSales,
      earliestSaleDate: matchingSales[0]?.date ?? null,
      latestSaleDate:
        matchingSales[matchingSales.length - 1]?.date ?? null,
      saleVolumeMidpoint: matchingSales.reduce(
        (sum, t) => sum + amountRangeToMidpoint(t.amount),
        0
      ),
      status: matchingSales.length > 0 ? "sales-on-file" : "no-sales-on-file",
    };
  });
}
