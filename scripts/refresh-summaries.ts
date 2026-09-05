/**
 * Re-derive the `summary` line for one or more officials.
 *
 * Three modes:
 *   1. --candidate: sends the official's computed facts to Claude once and
 *      saves the result to data/meta/summary-candidates.json for review.
 *      Nothing the model writes goes into data/officials/ from this mode.
 *   2. --publish <id>: copies an approved candidate's exact text into the
 *      official file. No model call. Refuses if the facts changed since.
 *   3. --deterministic: builds the count sentence from the data with zero
 *      model calls and writes it. The fallback when no prose is approved.
 *
 * Whichever mode runs, the numbers come from the data file, not the model:
 * counts, buy/sell split, estimated totals (range midpoints), date range,
 * late-filed counts/rates, largest transactions, and most-traded assets are
 * all computed here and handed to Claude as facts. Claude only writes prose
 * around those facts — it is explicitly forbidden from inventing figures or
 * drawing compliance/ethics conclusions the data cannot support.
 *
 * Usage:
 *   npx tsx scripts/refresh-summaries.ts --candidate <slug1> [slug2 ...]
 *   npx tsx scripts/refresh-summaries.ts --publish <candidateId>
 *   npx tsx scripts/refresh-summaries.ts --deterministic [--dry-run] <slug1> ...
 *   npx tsx scripts/refresh-summaries.ts --list
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import {
  buildDeterministic,
  buildFactBlock,
  computeStats,
  factHash,
  unwitnessedNumbers,
  type Stats,
} from "../lib/summary-facts";
import {
  addCandidate,
  listCandidates,
  publishSummary,
} from "../lib/summary-review";

// ── CLAUDE GENERATION MODE ──
//
// The system prompt is FROZEN. It encodes the site's journalism standards and
// the methodology page's explicit promise that summaries do not make
// compliance/ethics conclusions. Do not weaken these rules — they exist to
// keep every generated summary defensible from the data file alone.
const SYSTEM_PROMPT = `You write one short factual summary for an executive-branch stock-trade tracker (Open Cabinet). The reader is a journalist. You are given only pre-computed facts about one official's disclosed transactions. Write 2 to 4 sentences of neutral, factual prose.

ALLOWED CLAIMS — only statements computable from the supplied facts:
- transaction counts (total, sales, purchases, exchanges)
- buy/sell split
- estimated dollar totals (these are midpoints of federally reported ranges — always call them "estimated")
- date range of the transactions
- late-filed counts and rates
- the largest transaction(s) and most-traded assets
- plainly factual, verifiable descriptions of specific named trades that appear in the facts

BANNED — never write any of these:
- compliance or ethics-agreement conclusions of ANY kind. NEVER write "consistent with ethics agreement", "consistent with ethics agreement divestitures", "divestiture", "in compliance", "fulfilling his ethics agreement", or any claim about whether the official met, missed, or satisfied an obligation. The site cannot support these from data alone.
- any number, fact, or characterization not present in the supplied facts. Do not invent tickers, dates, dollar figures, or context.
- editorializing or loaded words: "notably", "remarkably", "significantly", "raising questions", "raising concerns", "controversial", "suspicious", "aggressive", or similar.
- financial or legal advice.

FORMAT RULES:
- Numbers 1,000 and above MUST use thousands separators (write 3,000 not 3000; 7,699 not 7699).
- Dates in AP style exactly as supplied (e.g. "March 17, 2026"). NEVER use ISO format (2026-03-17).
- Use "percent" spelled out OR "%"; be consistent within the summary. Prefer "percent".
- Describe dollar totals as CUMULATIVE across all tracked filings. NEVER say "in the latest filing" or "in the latest tracked 278-T filing" — the totals span every filing on record.

STOCK ACT FRAMING (only if you mention lateness):
- A late-filing flag means OGE was notified of the trade more than 30 days after the official was notified of it. Federal law requires filing within 30 days of that notification and no more than 45 days after the transaction (5 U.S.C. 13105(l)).
- NEVER say "30 days after the trade occurred is the legal threshold." The 30-day clock runs from notification, not from the trade date.

Return ONLY the summary text — no preamble, no quotation marks, no trailing commentary.`;

async function generateWithClaude(
  s: Stats,
  d: any,
  extra?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set in .env.local");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write the summary from these facts:\n\n${buildFactBlock(s, d, extra)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }
  return textBlock.text.trim();
}

const MODEL = "claude-opus-4-8";

async function loadOfficial(slug: string) {
  const p = path.resolve(`data/officials/${slug}.json`);
  return { p, d: JSON.parse(await readFile(p, "utf-8")) };
}

/** --deterministic: template text, no model, written directly. */
async function writeDeterministic(slug: string, dryRun: boolean) {
  const { p, d } = await loadOfficial(slug);
  const s = computeStats(d);
  const text = buildDeterministic(s);
  console.log(`\n[${slug}]\n  was: ${d.summary || ""}\n  now: ${text}`);
  if (dryRun) return;
  const block = buildFactBlock(s, d);
  d.summary = text;
  d.summarySource = "template";
  d.summaryFactSha256 = factHash(block);
  delete d.summaryStaleSince;
  await writeFile(p, JSON.stringify(d, null, 2) + "\n");
}

