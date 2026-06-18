import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const OGE_API_BASE =
  "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest";

const MIN_DOC_DATE = "2025-02-01";

const NAME_ALIASES: Record<string, string> = {
  "Trump, Donald J": "Trump, Donald J.",
  "Wright, Christopher A": "Wright, Christopher",
  "McMahon, Linda E": "McMahon, Linda",
  "Sonderling, Keith": "Sonderling, Keith E",
  "Lawrence, Paul": "Lawrence, Paul R",
  "Miran, Stephen": "Miran, Stephen I",
};

export interface OGERecord {
  type: string;
  name: string;
  agency: string;
  title: string;
  level: string;
  docDate: string;
  amended?: string;
}

export interface TargetFiling {
  name: string;
  pdfUrl: string;
  docDate: string;
  agency?: string;
  title?: string;
  level?: string;
}

export interface LastCheckFile {
  lastChecked: string;
  knownFilings?: Record<string, number>;
  knownFilingsByOfficial?: Record<string, number>;
  knownFilingUrls?: string[];
  newFilings?: Array<TargetFiling & { status: string }>;
}

export function canonicalName(name: string): string {
  return NAME_ALIASES[name] ?? name;
}

export function extractPdfUrl(typeField: string): string | null {
  const match = typeField.match(/href=["']([^"']+\.pdf)["']/i);
  if (!match) return null;

  const url = match[1];
  if (url.startsWith("http")) return url;
  return new URL(url, OGE_API_BASE).toString();
}

export function is278T(typeField: string): boolean {
  return (
    /278\s+Transaction/i.test(typeField) ||
    /278[\s-]*T(?!ERM)(?:\b|\()/i.test(typeField)
  );
}

export function isTargetLevel(record: OGERecord): boolean {
  if (record.level === "Level I" || record.level === "Level II") return true;
  return record.name === "Trump, Donald J" || record.name === "Trump, Donald J.";
}

function isInScope(docDate: string): boolean {
  return docDate.slice(0, 10) >= MIN_DOC_DATE;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "OpenCabinet/1.0" },
    });
    if (!res.ok) {
      throw new Error(`OGE API returned HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithRetries(url: string, timeoutMs: number) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fetchJsonWithTimeout(url, timeoutMs);
    } catch (err) {
      lastError = err as Error;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

export async function fetchOgeRecords({
  pageSize = 1000,
  delayMs = 2000,
  timeoutMs = 30000,
  log,
}: {
  pageSize?: number;
  delayMs?: number;
  timeoutMs?: number;
  log?: (message: string) => void;
} = {}): Promise<{ records: OGERecord[]; totalRecords: number }> {
  let allRecords: OGERecord[] = [];
  let start = 0;
  let totalRecords: number | null = null;

  while (true) {
    const url = `${OGE_API_BASE}?start=${start}&length=${pageSize}`;
    log?.(`Fetching OGE records ${start}...`);
    const data = await fetchJsonWithRetries(url, timeoutMs);

    if (!Array.isArray(data.data)) {
      throw new Error("OGE API response did not include a data array");
    }

    const pageTotal = Number(data.recordsTotal ?? 0);
    if (start === 0) {
      if (pageTotal <= 0) {
        throw new Error("OGE API returned zero records");
      }
      totalRecords = pageTotal;
    }

    if (data.data.length === 0) {
      if (start === 0 || (totalRecords !== null && start < totalRecords)) {
        throw new Error(
          `OGE API returned an empty page before all records were fetched (start=${start})`
        );
      }
      break;
    }

    allRecords = allRecords.concat(data.data as OGERecord[]);
    start += pageSize;

    if (totalRecords !== null && start >= totalRecords) break;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (allRecords.length === 0) {
    throw new Error("OGE API returned no usable records");
  }

  return { records: allRecords, totalRecords: totalRecords ?? allRecords.length };
}

export function getTargetFilings(records: OGERecord[]): TargetFiling[] {
  const byUrl = new Map<string, TargetFiling>();

  for (const record of records) {
    if (!isTargetLevel(record)) continue;
    if (!is278T(record.type)) continue;
    if (!isInScope(record.docDate)) continue;

    const pdfUrl = extractPdfUrl(record.type);
    if (!pdfUrl) continue;

    byUrl.set(pdfUrl, {
      name: canonicalName(record.name),
      pdfUrl,
      docDate: record.docDate,
      agency: record.agency,
      title: record.title,
      level: record.level,
    });
  }

  return Array.from(byUrl.values()).sort((a, b) => {
    const dateOrder = b.docDate.localeCompare(a.docDate);
    if (dateOrder !== 0) return dateOrder;
    return a.name.localeCompare(b.name);
  });
}

export function countByOfficial(filings: TargetFiling[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const filing of filings) {
    counts[filing.name] = (counts[filing.name] || 0) + 1;
  }
  return counts;
}

export function diffNewFilings(
  filings: TargetFiling[],
  knownUrls: Set<string>
): TargetFiling[] {
  return filings.filter((filing) => !knownUrls.has(filing.pdfUrl));
}

export async function loadKnownFilingUrlsFromData(
  root = process.cwd()
): Promise<Set<string>> {
  const urls = new Set<string>();

  const officialsDir = path.join(root, "data", "officials");
  try {
    const files = await readdir(officialsDir);
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const raw = await readFile(path.join(officialsDir, file), "utf-8");
      const official = JSON.parse(raw) as {
        sourceFilings?: Array<{ url?: string }>;
      };
      for (const filing of official.sourceFilings || []) {
        if (filing.url) urls.add(filing.url);
      }
    }
  } catch {
    // Production cron can still rely on last-check state if data files are absent.
  }

  const lastCheckPath = path.join(root, "data", "meta", "last-check.json");
  try {
    const lastCheck = JSON.parse(
      await readFile(lastCheckPath, "utf-8")
    ) as LastCheckFile;

    for (const url of lastCheck.knownFilingUrls || []) {
      urls.add(url);
    }

    for (const key of Object.keys(lastCheck.knownFilings || {})) {
      if (key.startsWith("http")) urls.add(key);
    }

    for (const filing of lastCheck.newFilings || []) {
      if (filing.pdfUrl) urls.add(filing.pdfUrl);
    }
  } catch {
    // First run or missing local state.
  }

  return urls;
}

export async function writeLastCheckState({
  root = process.cwd(),
  filings,
  newFilings,
}: {
  root?: string;
  filings: TargetFiling[];
  newFilings: Array<TargetFiling & { status: string }>;
}) {
  const lastCheckPath = path.join(root, "data", "meta", "last-check.json");
  await mkdir(path.dirname(lastCheckPath), { recursive: true });
  const state: LastCheckFile = {
    lastChecked: new Date().toISOString(),
    knownFilingUrls: filings.map((filing) => filing.pdfUrl).sort(),
    knownFilingsByOfficial: countByOfficial(filings),
    newFilings,
  };

  await writeFile(lastCheckPath, JSON.stringify(state, null, 2) + "\n");
}
