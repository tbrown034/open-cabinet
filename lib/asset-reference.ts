/**
 * The free reference lists the asset resolution lane matches against,
 * loaded from the snapshots under data/meta/sources (fetched by
 * scripts/fetch-asset-sources.ts, hashes in asset-sources.json).
 *
 *   Nasdaq Trader symbol directory (nasdaqlisted.txt + otherlisted.txt):
 *     one line per listed security: symbol, security name, ETF flag,
 *     exchange. Preferreds, warrants, units, notes and depositary shares
 *     are separate lines with their own symbols and are marked here so a
 *     stock match never lands on them.
 *   SEC company_tickers_exchange.json: issuers with a CIK, their SEC
 *     conformed name and primary ticker. The corroborating layer.
 *
 * Everything is indexed by the same key function the site applies to a
 * printed description (lib/asset-normalize assetNameKey), so a match is
 * an exact key equality, never a similarity score. A key that maps to
 * more than one symbol is ambiguous and is reported as such; the caller
 * never picks one.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { assetNameKey, referenceNameKey } from "./asset-normalize";

export const SOURCES_DIR = path.join(process.cwd(), "data", "meta", "sources");

export type ListedKind = "common" | "etf" | "preferred" | "warrant" | "unit" | "note" | "depositary" | "right" | "other";

export interface ListedSecurity {
  symbol: string;
  name: string;
  exchange: string;
  etf: boolean;
  kind: ListedKind;
  /** "nasdaq" or "other" (NYSE, NYSE American, NYSE Arca, regionals). */
  source: "nasdaq" | "other";
  key: string;
}

export interface SecIssuer {
  cik: number;
  name: string;
  ticker: string;
  exchange: string;
  key: string;
}

export interface AssetReference {
  listed: ListedSecurity[];
  listedBySymbol: Map<string, ListedSecurity>;
  /** key -> distinct symbols of common stock and ETF lines only */
  listedByKey: Map<string, ListedSecurity[]>;
  /** key with spaces removed -> common/ETF listings ("JPMORGANCHASE" meets "JP MORGAN CHASE") */
  listedByFlatKey: Map<string, ListedSecurity[]>;
  sec: SecIssuer[];
  secBySymbol: Map<string, SecIssuer>;
  secByKey: Map<string, SecIssuer[]>;
  secByFlatKey: Map<string, SecIssuer[]>;
}

export const flatKey = (key: string) => key.replace(/ /g, "");

function kindOf(name: string, etf: boolean): ListedKind {
  const n = name.toLowerCase();
  // Exchange-traded notes carry the ETF flag in the directory but are debt
  // of the issuing bank (JPMorgan's AMJB), never that bank's stock.
  if (/\betns?\b/.test(n)) return "note";
  if (etf) return "etf";
  if (/\bpreferred\b|\bpfd\b|\bperpetual\b|\bpreference\b/.test(n)) return "preferred";
  if (/\bwarrants?\b/.test(n)) return "warrant";
  if (/\bunits?\b/.test(n)) return "unit";
  if (/\brights?\b/.test(n)) return "right";
  if (/\bnotes?\b|\bdebentures?\b|\bsubordinated\b|\bsenior\b|\betns?\b|\bzones\b|\bdue \d{4}\b|\bdue (?:january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(n)) return "note";
  if (/\bdepositary\b|\bdepository\b/.test(n) && !/\bamerican depositary\b/.test(n)) return "depositary";
  return "common";
}

/** Nasdaq prints class shares as BRK.B; some rows on the site print BRK/B or BRKB. */
export function canonicalListedSymbol(sym: string): string {
  // Nasdaq prints BRK.B; the SEC prints BRK-B; brokers print BRK/B or BRK B.
  return sym.trim().toUpperCase().replace(/[\/\s-]+/g, ".");
}

function parsePipeFile(file: string, cols: { symbol: number; name: number; etf: number; exchange: number | null; test: number }, source: "nasdaq" | "other"): ListedSecurity[] {
  const out: ListedSecurity[] = [];
  const lines = readFileSync(file, "utf-8").split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("File Creation Time")) continue;
    const f = line.split("|");
    if (f[cols.test] === "Y") continue; // test issues
    const symbol = canonicalListedSymbol(f[cols.symbol] ?? "");
    const name = (f[cols.name] ?? "").trim();
    if (!symbol || !name) continue;
    const etf = f[cols.etf] === "Y";
    out.push({ symbol, name, exchange: cols.exchange === null ? "Nasdaq" : f[cols.exchange] ?? "", etf, kind: kindOf(name, etf), source, key: referenceNameKey(name) });
  }
  return out;
}

let cached: AssetReference | null = null;

