/**
 * Per-official Source Documents loader.
 *
 * Each of the 34 tracked officials has a JSON file at data/source-docs/<slug>.json
 * listing their OGE financial-disclosure documents (Nominee 278, Ethics Agreement,
 * Compliance Certification, 278-T transaction reports, etc.) with observational
 * summaries — no compliance verdicts, no judgment language.
 */
import { readFile } from "fs/promises";
import path from "path";

export type DocumentKind =
  | "nominee_278"
  | "ethics_agreement"
  | "compliance_cert"
  | "transaction_278t"
  | "certificate_of_divestiture"
  | "conflict_waiver"
  | "other";

export interface SourceDocumentEntry {
  kind: DocumentKind;
  title: string;
  filedDate: string;
  publiclyDownloadable: boolean;
  pdfPath: string | null;
  ogeUrl: string;
  summary: string;
}

export interface PropublicaCheck {
  url: string | null;
  filingsListedThere: number | null;
  discrepancies: string;
}

export interface SourceDocumentsData {
  official: string;
  displayName: string;
  documents: SourceDocumentEntry[];
  propublicaCheck: PropublicaCheck;
  generatedAt: string;
}

const DIR = path.join(process.cwd(), "data", "source-docs");

export async function getSourceDocuments(
  slug: string
): Promise<SourceDocumentsData | null> {
  try {
    const raw = await readFile(path.join(DIR, `${slug}.json`), "utf-8");
    return JSON.parse(raw) as SourceDocumentsData;
  } catch {
    return null;
  }
}
