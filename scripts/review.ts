/**
 * The review queue from the command line.
 *
 *   npx tsx scripts/review.ts list
 *   npx tsx scripts/review.ts decide <id> "<what you decided>"
 *   npx tsx scripts/review.ts demo <slug> <pdf file name>
 *   npx tsx scripts/review.ts rows <slug> [text]        list rows with their record ids and state
 *   npx tsx scripts/review.ts row <slug> <recordId> confirmed|rejected "<evidence: page, printed row, what you saw>"
 *
 * "row" records a person's decision on one published row in
 * data/review/decisions.json. A confirmed row scores 3 (human_verified) the
 * next time pnpm row-verification runs. A rejected row stays disputed until
 * an approved data patch changes it; the decision records the evidence.
 *
 * "demo" runs the text-layer comparison on one published filing against
 * its parse record, exactly as the ingest's check stage would, opens the
 * review item and sends the email. It reads only; nothing is re-parsed,
 * no model is called, and no data file changes. Use it to see what a
 * person receives when a gate trips, for example:
 *
 *   npx tsx scripts/review.ts demo kennedy-robert-f Robert-F-Kennedy-Jr-05.09.2025-278T.pdf
 */
import { readFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import { crossCheckParsedFiling } from "./text-layer-crosscheck";
import { findParseRecord, promptHash, sha256File } from "../lib/parse-cache";
import { EXTRACTION_PROMPT, SYSTEM_PROMPT, PARSER_VERSION, DEFAULT_MODEL } from "./parse-pdf.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { REVIEW_DECISIONS_PATH, recordIdsFor, verificationForOfficial, type ReviewDecision } from "../lib/row-verification";
import {
  decideReview,
  listOpenReviews,
  openReviewItem,
  problemsFromCrosscheck,
  renderReviewRequest,
} from "../lib/review-queue";

dotenv.config({ path: ".env.local" });

async function demo(slug: string, pdfFile: string) {
  const official = JSON.parse(readFileSync(path.resolve(`data/officials/${slug}.json`), "utf-8"));
  const filing = (official.sourceFilings ?? []).find(
    (f: { url: string | null }) => f.url && decodeURIComponent(f.url.split("/").pop() || "") === pdfFile
  );
  const pdfPath = path.resolve("data/pdfs", pdfFile);
  const record = findParseRecord(pdfPath, {
    pdfSha256: sha256File(pdfPath),
    sourceUrl: filing?.url ?? "",
    parserVersion: PARSER_VERSION,
    promptSha256: promptHash(SYSTEM_PROMPT, EXTRACTION_PROMPT),
    model: DEFAULT_MODEL,
  });
  if (!record) throw new Error(`no parse record on disk for ${pdfFile}`);
  const rows = record.transactions as Array<{ description: string; type: string; date: string; amount: string | null; lateFilingFlag?: boolean }>;
  const check = crossCheckParsedFiling(pdfPath, rows);
  console.log(`comparison: ${check.status}`);
  if (check.status !== "mismatch") {
    console.log("The lanes agree on this filing; there is nothing to review. Pick one that disagrees.");
    return;
  }
  const item = await openReviewItem({
    kind: "lane_disagreement",
    slug,
    officialName: official.name.split(",").reverse().join(" ").trim(),
    filing: { url: filing?.url ?? null, pdfFile, date: filing?.date ? String(filing.date).slice(0, 10) : null },
    problems: problemsFromCrosscheck(pdfPath, check.problems, rows),
    holding: `every row of ${pdfFile}; nothing from it would publish until this is decided`,
  });
  const { subject, body } = renderReviewRequest(item);
  console.log(`\n${subject}\n\n${body}\n`);
  console.log(item.emailSentAt ? `Email sent ${item.emailSentAt}. Queue id ${item.id}.` : `Email not sent (no RESEND_API_KEY?). Queue id ${item.id}.`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "list") {
    const open = listOpenReviews();
    if (!open.length) console.log("No open review items.");
    for (const i of open) console.log(`${i.id}  ${i.kind}  ${i.officialName}  ${i.problems.length} problem(s)`);
    return;
  }
  if (cmd === "decide") {
    const [id, decision] = rest;
    if (!id || !decision) throw new Error('usage: review.ts decide <id> "<decision>"');
    const item = decideReview(id, decision, process.env.USER || "operator");
    if (!item) throw new Error(`no open item ${id}`);
    console.log(`decided ${id} by ${item.decidedBy}: ${decision}`);
    return;
  }
  if (cmd === "rows") {
    const [slug, text] = rest;
    if (!slug) throw new Error("usage: review.ts rows <slug> [text]");
    const official = JSON.parse(readFileSync(path.resolve(`data/officials/${slug}.json`), "utf-8"));
    const ids = recordIdsFor(official.transactions);
    const states = verificationForOfficial(slug, official.transactions);
    official.transactions.forEach((t: { description: string; type: string; date: string; amount: string | null }, i: number) => {
      if (text && !t.description.toLowerCase().includes(text.toLowerCase())) return;
      console.log(`${ids[i]}  ${states[i]?.score ?? "-"} ${(states[i]?.state ?? "unknown").padEnd(19)} ${t.date} ${t.type.padEnd(14)} ${(t.amount ?? "unknown").padEnd(22)} ${t.description}`);
    });
    return;
  }
  if (cmd === "row") {
    const [slug, recordId, decision, evidence] = rest;
    if (!slug || !recordId || !["confirmed", "rejected"].includes(decision ?? "") || !evidence) {
      throw new Error('usage: review.ts row <slug> <recordId> confirmed|rejected "<evidence>"');
    }
    const official = JSON.parse(readFileSync(path.resolve(`data/officials/${slug}.json`), "utf-8"));
    if (!recordIdsFor(official.transactions).includes(recordId)) throw new Error(`no row ${recordId} for ${slug}`);
    const file = REVIEW_DECISIONS_PATH;
    const current: { decisions: ReviewDecision[] } = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : { decisions: [] };
    const entry: ReviewDecision = {
      recordId, slug, decision: decision as "confirmed" | "rejected", evidence,
      decidedBy: process.env.USER || "operator", decidedAt: new Date().toISOString(),
    };
    current.decisions = [...current.decisions.filter((d) => d.recordId !== recordId), entry];
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(current, null, 2) + "\n");
    console.log(`recorded ${decision} for ${recordId} by ${entry.decidedBy}. Run pnpm row-verification to apply.`);
    return;
  }
  if (cmd === "demo") {
    const [slug, pdfFile] = rest;
    if (!slug || !pdfFile) throw new Error("usage: review.ts demo <slug> <pdf file name>");
    await demo(slug, pdfFile);
    return;
  }
  console.log("usage: review.ts list | decide <id> \"<decision>\" | demo <slug> <pdf> | rows <slug> [text] | row <slug> <recordId> confirmed|rejected \"<evidence>\"");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
