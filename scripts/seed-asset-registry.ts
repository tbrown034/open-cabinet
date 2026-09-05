/**
 * Seed and refresh the asset registry from the SEC's company_tickers.json.
 *
 *   pnpm seed-assets            rebuild data/meta/asset-mappings.json and
 *                               data/meta/asset-mappings-pending.json from
 *                               the SEC snapshot and every published row
 *   pnpm seed-assets --check    exit 1 if a rerun would change either file
 *
 * What it does. Every distinct symbol stored on a published transaction is
 * looked up in the SEC snapshot at data/meta/sources/sec-company-tickers.json
 * (fetched once; the fetch time is recorded in the registry's meta block and
 * never changes until a person fetches again). A symbol the SEC knows gets a
 * registry entry with the SEC name and CIK. A symbol the SEC list does not
 * know (ETFs and mutual funds registered under the 1940 Act, OTC ADRs, filed
 * typos) goes to the pending file with the descriptions it was filed under.
 *
 * What it never does. It never calls a model, never edits data/officials,
 * and never overwrites a reviewed field: an entry whose review.status is
 * "reviewed" keeps its instrument type, display name and review block, and
 * only its filed variants are refreshed from the data.
 *
 * Instrument types here are inferred from names and are labeled as such.
 * A person turns "inferred" into "reviewed" by editing the entry and filling
 * the review block; that is Gate 2 curation work, not this script's.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import {
  ASSET_REGISTRY_PATH,
  ASSET_PENDING_PATH,
  SEC_SNAPSHOT_PATH,
  canonicalizeSymbol,
  type AssetEntry,
  type AssetRegistry,
  type InstrumentType,
  type PendingAsset,
  type PendingRegistry,
} from "../lib/asset-registry";
import { resolveTicker } from "../lib/assets";

const SEC_SOURCE_URL = "https://www.sec.gov/files/company_tickers.json";
// Recorded by hand when the snapshot was fetched (curl, Sep 5, 2026). If the
// snapshot is refetched, update this constant in the same commit.
const SEC_FETCHED_AT = "2026-09-05T23:27:18Z";

/**
 * Display names carried over from the override table that lived in
 * lib/data.ts. Each was checked against a filed description. They apply
 * only when no filed description names the asset.
 */
const CARRIED_DISPLAY_NAMES: Record<string, string> = {
  DODFX: "Dodge & Cox International Stock Fund",
  GAJPX: "Goldman Sachs Dynamic Municipal Income Fund",
  GGLPX: "Goldman Sachs High Yield Municipal Fund",
  SPMD: "SPDR Portfolio S&P 400 Mid Cap ETF",
  SPY: "SPDR S&P 500 ETF Trust",
};

/**
 * Filed symbols that are not the asset's symbol but were reviewed as the
 * same asset. Carried from lib/data.ts TICKER_ALIASES with its evidence.
 * Separator variants need no entry here: BRK-B is normalized by
 * canonicalizeSymbol(), and a compact share-class form (BRKB) is folded by
 * foldShareClass() below when the SEC knows the dotted form and the filed
 * description names the same company.
 */
const CARRIED_ALIASES: Record<string, { to: string; evidence: string }> = {
  APPL: { to: "AAPL", evidence: '"Apple Inc." filed with symbol APPL (Mullin, 6/24/2026)' },
};

