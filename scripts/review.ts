/**
 * The review queue from the command line.
 *
 *   npx tsx scripts/review.ts list
 *   npx tsx scripts/review.ts decide <id> "<what you decided>"
 *   npx tsx scripts/review.ts demo <slug> <pdf file name>
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
  if (cmd === "demo") {
    const [slug, pdfFile] = rest;
    if (!slug || !pdfFile) throw new Error("usage: review.ts demo <slug> <pdf file name>");
    await demo(slug, pdfFile);
    return;
  }
  console.log("usage: review.ts list | decide <id> \"<decision>\" | demo <slug> <pdf>");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
