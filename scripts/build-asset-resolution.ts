/**
 * Build data/meta/asset-resolution.json: one entry per published row with
 * its instrument type, issuer label, and, for stocks and ETFs, the
 * resolved ticker and tier from lib/asset-resolution.
 *
 *   npx tsx scripts/build-asset-resolution.ts          (pnpm asset-resolution)
 *   npx tsx scripts/build-asset-resolution.ts --queue  also print the
 *                                                      person's queue: unresolved
 *                                                      names by row count
 *
 * Keyed by record id (lib/row-verification recordIdsFor), so the audited
 * official JSON and the decisions ledger are never touched. Reads only
 * the snapshots under data/meta/sources and the two curated files
 * (asset-dictionary.json, asset-exceptions.json). No network, no model.
 */
import { readdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import path from "path";
import { recordIdsFor } from "../lib/row-verification";
import { ASSET_RESOLUTION_PATH, defaultContext, resolveAsset, type AssetResolution, type AssetResolutionFile } from "../lib/asset-resolution";
import { readAssetSourcesManifest } from "./fetch-asset-sources";
import type { OfficialData } from "../lib/types";

const OFFICIALS_DIR = path.join(process.cwd(), "data", "officials");

function main() {
  const manifest = readAssetSourcesManifest();
  if (!manifest) throw new Error("no data/meta/sources/asset-sources.json; run pnpm fetch-asset-sources");
  const ctx = defaultContext();
  const rows: AssetResolutionFile["rows"] = {};
  const byType: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  const queue = new Map<string, { rows: number; officials: Set<string>; type: string; rule: string; candidates: Set<string>; sample: string }>();

  for (const file of readdirSync(OFFICIALS_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const official = JSON.parse(readFileSync(path.join(OFFICIALS_DIR, file), "utf-8")) as OfficialData;
    const ids = recordIdsFor(official.transactions);
    official.transactions.forEach((tx, i) => {
      const r: AssetResolution = resolveAsset(tx, ctx);
      rows[ids[i]] = { ...r, slug: official.slug };
      byType[r.instrumentType] = (byType[r.instrumentType] ?? 0) + 1;
      const tier = r.tier ?? (r.instrumentType === "common_stock" || r.instrumentType === "etf" ? "none" : "n/a");
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      byRule[r.rule] = (byRule[r.rule] ?? 0) + 1;
      if ((r.instrumentType === "common_stock" || r.instrumentType === "etf") && r.tier !== "T1") {
        const q = queue.get(r.nameKey) ?? { rows: 0, officials: new Set<string>(), type: r.instrumentType, rule: r.rule, candidates: new Set<string>(), sample: tx.description };
        q.rows += 1;
        q.officials.add(official.slug);
        for (const c of r.candidates) q.candidates.add(c);
        queue.set(r.nameKey, q);
      }
    });
  }

  const out: AssetResolutionFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/build-asset-resolution.ts",
    sources: Object.fromEntries(Object.entries(manifest.files).map(([f, v]) => [f, { sha256: v.sha256, fetchedAt: v.fetchedAt }])),
    summary: { rows: Object.keys(rows).length, byType, byTier, byRule },
    rows,
  };
  writeFileSync(`${ASSET_RESOLUTION_PATH}.tmp`, JSON.stringify(out, null, 2) + "\n");
  renameSync(`${ASSET_RESOLUTION_PATH}.tmp`, ASSET_RESOLUTION_PATH);

  console.log(`rows ${out.summary.rows}`);
  console.log("by type:"); for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${String(v).padStart(6)}`);
  console.log("by tier (stocks and ETFs):"); for (const [k, v] of Object.entries(byTier).sort()) console.log(`  ${k.padEnd(16)} ${String(v).padStart(6)}`);
  console.log("by rule:"); for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(48)} ${String(v).padStart(6)}`);
  const q = [...queue.entries()].sort((a, b) => b[1].rows - a[1].rows);
  const rowsInQueue = q.reduce((n, [, v]) => n + v.rows, 0);
  const atLeast = (n: number) => q.filter(([, v]) => v.rows >= n);
  console.log(`\nqueue: ${q.length} unresolved names over ${rowsInQueue} rows; names with 3+ rows: ${atLeast(3).length} (${atLeast(3).reduce((n, [, v]) => n + v.rows, 0)} rows); 2+: ${atLeast(2).length}`);
  if (process.argv.includes("--queue")) {
    for (const [key, v] of q.slice(0, 60)) console.log(`  ${String(v.rows).padStart(4)}  ${key.padEnd(44)} ${v.type.padEnd(13)} ${v.rule.padEnd(36)} ${[...v.candidates].join(",")}`);
  }
}

main();