interface SecRow {
  cik_str: number;
  ticker: string;
  title: string;
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function loadSecSnapshot(): { bySymbol: Map<string, SecRow>; sha: string; count: number } {
  const buf = readFileSync(SEC_SNAPSHOT_PATH);
  const rows = Object.values(JSON.parse(buf.toString("utf-8")) as Record<string, SecRow>);
  const bySymbol = new Map<string, SecRow>();
  for (const r of rows) {
    // The SEC writes share classes with a hyphen (BRK-B); the site uses a
    // dot (BRK.B). Key on the site's form so lookups need no translation.
    const key = r.ticker.replace(/-/g, ".").toUpperCase();
    if (!bySymbol.has(key)) bySymbol.set(key, r);
  }
  return { bySymbol, sha: sha256(buf), count: rows.length };
}

interface FiledUse {
  descriptions: Map<string, number>;
  filedSymbols: Set<string>;
  rows: number;
  officials: Set<string>;
}

/** Words that say nothing about which company a name belongs to. */
const NAME_STOP_WORDS = new Set([
  "corp", "corporation", "inc", "group", "holdings", "holding", "company", "companies", "trust", "fund",
  "international", "class", "common", "stock", "shares", "the", "ltd", "limited", "plc", "new", "com",
]);

/**
 * Whether any filed description shares a distinctive word with the SEC
 * title. Mechanical and recorded, never a verdict: "Lowe's Cos., Inc." and
 * "LOWES COMPANIES INC" disagree here and are the same company, while
 * "MSD Investment Corp. (BDC)" and "BELDEN INC." disagree and are not. A
 * person reads the list.
 */
function nameAgreement(secName: string, filedAs: string[]): "shares_a_word" | "no_shared_word" {
  const words = secName.toLowerCase().split(/\W+/).filter((w) => w.length >= 4 && !NAME_STOP_WORDS.has(w));
  const ok = filedAs.some((d) => {
    const dl = d.toLowerCase();
    return words.some((w) => dl.includes(w));
  });
  return ok ? "shares_a_word" : "no_shared_word";
}

/**
 * "BRKB" filed for "Berkshire Hathaway Inc." is BRK-B without its separator.
 * Fold a symbol the SEC does not list into the form with its last letter as
 * a share class only when the SEC lists that form and the filed description
 * shares a word of four or more letters with the SEC title. The fold is
 * recorded on the entry as an alias with that evidence.
 */
function foldShareClass(
  filed: string,
  description: string,
  sec: Map<string, SecRow>
): { symbol: string; evidence: string } | null {
  if (!/^[A-Z]{3,5}$/.test(filed) || sec.has(filed)) return null;
  const dotted = `${filed.slice(0, -1)}.${filed.slice(-1)}`;
  const row = sec.get(dotted);
  if (!row) return null;
  const titleWords = row.title.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
  const desc = description.toLowerCase();
  const shared = titleWords.find((w) => desc.includes(w));
  if (!shared) return null;
  return { symbol: dotted, evidence: `"${description}" filed as ${filed}; SEC lists ${row.ticker} "${row.title}"` };
}

function collectFiledUses(sec: Map<string, SecRow>): {
  uses: Map<string, FiledUse>;
  folded: Map<string, string>;
  withheld: number;
} {
  const dir = path.join(process.cwd(), "data", "officials");
  const uses = new Map<string, FiledUse>();
  const folded = new Map<string, string>();
  let withheld = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const o = JSON.parse(readFileSync(path.join(dir, file), "utf-8"));
    for (const tx of o.transactions ?? []) {
      if (!tx.ticker) continue;
      // Same read-time resolution the company pages use: a stored symbol
      // that is a name suffix or an ambiguous short symbol without its
      // issuer is withheld and never becomes a registry entry.
      const resolved = resolveTicker(tx.description, tx.ticker);
      if (!resolved.ticker) {
        withheld += 1;
        continue;
      }
      const filed = resolved.ticker;
      let symbol = CARRIED_ALIASES[filed]?.to ?? canonicalizeSymbol(filed);
      const fold = foldShareClass(symbol, tx.description, sec);
      if (fold) {
        symbol = fold.symbol;
        folded.set(filed, fold.evidence);
      }
      let u = uses.get(symbol);
      if (!u) {
        u = { descriptions: new Map(), filedSymbols: new Set(), rows: 0, officials: new Set() };
        uses.set(symbol, u);
      }
      u.descriptions.set(tx.description, (u.descriptions.get(tx.description) ?? 0) + 1);
      u.filedSymbols.add(filed);
      u.rows += 1;
      u.officials.add(o.slug);
    }
  }
  return { uses, folded, withheld };
}

function inferType(symbol: string, secName: string | null, descriptions: string[]): InstrumentType {
  const text = [secName ?? "", ...descriptions].join(" ");
  if (/\bETF\b/i.test(text)) return "etf";
  if (secName) {
    if (/\bTRUST\b/i.test(secName) && /\bETF|INDEX|SPDR/i.test(secName)) return "etf";
    return "common";
  }
  if (/^[A-Z]{5}$/.test(symbol) && symbol.endsWith("X") && /\bfund\b|\bportfolio\b|\bshares\b/i.test(text)) {
    return "mutual_fund";
  }
  if (/\bADR\b/i.test(text) || (/^[A-Z]{5}$/.test(symbol) && symbol.endsWith("Y"))) return "adr";
  if (/^[A-Z]{5}$/.test(symbol) && symbol.endsWith("F")) return "foreign_otc";
  return "unknown";
}

function sortedVariants(u: FiledUse): string[] {
  return [...u.descriptions.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([d]) => d);
}

function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as T) : null;
}

