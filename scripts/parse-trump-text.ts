/**
 * Text-based parser for the Trump 2026-05-14 Part 2 filing (113 pages,
 * scanned + OCR'd). The Anthropic PDF endpoint drops the connection
 * on this file regardless of size, so we extract OCR text per page
 * and send that to Claude as plain text in chunks.
 *
 * Output is appended into trump-donald-j.json via the same dedupe
 * key as the rest of the ingest pipeline.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const TRUMP_JSON = path.resolve("data/officials/trump-donald-j.json");
const PDF_PATH = path.resolve("data/pdfs/Trump, Donald J.-05.08.2026-278T(2).pdf");
const CACHE_PATH = PDF_PATH.replace(/\.pdf$/i, ".text-parsed.json");
// Anthropic's HTTPS connection drops when a single non-streaming response
// generates very long outputs (~5+ min wall time). We keep chunks small so
// each call returns under ~60 sec, AND we stream so the connection stays
// warm regardless. Average 30 txns per page * 4 pages ≈ 120 txns ≈ 6 KB JSON.
const PAGES_PER_CHUNK = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ParsedTransaction {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  lateFilingFlag: boolean;
  confidence: number;
}

const PROMPT = `You are parsing pre-extracted OCR text from a U.S. Office of Government Ethics Form 278-T (Periodic Transaction Report). The OCR is messy: dates may be missing slashes (e.g. "3/212026" means "3/21/2026"; "2/10/2028" is OCR for "2/10/2026"). Asset names may have stray punctuation. Amount ranges are mostly intact.

Extract every transaction. Return ONLY a JSON array of objects with these fields:
- description: full asset name as written (clean up obvious OCR noise like trailing punctuation, but do not invent words)
- ticker: stock ticker if present in parentheses like "(AAPL)", otherwise null
- type: exactly one of "Sale", "Purchase", "Sale (Partial)", "Sale (Full)", "Exchange"
- date: transaction date in YYYY-MM-DD format. The cover date of this filing is 2026-05-13. If OCR shows a year like 2028 or 2027 for transactions clearly from early 2026, correct it to 2026. Never invent a date — if truly unparseable, use "2026-01-01" with confidence 0.3.
- amount: exact amount range string from this list:
  "$1,001-$15,000"
  "$15,001-$50,000"
  "$50,001-$100,000"
  "$100,001-$250,000"
  "$250,001-$500,000"
  "$500,001-$1,000,000"
  "$1,000,001-$5,000,000"
  "$5,000,001-$25,000,000"
  "$25,000,001-$50,000,000"
  "Over $50,000,000"
- lateFilingFlag: true if the row indicates "Notification Received Over 30 Days Ago" = "Yes", false otherwise
- confidence: 0.0-1.0 (use < 0.8 if OCR was clearly bad)

Skip header lines, "File's Name", "Donald J Trump", page numbers, and OGE form boilerplate. Only return real transaction rows.

Return ONLY the JSON array. No markdown, no preamble.`;

async function extractPagesText(): Promise<string[]> {
  const buf = await readFile(PDF_PATH);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  // pdf-parse returns full text; split by form-feed or page markers. The
  // library appends "\n\n" between pages in our experience. Easier path:
  // re-parse page by page via the `pages` getter if available.
  if ((result as any).pages && Array.isArray((result as any).pages)) {
    return (result as any).pages.map((p: any) => p.text || "");
  }
  // Fallback: split by the "-- N of M --" markers we saw in the OCR
  const parts = result.text.split(/--\s*\d+\s*of\s*\d+\s*--/);
  return parts;
}

async function parseChunk(client: Anthropic, text: string, chunkLabel: string): Promise<ParsedTransaction[]> {
  console.log(`  ${chunkLabel}: ${text.length} chars`);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // Stream the response so the connection stays warm. Anthropic's
      // non-streaming endpoint occasionally drops sockets on long outputs.
      const stream = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        stream: true,
        messages: [
          {
            role: "user",
            content: PROMPT + "\n\n--- OCR TEXT ---\n" + text,
          },
        ],
      });
      let raw = "";
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          raw += event.delta.text;
        } else if (event.type === "message_start") {
          inputTokens = event.message.usage?.input_tokens || 0;
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens || outputTokens;
        }
      }
      raw = raw.trim();
      if (raw.startsWith("```")) {
        raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const arr = tolerantJsonArrayParse(raw);
      console.log(`    → ${arr.length} txns (in=${inputTokens} out=${outputTokens})`);
      return arr;
    } catch (err: any) {
      console.warn(`    attempt ${attempt} failed: ${err.message}`);
      if (attempt === 4) throw err;
      await sleep(3000 * attempt);
    }
  }
  return [];
}

/**
 * Parse a JSON array even if the response was truncated mid-object.
 * Walks character-by-character tracking brace depth + string state, and
 * cuts the input at the last complete object before retrying JSON.parse.
 */
