/**
 * The asset queue from the command line: the names the resolution lane
 * could not tie to a company, most rows first, and the two decisions a
 * person can record.
 *
 *   npx tsx scripts/asset-decide.ts queue [--min 3] [--limit 60]
 *   npx tsx scripts/asset-decide.ts accept "<name key>" <SYMBOL> "<evidence: what you checked>"
 *   npx tsx scripts/asset-decide.ts reject "<name key>" "<reason>"
 *   npx tsx scripts/asset-decide.ts accept-batch <recommendations.csv> [--confidence High] [--by trevor]
 *       every row of the CSV (nameKey,symbol,confidence,reason) at the given
 *       confidence or better is accepted through the same checks as
 *       "accept"; rows that fail a check are listed and skipped. Meant for
 *       a list a person has read and approved as a whole.
 *
 * accept writes data/meta/asset-dictionary.json (rule R2, top tier); the
 * symbol must be a common-stock or ETF listing in the Nasdaq directory,
 * and the listing's name must share a distinctive word with the printed
 * name or the evidence must say why not. reject writes
 * data/meta/asset-exceptions.json (rule R0). Both take effect on the next
 * pnpm asset-resolution. Nothing here edits an official file.
 */
import { readFileSync, writeFileSync } from "fs";
import { ASSET_DICTIONARY_PATH, ASSET_EXCEPTIONS_PATH, readAssetResolution, readDictionary, readExceptions, type AssetDictionaryFile, type AssetExceptionsFile } from "../lib/asset-resolution";
import { canonicalListedSymbol, loadAssetReference, sharesDistinctiveWord } from "../lib/asset-reference";

export interface QueueLine {
  nameKey: string;
  rows: number;
  officials: string[];
  type: string;
  rule: string;
  candidates: string[];
  sample: string;
}

/** The unresolved stock and ETF names, most rows first. */
export function assetQueue(min = 1): QueueLine[] {
  const file = readAssetResolution();
  if (!file) return [];
  const byKey = new Map<string, QueueLine>();
  for (const r of Object.values(file.rows)) {
    if ((r.instrumentType !== "common_stock" && r.instrumentType !== "etf") || r.tier === "T1") continue;
    if (r.rule.startsWith("R0")) continue; // already decided: never resolve
    const q = byKey.get(r.nameKey) ?? { nameKey: r.nameKey, rows: 0, officials: [], type: r.instrumentType, rule: r.rule, candidates: [], sample: "" };
    q.rows += 1;
    if (!q.officials.includes(r.slug)) q.officials.push(r.slug);
    for (const c of r.candidates) if (!q.candidates.includes(c)) q.candidates.push(c);
    byKey.set(r.nameKey, q);
  }
  return [...byKey.values()].filter((q) => q.rows >= min).sort((a, b) => b.rows - a.rows || a.nameKey.localeCompare(b.nameKey));
}

export function acceptName(nameKey: string, symbol: string, evidence: string, decidedBy: string): { ok: true; note: string } | { ok: false; why: string } {
  const key = nameKey.trim().toUpperCase();
  const sym = canonicalListedSymbol(symbol);
  const ref = loadAssetReference();
  const listed = ref.listedBySymbol.get(sym);
  if (!listed) return { ok: false, why: `${sym} is not in the Nasdaq directory; a symbol the lists do not carry cannot be accepted` };
  if (listed.kind !== "common" && listed.kind !== "etf") return { ok: false, why: `${sym} is listed as "${listed.name}" (${listed.kind}), not a stock or ETF` };
  const word = sharesDistinctiveWord(key, listed.name);
  if (!word && evidence.trim().length < 20) return { ok: false, why: `"${key}" shares no distinctive word with "${listed.name}"; give evidence of at least 20 characters saying why they are the same issuer` };
  const dict = readDictionary();
  if (dict.has(key)) return { ok: false, why: `"${key}" already maps to ${dict.get(key)!.ticker}` };
  const file: AssetDictionaryFile = { version: 1, entries: [...dict.values(), { nameKey: key, ticker: sym, displayName: listed.name.replace(/\s+-\s+.*$/, ""), decidedBy, decidedAt: new Date().toISOString(), evidence: evidence.trim() }] };
  writeFileSync(ASSET_DICTIONARY_PATH, JSON.stringify(file, null, 2) + "\n");
  return { ok: true, note: `"${key}" -> ${sym} ("${listed.name}")${word ? `, shares "${word}"` : ""}` };
}

export function rejectName(nameKey: string, reason: string, decidedBy: string): { ok: true } | { ok: false; why: string } {
  const key = nameKey.trim().toUpperCase();
  if (reason.trim().length < 10) return { ok: false, why: "give a reason of at least 10 characters" };
  const ex = readExceptions();
  if (ex.has(key)) return { ok: false, why: `"${key}" is already an exception` };
  const file: AssetExceptionsFile = { version: 1, entries: [...ex.values(), { nameKey: key, reason: reason.trim(), decidedBy, decidedAt: new Date().toISOString() }] };
  writeFileSync(ASSET_EXCEPTIONS_PATH, JSON.stringify(file, null, 2) + "\n");
  return { ok: true };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const who = process.env.USER || "unknown";
  if (cmd === "queue") {
    const min = Number(rest[rest.indexOf("--min") + 1]) || 1;
    const limit = Number(rest[rest.indexOf("--limit") + 1]) || 60;
    const q = assetQueue(min);
    console.log(`${q.length} names with ${min}+ rows (${q.reduce((n, x) => n + x.rows, 0)} rows)`);
    for (const l of q.slice(0, limit)) console.log(`${String(l.rows).padStart(4)}  ${l.nameKey.padEnd(42)} ${l.type.padEnd(12)} ${l.rule.padEnd(40)} ${l.candidates.join(",")}`);
    return;
  }
  if (cmd === "accept") {
    const [key, sym, ...ev] = rest;
    const r = acceptName(key, sym, ev.join(" "), who);
    if (!r.ok) { console.error(r.why); process.exit(1); }
    console.log(`accepted ${r.note}. Run pnpm asset-resolution to apply.`);
    return;
  }
  if (cmd === "accept-batch") {
    const file = rest[0];
    const minConf = rest[rest.indexOf("--confidence") + 1] || "High";
    const by = rest.indexOf("--by") > 0 ? rest[rest.indexOf("--by") + 1] : who;
    const rank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
    const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(",");
    const col = (name: string) => header.indexOf(name);
    let ok = 0, skipped = 0;
    for (const line of lines.slice(1)) {
      // CSV with quoted reasons: split on commas outside quotes.
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
      const key = cells[col("nameKey")], sym = cells[col("symbol")], conf = cells[col("confidence")], reason = cells[col("reason")];
      if (!sym || (rank[conf] ?? 0) < (rank[minConf] ?? 3)) { skipped++; continue; }
      const r = acceptName(key, sym, `${conf}: ${reason}`, by);
      if (r.ok) ok++; else { skipped++; console.log(`  skip ${key}: ${r.why}`); }
    }
    console.log(`accepted ${ok}, skipped ${skipped}. Run pnpm asset-resolution to apply.`);
    return;
  }
  if (cmd === "reject") {
    const [key, ...why] = rest;
    const r = rejectName(key, why.join(" "), who);
    if (!r.ok) { console.error(r.why); process.exit(1); }
    console.log(`rejected "${key.toUpperCase()}". Run pnpm asset-resolution to apply.`);
    return;
  }
  console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 16).join("\n"));
}

if (process.argv[1] && /asset-decide\.ts$/.test(process.argv[1])) main();