/** --candidate: one paid call, saved to the review store, never to data/officials. */
async function writeCandidate(slug: string) {
  const { d } = await loadOfficial(slug);
  const s = computeStats(d);
  const text = await generateWithClaude(s, d);
  const c = addCandidate(d, text, MODEL);
  console.log(`\n[${slug}] candidate ${c.id}`);
  console.log(`  was: ${d.summary || ""}`);
  console.log(`  now: ${c.text}`);
  if (c.unwitnessed.length) {
    console.log(`  REJECT: numbers not in the facts: ${c.unwitnessed.join(", ")}`);
  } else {
    console.log(`  numbers check: clean. Publish with --publish ${c.id}`);
  }
}

/** --publish <id>: copies approved bytes into the official file. No model call. */
async function publish(candidateId: string, decidedBy: string) {
  const slug = listCandidates().find((c) => c.id === candidateId)?.slug;
  if (!slug) throw new Error(`no candidate ${candidateId}`);
  const { p, d } = await loadOfficial(slug);
  const result = publishSummary(d, candidateId, decidedBy);
  if (!result.ok || !result.official) throw new Error(`cannot publish: ${result.reason}`);
  await writeFile(p, JSON.stringify(result.official, null, 2) + "\n");
  console.log(`[${slug}] published ${candidateId}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const publishIdx = args.indexOf("--publish");
  // --dry-run only means something in deterministic mode. Refuse it with
  // --candidate (which pays) and --publish (which writes) rather than
  // silently ignoring it.
  if (dryRun && (args.includes("--candidate") || publishIdx >= 0)) {
    throw new Error(
      "--dry-run applies to --deterministic only. --candidate makes a paid call and --publish writes; neither has a dry run."
    );
  }
  if (publishIdx >= 0) {
    const id = args[publishIdx + 1];
    if (!id) throw new Error("--publish requires a candidate id");
    await publish(id, process.env.USER || "operator");
    return;
  }
  if (args.includes("--list")) {
    for (const c of listCandidates()) {
      console.log(`${c.status.padEnd(9)} ${c.id}  ${c.unwitnessed.length ? "UNWITNESSED " + c.unwitnessed.join(",") : "clean"}`);
      console.log(`  ${c.text}`);
    }
    return;
  }
  const slugs = args.filter((a) => !a.startsWith("--"));
  if (slugs.length === 0) {
    console.log(
      "Usage:\n  refresh-summaries.ts --deterministic [--dry-run] <slug> ...   template, no model\n  refresh-summaries.ts --candidate <slug> ...                     one paid call each, saved for review\n  refresh-summaries.ts --publish <candidateId>                    copy approved text, no model\n  refresh-summaries.ts --list"
    );
    process.exit(1);
  }
  if (args.includes("--candidate")) {
    for (const slug of slugs) await writeCandidate(slug);
    return;
  }
  if (args.includes("--deterministic")) {
    for (const slug of slugs) await writeDeterministic(slug, dryRun);
    return;
  }
  throw new Error(
    "A model-written summary is never written directly. Use --candidate, review, then --publish."
  );
}

export { computeStats, buildDeterministic, SYSTEM_PROMPT, type Stats };

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