function tolerantJsonArrayParse(raw: string): ParsedTransaction[] {
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }
  // Find the opening [
  const start = raw.indexOf("[");
  if (start < 0) throw new Error("no array in response");
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastObjectEnd = -1;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (c === "}" && depth === 1) {
        lastObjectEnd = i;
      }
    }
  }
  if (lastObjectEnd < 0) throw new Error("no complete objects in truncated response");
  const repaired = raw.slice(start, lastObjectEnd + 1) + "]";
  return JSON.parse(repaired);
}

function txKey(tx: { description: string; date: string; type: string; amount: string }): string {
  return `${tx.description.trim().toLowerCase()}|${tx.date}|${tx.type.toLowerCase()}|${tx.amount}`;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const client = new Anthropic({ apiKey });

  console.log("\n=== Trump Part 2 text-based parser ===\n");
  console.log("Extracting OCR text from 113-page PDF...");
  const pages = await extractPagesText();
  console.log(`  ${pages.length} page-sections extracted`);

  // Chunk into PAGES_PER_CHUNK page groups
  const chunks: { label: string; text: string }[] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_CHUNK) {
    const slice = pages.slice(i, i + PAGES_PER_CHUNK);
    chunks.push({
      label: `pages ${i + 1}-${Math.min(i + PAGES_PER_CHUNK, pages.length)}`,
      text: slice.join("\n\n--- next page ---\n\n"),
    });
  }
  console.log(`  → ${chunks.length} chunks of up to ${PAGES_PER_CHUNK} pages\n`);

  const all: ParsedTransaction[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    console.log(`[${i + 1}/${chunks.length}] ${c.label}`);
    const txs = await parseChunk(client, c.text, c.label);
    all.push(...txs);
    if (i < chunks.length - 1) await sleep(1500);
  }

  // Cache raw text-parse output for transparency / re-runs
  await writeFile(CACHE_PATH, JSON.stringify({ count: all.length, transactions: all }, null, 2));
  console.log(`\nCached raw text-parse output → ${CACHE_PATH}`);

  // Merge into Trump JSON
  const trump = JSON.parse(await readFile(TRUMP_JSON, "utf-8"));
  const existing = new Set(trump.transactions.map(txKey));
  const added: any[] = [];
  for (const tx of all) {
    const k = txKey(tx);
    if (existing.has(k)) continue;
    existing.add(k);
    const { confidence, ...rest } = tx;
    added.push(rest);
  }

  const merged = [...added, ...trump.transactions];
  merged.sort((a: any, b: any) => {
    const d = (b.date || "").localeCompare(a.date || "");
    return d !== 0 ? d : (a.description || "").localeCompare(b.description || "");
  });

  trump.transactions = merged;
  trump.mostRecentFilingDate = "2026-05-14";
  await writeFile(TRUMP_JSON, JSON.stringify(trump, null, 2) + "\n");

  console.log(`\nMerged: +${added.length} new txns into trump-donald-j.json (total ${merged.length})`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