function buildRegistry(): { registry: AssetRegistry; pending: PendingRegistry } {
  const sec = loadSecSnapshot();
  const { uses, folded, withheld } = collectFiledUses(sec.bySymbol);
  const previous = readJson<AssetRegistry>(ASSET_REGISTRY_PATH);
  const previousPending = readJson<PendingRegistry>(ASSET_PENDING_PATH);

  const assets: Record<string, AssetEntry> = {};
  const pending: Record<string, PendingAsset> = {};

  for (const symbol of [...uses.keys()].sort()) {
    const u = uses.get(symbol)!;
    const filedAs = sortedVariants(u);
    const filedSymbols = [...u.filedSymbols].sort();
    const aliases = filedSymbols
      .filter((s) => CARRIED_ALIASES[s]?.to === symbol || folded.has(s))
      .map((s) => ({ filedSymbol: s, evidence: CARRIED_ALIASES[s]?.evidence ?? folded.get(s)! }));
    const row = sec.bySymbol.get(symbol);
    const prior = previous?.assets[symbol];
    const reviewed = prior?.review.status === "reviewed";

    if (row) {
      assets[symbol] = {
        symbol,
        secSymbol: row.ticker,
        secName: row.title,
        cik: row.cik_str,
        nameAgreement: nameAgreement(row.title, filedAs),
        instrumentType: reviewed ? prior!.instrumentType : inferType(symbol, row.title, filedAs),
        instrumentTypeSource: reviewed ? prior!.instrumentTypeSource : "inferred_from_name",
        displayName: reviewed ? prior!.displayName : (CARRIED_DISPLAY_NAMES[symbol] ?? null),
        filedAs,
        filedSymbols,
        aliases,
        rows: u.rows,
        officials: u.officials.size,
        source: { kind: "sec-company-tickers", url: SEC_SOURCE_URL, fetchedAt: SEC_FETCHED_AT },
        review: prior?.review ?? { status: "unreviewed", reviewer: null, reviewedAt: null, evidence: null },
      };
    } else {
      const priorPending = previousPending?.pending[symbol];
      pending[symbol] = {
        symbol,
        reason: "not in SEC company_tickers.json",
        instrumentType: priorPending?.review.status === "reviewed" ? priorPending.instrumentType : inferType(symbol, null, filedAs),
        instrumentTypeSource: priorPending?.review.status === "reviewed" ? priorPending.instrumentTypeSource : "inferred_from_name",
        displayName: priorPending?.review.status === "reviewed" ? priorPending.displayName : (CARRIED_DISPLAY_NAMES[symbol] ?? null),
        filedAs,
        filedSymbols,
        aliases,
        rows: u.rows,
        officials: u.officials.size,
        review: priorPending?.review ?? { status: "unreviewed", reviewer: null, reviewedAt: null, evidence: null },
      };
    }
  }

  const registry: AssetRegistry = {
    meta: {
      version: 1,
      generatedBy: "scripts/seed-asset-registry.ts",
      source: {
        kind: "sec-company-tickers",
        url: SEC_SOURCE_URL,
        fetchedAt: SEC_FETCHED_AT,
        snapshot: path.relative(process.cwd(), SEC_SNAPSHOT_PATH),
        snapshotSha256: sec.sha,
        snapshotEntries: sec.count,
      },
      symbolsInData: uses.size,
      withheldRows: withheld,
      entries: Object.keys(assets).length,
      pending: Object.keys(pending).length,
      noSharedWord: Object.values(assets).filter((a) => a.nameAgreement === "no_shared_word").length,
    },
    assets,
  };
  const pendingFile: PendingRegistry = {
    meta: {
      version: 1,
      generatedBy: "scripts/seed-asset-registry.ts",
      reason: "symbols filed on published rows that the SEC company list does not carry; identity awaits a person",
      entries: Object.keys(pending).length,
    },
    pending,
  };
  return { registry, pending: pendingFile };
}

function serialize(v: unknown): string {
  return JSON.stringify(v, null, 2) + "\n";
}

{
  const check = process.argv.includes("--check");
  const { registry, pending } = buildRegistry();
  const outRegistry = serialize(registry);
  const outPending = serialize(pending);
  if (check) {
    const same =
      existsSync(ASSET_REGISTRY_PATH) &&
      existsSync(ASSET_PENDING_PATH) &&
      readFileSync(ASSET_REGISTRY_PATH, "utf-8") === outRegistry &&
      readFileSync(ASSET_PENDING_PATH, "utf-8") === outPending;
    console.log(same ? "asset registry is current" : "asset registry is stale: run pnpm seed-assets");
    process.exit(same ? 0 : 1);
  }
  writeFileSync(ASSET_REGISTRY_PATH, outRegistry);
  writeFileSync(ASSET_PENDING_PATH, outPending);
  const types = (o: Record<string, { instrumentType: string }>) =>
    Object.values(o).reduce<Record<string, number>>((m, e) => ((m[e.instrumentType] = (m[e.instrumentType] ?? 0) + 1), m), {});
  console.log(
    `symbols in data: ${registry.meta.symbolsInData}; SEC-known: ${registry.meta.entries} ${JSON.stringify(types(registry.assets))}; pending: ${registry.meta.pending} ${JSON.stringify(types(pending.pending))}`
  );
}
