/**
 * The asset resolution lane: what a row is, and, for listed stocks and
 * ETFs, which issuer it is, at a confidence tier.
 *
 * Trevor's rules (Sep 6, 2026): a wrong ticker is worse than a missing
 * one; "APL" must never become Apple; "Apple Hospitality REIT" must never
 * become Apple Inc; bonds get a type and an issuer label, never a stock
 * ticker; no model guesses; anything below the top tier shows the printed
 * name only.
 *
 * Order of work per row:
 *   1. classifyInstrument (lib/instrument-type): type from the text. Only
 *      common_stock and etf continue to the ticker rules.
 *   2. Rules, first that fires wins:
 *        R0 exceptions   a curated never-resolve name            -> none
 *        R1 filed ticker the printed symbol passes resolveTicker,
 *                        is a listed common/ETF symbol, and the
 *                        listing's name shares a distinctive word  -> T1
 *        R2 dictionary   a person mapped this normalized name     -> T1
 *        R3 exact, both  key equals one Nasdaq name and one SEC
 *                        name, same symbol, unique in both         -> T1
 *        R4 exact, one   unique in one list only                   -> T2
 *        R5 prefix       a truncated broker name (>= 12 chars) is
 *                        a prefix of exactly one listed name       -> T2
 *        R6 filed ticker passes resolveTicker, no list confirms    -> T2
 *        else                                                      -> none
 *   Only T1 may show a ticker publicly. T2 is a candidate for a person.
 *
 * Nothing here reads a network or calls a model. Every resolution records
 * the rule and the evidence so the admin page and the tests can show why.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { resolveTicker } from "./assets";
import { assetNameKey, normalizeAssetName, printedShareClass } from "./asset-normalize";
import { canonicalListedSymbol, flatKey, loadAssetReference, sharesDistinctiveWord, type AssetReference } from "./asset-reference";
import { classifyInstrument, type InstrumentType } from "./instrument-type";

export type ResolutionTier = "T1" | "T2" | null;

export interface AssetResolution {
  instrumentType: InstrumentType;
  issuerLabel: string | null;
  /** Normalized printed name, the key a dictionary or exception entry uses. */
  nameKey: string;
  resolvedTicker: string | null;
  tier: ResolutionTier;
  rule: string;
  evidence: string[];
  /** Candidate symbol(s) at T2 or below, for the person's queue. Never shown publicly. */
  candidates: string[];
}

export interface DictionaryEntry {
  nameKey: string;
  ticker: string;
  displayName?: string;
  decidedBy: string;
  decidedAt: string;
  evidence: string;
}
export interface ExceptionEntry {
  nameKey: string;
  reason: string;
  decidedBy: string;
  decidedAt: string;
}
export interface AssetDictionaryFile { version: 1; entries: DictionaryEntry[] }
export interface AssetExceptionsFile { version: 1; entries: ExceptionEntry[] }

export const ASSET_DICTIONARY_PATH = path.join(process.cwd(), "data", "meta", "asset-dictionary.json");
export const ASSET_EXCEPTIONS_PATH = path.join(process.cwd(), "data", "meta", "asset-exceptions.json");
export const ASSET_RESOLUTION_PATH = path.join(process.cwd(), "data", "meta", "asset-resolution.json");

export function readDictionary(file = ASSET_DICTIONARY_PATH): Map<string, DictionaryEntry> {
  if (!existsSync(file)) return new Map();
  const f = JSON.parse(readFileSync(file, "utf-8")) as AssetDictionaryFile;
  return new Map(f.entries.map((e) => [e.nameKey, e]));
}
export function readExceptions(file = ASSET_EXCEPTIONS_PATH): Map<string, ExceptionEntry> {
  if (!existsSync(file)) return new Map();
  const f = JSON.parse(readFileSync(file, "utf-8")) as AssetExceptionsFile;
  return new Map(f.entries.map((e) => [e.nameKey, e]));
}

export interface ResolutionContext {
  ref: AssetReference;
  dictionary: Map<string, DictionaryEntry>;
  exceptions: Map<string, ExceptionEntry>;
}

export function defaultContext(): ResolutionContext {
  return { ref: loadAssetReference(), dictionary: readDictionary(), exceptions: readExceptions() };
}

const TICKER_TYPES = new Set<InstrumentType>(["common_stock", "etf"]);