export function loadAssetReference(dir = SOURCES_DIR): AssetReference {
  if (cached) return cached;
  const nasdaqFile = path.join(dir, "nasdaqlisted.txt");
  const otherFile = path.join(dir, "otherlisted.txt");
  const secFile = path.join(dir, "sec-company-tickers-exchange.json");
  for (const f of [nasdaqFile, otherFile, secFile]) if (!existsSync(f)) throw new Error(`asset reference missing: ${f}; run pnpm fetch-asset-sources`);
  // nasdaqlisted: Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
  const nasdaq = parsePipeFile(nasdaqFile, { symbol: 0, name: 1, etf: 6, exchange: null, test: 3 }, "nasdaq");
  // otherlisted: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
  const other = parsePipeFile(otherFile, { symbol: 0, name: 1, etf: 4, exchange: 2, test: 6 }, "other");
  const listed = [...nasdaq, ...other];
  const listedBySymbol = new Map<string, ListedSecurity>();
  const listedByKey = new Map<string, ListedSecurity[]>();
  const listedByFlatKey = new Map<string, ListedSecurity[]>();
  const push = <T extends { symbol?: string; ticker?: string }>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k) ?? [];
    const id = (x: T) => x.symbol ?? x.ticker;
    if (!arr.some((x) => id(x) === id(v))) arr.push(v);
    m.set(k, arr);
  };
  for (const s of listed) {
    if (!listedBySymbol.has(s.symbol)) listedBySymbol.set(s.symbol, s);
    if (s.kind === "common" || s.kind === "etf") {
      push(listedByKey, s.key, s);
      push(listedByFlatKey, flatKey(s.key), s);
    }
  }
  const secRaw = JSON.parse(readFileSync(secFile, "utf-8")) as { fields: string[]; data: Array<[number, string, string, string]> };
  const sec: SecIssuer[] = secRaw.data.map(([cik, name, ticker, exchange]) => ({ cik, name, ticker: canonicalListedSymbol(ticker ?? ""), exchange: exchange ?? "", key: assetNameKey(name) }));
  const secBySymbol = new Map<string, SecIssuer>();
  const secByKey = new Map<string, SecIssuer[]>();
  const secByFlatKey = new Map<string, SecIssuer[]>();
  for (const s of sec) {
    if (s.ticker && !secBySymbol.has(s.ticker)) secBySymbol.set(s.ticker, s);
    // The SEC lists every exchange symbol an issuer has, preferred series
    // and notes included ("JPM-PC", "DUKB"). For name matching, only a
    // symbol that is a common stock or ETF line in the Nasdaq directory,
    // or one the directory does not carry at all (OTC), counts.
    const listedKind = listedBySymbol.get(s.ticker)?.kind;
    if (listedKind && listedKind !== "common" && listedKind !== "etf") continue;
    if (/-P[A-Z]?$/.test(s.ticker) || /\.P[A-Z]?$/.test(s.ticker)) continue;
    push(secByKey, s.key, s);
    push(secByFlatKey, flatKey(s.key), s);
  }
  cached = { listed, listedBySymbol, listedByKey, listedByFlatKey, sec, secBySymbol, secByKey, secByFlatKey };
  return cached;
}

/** Test seam. */
export function resetAssetReferenceCache(): void {
  cached = null;
}

const STOP = new Set(["INC", "CORP", "CO", "COMPANY", "LTD", "PLC", "LLC", "GROUP", "HOLDINGS", "HLDGS", "THE", "AND", "TRUST", "FUND", "ETF", "CLASS", "SHARES", "COMMON", "STOCK", "NEW", "INTERNATIONAL", "INTL", "AMERICAN", "GLOBAL", "FINANCIAL", "FINL", "CAPITAL", "ENERGY", "TECHNOLOGIES", "TECHNOLOGY", "SYSTEMS", "SERVICES", "BANCORP", "BANK", "FIRST", "NATIONAL", "NATL", "UNITED", "GENERAL", "REIT", "REALTY", "PARTNERS", "INDUSTRIES", "INDS", "RESOURCES", "SOLUTIONS", "SOL", "HEALTH", "HEALTHCARE", "MEDICAL", "PHARMACEUTICALS", "THERAPEUTICS", "AMER", "FINL", "TECH", "SVCS", "INDS", "NATL", "GENL", "HLTH", "HLTHCARE", "PHARMA", "SYS", "COMM", "ENTMT", "MFG", "INS", "DEV", "MGMT", "PPTYS", "PPTY", "RLTY", "PRODS", "PROD", "MTRS", "MTR", "DISTR", "EXCH", "EQUIP", "AUTO", "PETE", "ELECTRS", "INSTRS", "ASSOC", "LABS", "PMTS", "SEMICOND", "NETWKS", "NETWK", "INTERACTV", "ENTERPRISES", "BANCSHARES", "TRUST", "CORPORATION"]);

/**
 * A word both names share that could not belong to many issuers: at least
 * four letters, not a legal or generic word. "APPLE" counts; "INC" and
 * "AMERICAN" do not. Used only to corroborate a printed ticker (rule R1),
 * never to pick one.
 */
export function sharedDistinctiveWords(a: string, b: string): string[] {
  const words = (s: string) => new Set(assetNameKey(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)));
  const wb = words(b);
  return [...words(a)].filter((w) => wb.has(w));
}

export function sharesDistinctiveWord(a: string, b: string): string | null {
  const words = (s: string) => new Set(assetNameKey(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)));
  const wb = words(b);
  for (const w of words(a)) if (wb.has(w)) return w;
  return null;
}
