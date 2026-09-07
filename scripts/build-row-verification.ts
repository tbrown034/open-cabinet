/**
 * Write data/meta/row-verification.json: one verification state per
 * published row, derived from the cross-check log, the OCR lane's row
 * alignment, the second-model lane and human decisions.
 *
 *   pnpm row-verification            rebuild the file
 *   pnpm row-verification --check    exit 1 if a rebuild would change it
 *
 * Reads only. Never calls a model, never edits an official file.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { readCrosscheckLog, type CrosscheckEntry } from "../lib/crosscheck-log";
import { findParseRecord } from "../lib/parse-cache";
import { CHECKER_VERSION } from "./text-layer-crosscheck";
import { EXTRACTION_PROMPT, SYSTEM_PROMPT, PARSER_VERSION, DEFAULT_MODEL } from "./parse-pdf.js";
import { promptHash } from "../lib/parse-cache";
import {
  ROW_VERIFICATION_PATH,
  deriveRowVerification,
  readReviewDecisions,
  type RowVerification,
  type RowVerificationFile,
  type VerificationState,
} from "../lib/row-verification";
import { readSecondReadLog } from "../lib/second-read";
import { readGrokAuditLog } from "../lib/grok-audit";
import { extractTextLayerRows } from "./text-layer-crosscheck";
import type { OfficialData } from "../lib/types";

const OFFICIALS_DIR = path.resolve("data/officials");
const PDF_DIR = path.resolve("data/pdfs");
const PROMPT_SHA256 = promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT);

function pdfFilenameFromUrl(url: string): string {
  return decodeURIComponent(url.split("/").pop() || "filing.pdf");
}

function main() {
  const log = readCrosscheckLog();
  if (!log) throw new Error("no cross-check log; run pnpm crosscheck-sweep first");
  const decisions = readReviewDecisions();
  const secondRead = readSecondReadLog();
  // A read by a person or by the Claude Code session looking at page
  // images (scripts/session-read.ts): a second independent read, merged
  // with the second model's verdicts. Agreement from either counts;
  // a dispute from either disputes.
  const sessionPath = path.resolve("data/meta/session-read-log.json");
  const sessionRead: { filings: Record<string, { candidateSha256: string; agreedIndexes: number[]; disputedIndexes: number[] }> } | null =
    existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, "utf-8")) : null;
  const audit = readGrokAuditLog();
  const rows: Record<string, RowVerification> = {};

  for (const file of readdirSync(OFFICIALS_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const official = JSON.parse(readFileSync(path.join(OFFICIALS_DIR, file), "utf-8")) as OfficialData;
    const entriesByUrl = new Map<string, CrosscheckEntry>();
    for (const e of log.entries) if (e.slug === official.slug && e.sourceUrl) entriesByUrl.set(e.sourceUrl, e);

    // Parse records are needed only where a per-row lane verdict exists.
    const parseRecordByUrl = new Map<string, Array<{ description: string; type: string; date: string | null; amount: string | null; lateFilingFlag?: boolean }>>();
    const model2ByUrl = new Map<string, { agreedIndexes: Set<number>; disputedIndexes: Set<number> }>();
    const model2OnlyByUrl = new Map<string, { agreedIndexes: Set<number>; disputedIndexes: Set<number>; unreadIndexes: Set<number> }>();
    const sessionByUrl = new Map<string, { agreedIndexes: Set<number>; disputedIndexes: Set<number>; unreadIndexes: Set<number> }>();
    const auditByUrl = new Map<string, { confirmed: Set<number>; disputed: Set<number>; notFound: Set<number> }>();
    const nameReadsByUrl = new Map<string, Array<Map<number, string>>>();
    for (const [url, e] of entriesByUrl) {
      const second = secondRead?.filings[url];
      const audited = audit?.filings[url];
      const pdfPath = path.join(PDF_DIR, pdfFilenameFromUrl(url));
      if (!existsSync(pdfPath) || !e.pdfSha256) continue;
      const record = findParseRecord(pdfPath, {
        pdfSha256: e.pdfSha256, sourceUrl: url, parserVersion: PARSER_VERSION, promptSha256: PROMPT_SHA256, model: DEFAULT_MODEL,
      });
      if (!record) continue;
      parseRecordByUrl.set(url, record.transactions as Array<{ description: string; type: string; date: string | null; amount: string | null; lateFilingFlag?: boolean }>);
      const agreed = new Set<number>();
      const disputed = new Set<number>();
      let anySecond = false;
      const nameReads: Array<Map<number, string>> = [];
      // The text lane's own reading of each name, positionally, when the
      // text layer agreed with the read row for row.
      if (e.state === "checked_tuple_agreement") {
        const ext = extractTextLayerRows(pdfPath);
        if (ext.kind === "rows") {
          const m = new Map<number, string>();
          const placeholders = new Set(ext.placeholderRows);
          let k = 0;
          for (const r of ext.rows) {
            if (placeholders.has(r.rowNumber)) continue;
            if (r.description) m.set(k, r.description);
            k += 1;
          }
          nameReads.push(m);
        }
      }
      for (const src of [second, sessionRead?.filings[url]]) {
        if (!src || src.candidateSha256 !== e.candidateSha256) continue;
        anySecond = true;
        const paired = (src as { pairedDescriptions?: Record<string, string> }).pairedDescriptions;
        if (paired) nameReads.push(new Map(Object.entries(paired).map(([i, d]) => [Number(i), d])));
        for (const i of src.agreedIndexes) agreed.add(i);
        for (const i of src.disputedIndexes) disputed.add(i);
        const own = { agreedIndexes: new Set(src.agreedIndexes), disputedIndexes: new Set(src.disputedIndexes), unreadIndexes: new Set((src as { unreadIndexes?: number[] }).unreadIndexes ?? []) };
        if (src === second) model2OnlyByUrl.set(url, own); else sessionByUrl.set(url, own);
      }
      for (const i of disputed) agreed.delete(i);
      if (anySecond) model2ByUrl.set(url, { agreedIndexes: agreed, disputedIndexes: disputed });
      if (audited && audited.candidateSha256 === e.candidateSha256) {
        auditByUrl.set(url, { confirmed: new Set(audited.confirmedIndexes), disputed: new Set(audited.disputedIndexes), notFound: new Set(audited.notFoundIndexes) });
      }
      if (nameReads.length) nameReadsByUrl.set(url, nameReads);
    }

    for (const v of deriveRowVerification({
      slug: official.slug,
      transactions: official.transactions,
      entriesByUrl,
      parseRecordByUrl,
      model2ByUrl,
      model2OnlyByUrl,
      sessionByUrl,
      auditByUrl,
      nameReadsByUrl,
      decisionsById: decisions,
      filingDateByUrl: new Map((official.sourceFilings ?? []).flatMap((f) => (f.url ? [[f.url, f.date] as [string, string]] : []))),
    })) {
      rows[v.id] = v;
    }
  }

  // A decision whose row no longer exists as published is either
  // superseded (the row was patched again, or removed) or a sign that a
  // patch changed a row without a new decision. List them so a person
  // sees them; never silently drop them. (Codex, Sep 6.)
  const orphans = [...decisions.values()].filter((d) => !rows[d.recordId]);
  if (orphans.length) {
    console.log(`
${orphans.length} decision(s) match no published row (superseded or removed):`);
    for (const d of orphans) console.log(`  ${d.slug} ${d.decision} ${d.recordId}: ${d.evidence.slice(0, 90)}`);
  }

  const byState = { checked: 0, human_verified: 0, deterministic_agree: 0, two_models_agree: 0, audit_only: 0, single_read: 0, implausible: 0, disputed: 0 } as Record<VerificationState, number>;
  const byScore = { "0": 0, "1": 0, "2": 0, "3": 0 };
  for (const v of Object.values(rows)) {
    byState[v.state] += 1;
    byScore[String(v.score) as "0" | "1" | "2" | "3"] += 1;
  }
  const out: RowVerificationFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/build-row-verification.ts",
    checkerVersion: CHECKER_VERSION,
    summary: { rows: Object.keys(rows).length, byState, byScore },
    rows,
  };
  const text = JSON.stringify(out, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const current = existsSync(ROW_VERIFICATION_PATH) ? readFileSync(ROW_VERIFICATION_PATH, "utf-8") : "";
    const strip = (t: string) => t.replace(/"generatedAt": "[^"]*"/, "");
    const same = strip(current) === strip(text);
    console.log(same ? "row verification is current" : "row verification is stale: run pnpm row-verification");
    process.exit(same ? 0 : 1);
  }
  writeFileSync(ROW_VERIFICATION_PATH, text);
  console.log(`rows ${out.summary.rows}`);
  for (const [k, n] of Object.entries(byState)) console.log(`  ${k.padEnd(20)} ${String(n).padStart(6)}`);
  console.log(`  by score: ${JSON.stringify(byScore)}`);
}

main();