/** Words that name a fund family or a fund's structure, not which fund. */
const ETF_GENERIC = new Set(["VANGUARD", "ISHARES", "SPDR", "SCHWAB", "INVESCO", "FIDELITY", "STATE", "STREET", "STRT", "SELECT", "SECTOR", "INDEX", "FUND", "FD", "ETF", "TRUST", "TR", "SERIES", "PORTFOLIO", "SHARES", "CLASS", "CORE", "TOTAL", "MARKET", "US", "USA", "MORNINGSTAR", "FTSE", "MSCI", "CRSP", "BLOOMBERG", "INTL", "THE", "AND", "OF", "STOCK", "EQUITY"]);
/** The words of an ETF name that say which fund it is, digits included ("1000" in Russell 1000). */
export function etfDistinctiveWords(key: string): string[] {
  return key.split(" ").filter((w) => w.length >= 2 && !ETF_GENERIC.has(w));
}

export function resolveAsset(
  row: { description: string; ticker: string | null | undefined },
  ctx: ResolutionContext
): AssetResolution {
  // The printed symbol first: a five-letter X symbol in parentheses marks a
  // mutual fund even when the name says nothing, so typing needs it.
  const filed = resolveTicker(row.description, row.ticker ?? null, { fillFromParenthetical: true });
  const call = classifyInstrument(row.description, filed.ticker ?? row.ticker);
  const nameKey = assetNameKey(row.description);
  // A broker sometimes prints the symbol inside the name ("BANK OF AMERICA
  // BAC"); that trailing symbol is not part of the name. Only a symbol of
  // three or more letters is stripped: "AT T" ends in T, the company's
  // symbol, and is the whole name.
  const strippedKey = filed.ticker && filed.ticker.length >= 3 && nameKey.endsWith(" " + filed.ticker) ? nameKey.slice(0, -filed.ticker.length - 1) : nameKey;
  const base = { instrumentType: call.type, issuerLabel: call.issuerLabel, nameKey };
  if (!TICKER_TYPES.has(call.type)) {
    return { ...base, resolvedTicker: null, tier: null, rule: `typed ${call.type}: no stock ticker`, evidence: [call.rule], candidates: [] };
  }

  // R0
  const ex = ctx.exceptions.get(nameKey);
  if (ex) return { ...base, resolvedTicker: null, tier: null, rule: "R0 exception", evidence: [`never resolve: ${ex.reason} (${ex.decidedBy}, ${ex.decidedAt.slice(0, 10)})`], candidates: [] };

  // R1 / R6: a printed symbol
  if (filed.ticker) {
    const sym = canonicalListedSymbol(filed.ticker);
    const listed = ctx.ref.listedBySymbol.get(sym);
    const sec = ctx.ref.secBySymbol.get(sym);
    const listedOk = listed && (listed.kind === "common" || listed.kind === "etf");
    // Corroboration is an exact name: the printed name's key equals the
    // listing's key or the SEC issuer's key (spaces ignored). A shared
    // word is not enough: "META FINL (META)" shares "META" with Meta
    // Platforms and is a different company (Codex, Sep 7).
    const sameName = (k: string | undefined) => !!k && !!nameKey && (k === nameKey || flatKey(k) === flatKey(nameKey) || k === strippedKey || flatKey(k) === flatKey(strippedKey));
    const exact = listedOk && (sameName(listed!.key) || sameName(sec?.key));
    if (listedOk && exact) {
      return { ...base, resolvedTicker: sym, tier: "T1", rule: "R1 filed ticker, corroborated", evidence: [`printed symbol ${sym} (${filed.source})`, `listed as "${listed!.name}" on ${listed!.exchange}`, `printed name matches the listing exactly`], candidates: [sym] };
    }
    // An ETF's printed name is its legal name ("Vanguard Tax-Exempt Bond
    // Index Fund ETF"), the directory's is its marketing name ("Vanguard
    // Tax-Exempt Bond ETF"). For a row typed ETF whose printed symbol is
    // an ETF listing, two shared distinctive words (the family plus one
    // more: "VANGUARD" and "EXEMPT") are the corroboration. Stocks get no
    // such allowance.
    // Family and structural words (VANGUARD, SELECT SECTOR, INDEX, FUND)
    // do not distinguish one fund from another; the words that do ("TAX
    // EXEMPT", "RUSSELL 1000", "ENERGY", "BOND") must every one appear in
    // the listing. "Energy Select Sector SPDR" printed with XLF fails on
    // "ENERGY" (Grok, Sep 7).
    if (listedOk && listed!.kind === "etf" && call.type === "etf") {
      const printedWords = etfDistinctiveWords(nameKey);
      const listedWords = new Set(etfDistinctiveWords(listed!.key));
      if (printedWords.length >= 1 && printedWords.every((w) => listedWords.has(w))) {
        return { ...base, resolvedTicker: sym, tier: "T1", rule: "R1 filed ETF symbol, every distinctive word in the listing", evidence: [`printed symbol ${sym} (${filed.source})`, `listed as "${listed!.name}" on ${listed!.exchange}`, `distinctive words ${printedWords.map((w) => `"${w}"`).join(", ")} all in the listing`], candidates: [sym] };
      }
    }
    const word = listedOk ? sharesDistinctiveWord(row.description, listed!.name) : null;
    if (listed && !listedOk) {
      return { ...base, resolvedTicker: null, tier: null, rule: "R1 refused: symbol names a non-stock listing", evidence: [`printed symbol ${sym} is listed as "${listed.name}" (${listed.kind})`], candidates: [sym] };
    }
    return { ...base, resolvedTicker: null, tier: "T2", rule: "R6 filed ticker, uncorroborated", evidence: [`printed symbol ${sym} (${filed.source})`, listed ? `listed as "${listed.name}"${word ? ` (shares "${word}" but the names are not the same)` : " (no name match)"}` : "not in the Nasdaq directory", sec ? `SEC: "${sec.name}"` : "not in the SEC issuer list"], candidates: [sym] };
  }

  // R2
  const dict = ctx.dictionary.get(nameKey);
  if (dict) {
    const sym = canonicalListedSymbol(dict.ticker);
    // A dictionary entry names one listing. If the row prints a share
    // class the listing does not carry, the entry does not cover it.
    const cls = printedShareClass(row.description);
    const listing = ctx.ref.listedBySymbol.get(sym);
    const listingClass = listing ? (listing.name.match(/\bClass ([A-C])\b/i)?.[1] ?? (listing.symbol.match(/\.([A-C])$/)?.[1] ?? null)) : null;
    if (cls && listingClass && cls.toUpperCase() !== listingClass.toUpperCase()) {
      return { ...base, resolvedTicker: null, tier: "T2", rule: "R2 dictionary, class differs", evidence: [`dictionary maps this name to ${sym} (class ${listingClass}); the row prints class ${cls}`], candidates: [sym] };
    }
    return { ...base, resolvedTicker: sym, tier: "T1", rule: "R2 dictionary", evidence: [`${dict.decidedBy} on ${dict.decidedAt.slice(0, 10)}: ${dict.evidence}`], candidates: [sym] };
  }

  // R3 / R4: exact key
  if (!nameKey) return { ...base, resolvedTicker: null, tier: null, rule: "empty name", evidence: [], candidates: [] };
  // Exact key, then exact key with spaces removed ("JPMORGAN CHASE" and
  // "JP MORGAN CHASE" are one name). Still an equality, not a distance.
  const wantKind = call.type === "etf" ? "etf" : "common";
  let listedHits = (ctx.ref.listedByKey.get(nameKey) ?? []).filter((l) => l.kind === wantKind);
  let secHits = ctx.ref.secByKey.get(nameKey) ?? [];
  if (listedHits.length === 0 && secHits.length === 0) {
    listedHits = (ctx.ref.listedByFlatKey.get(flatKey(nameKey)) ?? []).filter((l) => l.kind === wantKind);
    secHits = ctx.ref.secByFlatKey.get(flatKey(nameKey)) ?? [];
  } else if (listedHits.length === 0) {
    listedHits = (ctx.ref.listedByFlatKey.get(flatKey(nameKey)) ?? []).filter((l) => l.kind === wantKind);
  } else if (secHits.length === 0) {
    secHits = ctx.ref.secByFlatKey.get(flatKey(nameKey)) ?? [];
  }
  const listedSyms = [...new Set(listedHits.map((l) => l.symbol))];
  let secSyms = [...new Set(secHits.map((s) => s.ticker).filter(Boolean))];
  // The SEC lists every symbol an issuer has, including OTC variants the
  // Nasdaq directory does not carry. When the directory has exactly one
  // common/ETF listing for this name and the SEC's set includes it, the
  // two lists agree on that symbol; the extras are the same issuer.
  if (listedSyms.length === 1 && secSyms.length > 1 && secSyms.includes(listedSyms[0])) secSyms = [listedSyms[0]];
  if (listedSyms.length === 1 && secSyms.length === 1) {
    const cls = printedShareClass(row.description);
    const only = listedHits[0];
    const onlyClass = only.name.match(/\bClass ([A-C])\b/i)?.[1] ?? only.symbol.match(/\.([A-C])$/)?.[1] ?? null;
    if (cls && onlyClass && cls.toUpperCase() !== onlyClass.toUpperCase()) {
      return { ...base, resolvedTicker: null, tier: null, rule: "class printed is not the listed class", evidence: [`the row prints class ${cls}; the only listing of this name is "${only.name}" (${only.symbol})`], candidates: [only.symbol] };
    }
    if (listedSyms[0] === secSyms[0]) {
      return { ...base, resolvedTicker: listedSyms[0], tier: "T1", rule: "R3 exact name, both lists agree", evidence: [`"${normalizeAssetName(row.description)}" = "${listedHits[0].name}" (${listedHits[0].exchange})`, `SEC: "${secHits[0].name}" CIK ${secHits[0].cik}`], candidates: [listedSyms[0]] };
    }
    return { ...base, resolvedTicker: null, tier: null, rule: "R3 conflict: lists disagree", evidence: [`Nasdaq says ${listedSyms[0]}, SEC says ${secSyms[0]}`], candidates: [listedSyms[0], secSyms[0]] };
  }
  if (listedSyms.length > 1 || secSyms.length > 1) {
    // Class shares: "Berkshire Hathaway Inc Cl B" or "Alphabet Inc Cl A".
    // When the broker printed the class and exactly one listing of that
    // name carries it, that is an exact match, not a guess. With no class
    // printed, several classes stay ambiguous for a person.
    const cls = printedShareClass(row.description);
    if (cls && listedSyms.length > 1) {
      const carries = (l: { name: string; symbol: string }, c: string) => new RegExp(`\\bClass ${c}\\b`, "i").test(l.name) || l.symbol.endsWith(`.${c}`);
      const withClass = listedHits.filter((l) => carries(l, cls));
      const others = listedHits.filter((l) => !/\bClass [A-C]\b/i.test(l.name) && !/\.[A-C]$/.test(l.symbol));
      if (withClass.length === 1 && others.length === 0) {
        const sym = withClass[0].symbol;
        const secOk = secSyms.length === 0 || secSyms.includes(sym) || secHits.some((h) => h.key === nameKey);
        if (secOk) return { ...base, resolvedTicker: sym, tier: "T1", rule: "R3 exact name + printed share class", evidence: [`"${normalizeAssetName(row.description)}" printed class ${cls}`, `only "${withClass[0].name}" (${sym}) carries class ${cls}`, secHits.length ? `SEC: "${secHits[0].name}"` : "SEC: same issuer name"], candidates: [sym] };
      }
    }
    return { ...base, resolvedTicker: null, tier: null, rule: "ambiguous: name maps to several symbols", evidence: [`Nasdaq: ${listedSyms.join(", ") || "none"}; SEC: ${secSyms.join(", ") || "none"}`], candidates: [...new Set([...listedSyms, ...secSyms])] };
  }
  if (listedSyms.length === 1 || secSyms.length === 1) {
    const sym = listedSyms[0] ?? secSyms[0];
    const src = listedSyms.length ? `Nasdaq "${listedHits[0].name}"` : `SEC "${secHits[0].name}"`;
    return { ...base, resolvedTicker: null, tier: "T2", rule: "R4 exact name, one list only", evidence: [`${src} -> ${sym}; the other list has no exact match`], candidates: [sym] };
  }

  // R5: truncated broker name as a unique prefix of one listed name
  if (nameKey.length >= 12) {
    const prefixHits: string[] = [];
    // Brokers cut names at 24 characters, mid-word ("FIDELITY NATL
    // INFORMATIO"), so the prefix test has no word boundary.
    for (const [key, arr] of ctx.ref.listedByKey) {
      if (key !== nameKey && key.startsWith(nameKey) && arr.some((l) => l.kind === "common" || l.kind === "etf")) for (const l of arr) if (!prefixHits.includes(l.symbol)) prefixHits.push(l.symbol);
      if (prefixHits.length > 1) break;
    }
    if (prefixHits.length === 1) {
      const l = ctx.ref.listedBySymbol.get(prefixHits[0])!;
      return { ...base, resolvedTicker: null, tier: "T2", rule: "R5 truncated name is a unique prefix", evidence: [`"${nameKey}" is a prefix of "${l.name}" (${l.symbol}) and of no other listing`], candidates: [prefixHits[0]] };
    }
  }
  return { ...base, resolvedTicker: null, tier: null, rule: "no exact match", evidence: [], candidates: [] };
}

/** The sidecar the builder writes and the site reads. */
export interface AssetResolutionFile {
  version: 1;
  generatedAt: string;
  generatedBy: string;
  sources: Record<string, { sha256: string; fetchedAt: string }>;
  summary: { rows: number; byType: Record<string, number>; byTier: Record<string, number>; byRule: Record<string, number> };
  rows: Record<string, AssetResolution & { slug: string }>;
}

let fileCache: AssetResolutionFile | null | undefined;
export function readAssetResolution(file = ASSET_RESOLUTION_PATH): AssetResolutionFile | null {
  if (fileCache !== undefined) return fileCache;
  fileCache = existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as AssetResolutionFile) : null;
  return fileCache;
}
