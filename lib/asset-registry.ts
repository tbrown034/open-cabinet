/**
 * The asset registry: what each symbol on the site is, according to the SEC,
 * and what the filings called it.
 *
 * Two files, both written by scripts/seed-asset-registry.ts and read here:
 *
 *   data/meta/asset-mappings.json          one entry per symbol the SEC's
 *                                          company_tickers.json knows: SEC
 *                                          name, CIK, instrument type, every
 *                                          description it was filed under,
 *                                          the fetch date, a review block
 *   data/meta/asset-mappings-pending.json  symbols the SEC list does not
 *                                          carry (ETFs and mutual funds under
 *                                          the 1940 Act, OTC ADRs, typos),
 *                                          with the same filed variants and a
 *                                          review block, awaiting a person
 *
 * Nothing here calls a network or a model. The SEC snapshot was fetched once
 * and its hash and fetch time are recorded in the registry's meta block.
 *
 * Every symbol getTradesByTicker() produces must be in one file or the other;
 * lib/asset-registry.test.ts fails otherwise. A symbol in neither file is a
 * symbol nobody has looked at, and it does not get a company page unnoticed.
 */
import { readFileSync } from "fs";
import path from "path";

export const ASSET_REGISTRY_PATH = path.join(process.cwd(), "data", "meta", "asset-mappings.json");
export const ASSET_PENDING_PATH = path.join(process.cwd(), "data", "meta", "asset-mappings-pending.json");
export const SEC_SNAPSHOT_PATH = path.join(process.cwd(), "data", "meta", "sources", "sec-company-tickers.json");

export type InstrumentType = "common" | "etf" | "mutual_fund" | "adr" | "foreign_otc" | "unknown";

export interface ReviewBlock {
  status: "unreviewed" | "reviewed";
  reviewer: string | null;
  reviewedAt: string | null;
  evidence: string | null;
}

export interface FiledAlias {
  /** A symbol as printed on a filing that a person accepted as this asset. */
  filedSymbol: string;
  evidence: string;
}

interface AssetCommon {
  symbol: string;
  instrumentType: InstrumentType;
  instrumentTypeSource: "inferred_from_name" | "reviewed";
  /** A name to show when no filed description names the asset. */
  displayName: string | null;
  /** Every distinct description filed under this symbol, most frequent first. */
  filedAs: string[];
  /** Every symbol string the filings used for it (separator variants, typos). */
  filedSymbols: string[];
  aliases: FiledAlias[];
  rows: number;
  officials: number;
  review: ReviewBlock;
}

export interface AssetEntry extends AssetCommon {
  /** The SEC's spelling, with a hyphen for a share class (BRK-B). */
  secSymbol: string;
  secName: string;
  cik: number;
  /** Mechanical: does any filed description share a distinctive word with
   * the SEC title? "no_shared_word" is a review signal, not a verdict. */
  nameAgreement: "shares_a_word" | "no_shared_word";
  source: { kind: "sec-company-tickers"; url: string; fetchedAt: string };
}

export interface PendingAsset extends AssetCommon {
  reason: string;
}

export interface AssetRegistry {
  meta: {
    version: 1;
    generatedBy: string;
    source: {
      kind: "sec-company-tickers";
      url: string;
      fetchedAt: string;
      snapshot: string;
      snapshotSha256: string;
      snapshotEntries: number;
    };
    symbolsInData: number;
    /** Stored symbols the read-time resolver withholds; not in either file. */
    withheldRows: number;
    entries: number;
    pending: number;
    noSharedWord: number;
  };
  assets: Record<string, AssetEntry>;
}

export interface PendingRegistry {
  meta: { version: 1; generatedBy: string; reason: string; entries: number };
  pending: Record<string, PendingAsset>;
}

/**
 * The site's form of a symbol: capitals, share class after a dot. The SEC
 * writes BRK-B, brokerages print BRK.B or BRKB; all three are the same
 * listing, so a separator is never a reason for two company pages.
 */
export function canonicalizeSymbol(filed: string): string {
  // Only the separator is normalized here. A compact form (BRKB) is folded
  // into BRK.B by the seed script, with evidence, and reaches the loader as
  // a recorded alias; resolveSymbol() reads that alias index.
  return filed.toUpperCase().replace(/-/g, ".");
}

export type AssetLookup =
  | { kind: "sec"; entry: AssetEntry }
  | { kind: "pending"; entry: PendingAsset }
  | { kind: "unknown" };

interface LoadedRegistry {
  registry: AssetRegistry;
  pending: PendingRegistry;
  /** filed symbol (any variant) -> canonical symbol */
  aliasIndex: Map<string, string>;
}

let cache: LoadedRegistry | null = null;

export function loadAssetRegistry(): LoadedRegistry {
  if (cache) return cache;
  const registry = JSON.parse(readFileSync(ASSET_REGISTRY_PATH, "utf-8")) as AssetRegistry;
  const pending = JSON.parse(readFileSync(ASSET_PENDING_PATH, "utf-8")) as PendingRegistry;
  const aliasIndex = new Map<string, string>();
  for (const entry of [...Object.values(registry.assets), ...Object.values(pending.pending)]) {
    aliasIndex.set(entry.symbol, entry.symbol);
    for (const s of entry.filedSymbols) aliasIndex.set(s, entry.symbol);
    for (const a of entry.aliases) aliasIndex.set(a.filedSymbol, entry.symbol);
  }
  cache = { registry, pending, aliasIndex };
  return cache;
}

/** For tests that rewrite the files. */
export function resetAssetRegistryCache(): void {
  cache = null;
}

/**
 * The canonical symbol for a filed one: a reviewed alias (APPL -> AAPL), a
 * separator variant (BRK-B, BRKB -> BRK.B), or the symbol itself.
 */
export function resolveSymbol(filed: string): string {
  const { aliasIndex } = loadAssetRegistry();
  const upper = filed.toUpperCase();
  return aliasIndex.get(upper) ?? aliasIndex.get(canonicalizeSymbol(upper)) ?? canonicalizeSymbol(upper);
}

export function lookupAsset(symbol: string): AssetLookup {
  const { registry, pending } = loadAssetRegistry();
  const canonical = resolveSymbol(symbol);
  const sec = registry.assets[canonical];
  if (sec) return { kind: "sec", entry: sec };
  const p = pending.pending[canonical];
  if (p) return { kind: "pending", entry: p };
  return { kind: "unknown" };
}

/** Fallback display name for a symbol whose filings print only the symbol. */
export function registryDisplayName(symbol: string): string | null {
  const found = lookupAsset(symbol);
  if (found.kind === "unknown") return null;
  return found.entry.displayName ?? (found.kind === "sec" ? found.entry.secName : null);
}

export const INSTRUMENT_TYPE_LABEL: Record<InstrumentType, string> = {
  common: "common stock",
  etf: "exchange-traded fund",
  mutual_fund: "mutual fund",
  adr: "American depositary receipt",
  foreign_otc: "foreign listing traded over the counter",
  unknown: "instrument type not yet reviewed",
};
