/**
 * Generate the editorial lede for the pending subscriber digest.
 *
 * Builds the current digest draft (same selection the admin panel uses),
 * drafts a short factual lede with Claude, and writes it to
 * data/meta/digest-lede.json keyed to the digest's idempotency key. The email
 * template includes the lede only when the key still matches at send time, so
 * a stale lede can never attach to a different filing set. The admin reviews
 * it on /admin before sending. This script sends NO email.
 *
 * Usage: npx tsx scripts/generate-digest-lede.ts
 */
import { writeFile } from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const MODEL = "claude-opus-4-8";

async function main() {
  const { buildDigest, digestIdempotencyKey } = await import("../lib/digest");
  const digest = await buildDigest();
  if (digest.empty) {
    console.log("Digest is empty — nothing to summarize.");
    return;
  }
  const sendKey = digestIdempotencyKey(digest.filingUrls);

  // Each official's site summary carries curated context the raw trade rows
  // lack (e.g. a filing-extension notice that reframes late flags) — include
  // it so the lede can't accidentally strip that context.
  const { getAllOfficials } = await import("../lib/data");
  const officials = await getAllOfficials();
  const summaryBySlug = new Map(officials.map((o) => [o.slug, o.summary]));

  const itemSummaries = digest.items
    .map((item) => {
      const trades = item.trades
        .map(
          (t) =>
            `    - ${t.description}${t.ticker ? ` (${t.ticker})` : ""}: ${t.type}, ${t.amount}, trade date ${t.date}${t.lateFilingFlag ? ", flagged late" : ""}`
        )
        .join("\n");
      const context = summaryBySlug.get(item.slug);
      return `- ${item.name} (${item.title}, ${item.agency}): ${item.newCount} new trades disclosed.${context ? `\n  Site summary (curated context — respect any caveats in it): ${context}` : ""}\n  Sample of most recent trades:\n${trades}`;
    })
    .join("\n");

  const prompt = `You are writing the one-paragraph lede for Open Cabinet's subscriber email digest. Open Cabinet is a nonpartisan journalism site tracking executive branch stock-trade disclosures filed with the U.S. Office of Government Ethics.

New filings in this digest:
${itemSummaries}

Write 2-4 sentences summarizing what is new, in a factual newspaper voice. Rules:
- Lead with the most newsworthy fact (largest trades, a new official appearing for the first time, notable patterns like all-sales or late flags).
- Only state facts present in the data above. Never speculate about motive or legality.
- Dollar amounts are ranges as filed; say "up to" or the range, never exact figures.
- "Flagged late" means the filer's own certification that notification came more than 30 days before filing; if you mention lateness, keep that framing and do not call it a violation.
- No emojis, no exclamation points, no editorializing adjectives. AP style dates.
- Plain text only, no markdown.

Return only the lede paragraph.`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });

  const lede = response.content
    .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!lede) throw new Error("Model returned no text");

  const out = {
    sendKey,
    lede,
    generated: new Date().toISOString().slice(0, 10),
    model: MODEL,
  };
  const outPath = path.resolve("data/meta/digest-lede.json");
  await writeFile(outPath, JSON.stringify(out, null, 2) + "\n");

  console.log(`\nLede written to ${outPath} (sendKey ${sendKey.slice(0, 12)}...)\n`);
  console.log("--- Review before sending ---\n");
  console.log(lede);
  console.log("\nIt will appear at the top of the digest. Re-run this script to regenerate; delete the file to drop the lede.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
