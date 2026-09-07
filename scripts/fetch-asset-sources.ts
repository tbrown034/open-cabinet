/**
 * Fetch the free reference lists the asset resolution lane reads, and
 * record what was fetched.
 *
 *   npx tsx scripts/fetch-asset-sources.ts            (pnpm fetch-asset-sources)
 *
 * Three files land under data/meta/sources/ with a manifest beside them
 * (asset-sources.json) holding each file's sha256, byte size and fetch
 * time. The resolution lane records the manifest's hashes on every
 * resolution it makes, so a later refetch can invalidate a resolution
 * instead of silently changing it. Nothing else on the site reads the
 * network for asset data.
 *
 *   nasdaqlisted.txt  Nasdaq-listed securities, pipe-delimited, daily.
 *                     Symbol, Security Name, ETF flag. License-free.
 *   otherlisted.txt   NYSE, NYSE American, NYSE Arca and regional listings,
 *                     same shape (ACT Symbol, Security Name, ETF flag).
 *   sec-company-tickers-exchange.json
 *                     SEC issuers with a CIK: name, ticker, exchange.
 *
 * Municipal and corporate bonds have no free identifier list (CUSIP is
 * licensed) and are deliberately not fetched; they are typed from the
 * printed text and never given a stock ticker.
 *
 * Be a good citizen: three requests, two seconds apart, a named agent.
 */
import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export const ASSET_SOURCES_DIR = path.join(process.cwd(), "data", "meta", "sources");
export const ASSET_SOURCES_MANIFEST = path.join(ASSET_SOURCES_DIR, "asset-sources.json");

const UA = "Mozilla/5.0 open-cabinet.org (journalism; trevorbrown.web@gmail.com)";

export const ASSET_SOURCE_FILES = [
  { file: "nasdaqlisted.txt", url: "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", kind: "nasdaq-listed" },
  { file: "otherlisted.txt", url: "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt", kind: "other-listed" },
  { file: "sec-company-tickers-exchange.json", url: "https://www.sec.gov/files/company_tickers_exchange.json", kind: "sec-company-tickers-exchange" },
] as const;

export interface AssetSourcesManifest {
  version: 1;
  fetchedAt: string;
  files: Record<string, { url: string; kind: string; sha256: string; bytes: number; fetchedAt: string }>;
}

export function readAssetSourcesManifest(file = ASSET_SOURCES_MANIFEST): AssetSourcesManifest | null {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as AssetSourcesManifest;
  } catch {
    return null;
  }
}

export function sha256Of(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Write the manifest for whatever is on disk now. Used by the fetch and,
 * with --manifest-only, to record files placed by hand. */
export function writeManifestFromDisk(fetchedAt: string): AssetSourcesManifest {
  const manifest: AssetSourcesManifest = { version: 1, fetchedAt, files: {} };
  for (const s of ASSET_SOURCE_FILES) {
    const buf = readFileSync(path.join(ASSET_SOURCES_DIR, s.file));
    manifest.files[s.file] = { url: s.url, kind: s.kind, sha256: sha256Of(buf), bytes: buf.length, fetchedAt };
  }
  writeFileSync(ASSET_SOURCES_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

async function main() {
  mkdirSync(ASSET_SOURCES_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();
  if (!process.argv.includes("--manifest-only")) {
    for (const s of ASSET_SOURCE_FILES) {
      const res = await fetch(s.url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${s.url}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000) throw new Error(`${s.file}: only ${buf.length} bytes; refusing to overwrite`);
      writeFileSync(path.join(ASSET_SOURCES_DIR, s.file), buf);
      console.log(`  ${s.file}: ${buf.length.toLocaleString("en-US")} bytes`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const m = writeManifestFromDisk(fetchedAt);
  for (const [f, v] of Object.entries(m.files)) console.log(`  ${f}: sha256 ${v.sha256.slice(0, 12)} (${v.bytes.toLocaleString("en-US")} bytes)`);
  console.log(`Manifest written: ${ASSET_SOURCES_MANIFEST}`);
}

if (process.argv[1] && /fetch-asset-sources\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
