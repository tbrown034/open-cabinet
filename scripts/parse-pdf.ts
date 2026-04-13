/**
 * PDF Parser — Extracts transaction data from OGE 278-T filing PDFs.
 *
 * Uses Claude API (Haiku for cost efficiency) to read PDF table rows
 * and output structured JSON. Each transaction gets a confidence score.
 *
 * How it works:
 * 1. Read the PDF file from disk
 * 2. Base64-encode it (Claude's API accepts PDFs as base64 documents)
 * 3. Send to Claude with a precise extraction prompt
 * 4. Parse the JSON response into our Transaction format
 * 5. Return structured data with confidence scores and token usage
 *
 * Cost: ~$0.02-0.06 per PDF with Haiku (1-3 page filings)
 *
 * Usage:
 *   npx tsx scripts/parse-pdf.ts <path-to-pdf>
 *   npx tsx scripts/parse-pdf.ts /tmp/cabinet-pdfs/some-filing.pdf
 */
import { readFile, writeFile } from "fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// ── TYPES ──

interface ParsedTransaction {
  description: string;
  ticker: string | null;
  type: "Sale" | "Purchase" | "Sale (Partial)" | "Sale (Full)" | "Exchange";
  date: string; // YYYY-MM-DD
  amount: string; // Exact OGE range string
  lateFilingFlag: boolean;
  confidence: number; // 0.0-1.0
}

interface ParseResult {
  transactions: ParsedTransaction[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  model: string;
  pdfPath: string;
}

// ── PARSING PROMPT ──
// This prompt is the heart of the parser. It tells Claude exactly what
// to extract and in what format. Precision here = accuracy in output.

const EXTRACTION_PROMPT = `You are parsing a U.S. Office of Government Ethics Form 278-T (Periodic Transaction Report).

Extract every transaction from the table. For each transaction, return a JSON object with these fields:

- description: the full asset name as written (e.g., "BANK OF AMERICA CORPORATION CONV PFD SER L 7.250%")
- ticker: the stock ticker if present in parentheses like "(AAPL)", otherwise null
- type: exactly one of "Sale", "Purchase", "Sale (Partial)", "Sale (Full)", "Exchange"
- date: the transaction date in YYYY-MM-DD format
- amount: the exact amount range string from this list:
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
- lateFilingFlag: true if "Notification Received Over 30 Days Ago" column shows "Yes" or a checkmark, false otherwise
- confidence: your confidence in this extraction (0.0 to 1.0). Use below 0.8 if:
  - The PDF scan quality is poor
  - The text is partially obscured
  - The amount range is ambiguous
  - The date format is non-standard

Rules:
- Extract ALL transactions, even if the table spans multiple pages
- If the amount says "Value Not Readily Ascertainable", use "$1,001-$15,000" and set confidence to 0.5
- If a ticker is embedded in the description like "Apple, Inc. (AAPL)", extract "AAPL" as the ticker
- Dates should be in YYYY-MM-DD format regardless of how they appear in the PDF
- Transaction type must be EXACTLY one of the five valid types listed above

Return ONLY a JSON array of transaction objects. No markdown, no explanation, no wrapping.`;

// ── PARSER ──

async function parsePdf(pdfPath: string): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY must be set in .env.local");
  }

  const client = new Anthropic({ apiKey });

  // Read and base64-encode the PDF
  const pdfBuffer = await readFile(pdfPath);
  const pdfBase64 = pdfBuffer.toString("base64");

  console.log(
    `  Sending PDF to Claude API (${(pdfBuffer.length / 1024).toFixed(0)} KB)...`
  );

  // Send to Claude with the PDF as a document
  // claude-haiku-4-5 is the alias (preferred over date-suffixed version)
  // Haiku pricing: $1/M input, $5/M output — ~$0.05-0.15 per PDF
  const model = "claude-haiku-4-5";
  const response = await client.messages.create({
    model,
    max_tokens: 16000, // Trump has 389 transactions — needs room
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  // Extract the text response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  // Parse the JSON response
  let rawText = textBlock.text.trim();

  // Strip markdown code fences if present
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: ParsedTransaction[];
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    console.error("Failed to parse JSON response:");
    console.error(rawText.substring(0, 500));
    throw new Error(`JSON parse failed: ${err}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Response is not a JSON array");
  }

  // Calculate cost — Haiku 4.5: $1/M input, $5/M output
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd =
    (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

  const result: ParseResult = {
    transactions: parsed,
    tokenUsage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: Math.round(costUsd * 10000) / 10000,
    },
    model,
    pdfPath,
  };

  return result;
}

// ── VALIDATION HELPERS ──

const VALID_TYPES = [
  "Sale",
  "Purchase",
  "Sale (Partial)",
  "Sale (Full)",
  "Exchange",
];

const VALID_AMOUNTS = [
  "$1,001-$15,000",
  "$15,001-$50,000",
  "$50,001-$100,000",
  "$100,001-$250,000",
  "$250,001-$500,000",
  "$500,001-$1,000,000",
  "$1,000,001-$5,000,000",
  "$5,000,001-$25,000,000",
  "$25,000,001-$50,000,000",
  "Over $50,000,000",
];

function quickValidate(tx: ParsedTransaction, index: number): string[] {
  const errors: string[] = [];

  if (!tx.description || tx.description.trim() === "") {
    errors.push(`[${index}] Empty description`);
  }
  if (!VALID_TYPES.includes(tx.type)) {
    errors.push(`[${index}] Invalid type: "${tx.type}"`);
  }
  if (!VALID_AMOUNTS.includes(tx.amount)) {
    errors.push(`[${index}] Invalid amount range: "${tx.amount}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    errors.push(`[${index}] Invalid date format: "${tx.date}"`);
  }
  if (typeof tx.lateFilingFlag !== "boolean") {
    errors.push(`[${index}] lateFilingFlag is not boolean`);
  }
  if (tx.ticker && !/^[A-Z]{1,6}$/.test(tx.ticker)) {
    errors.push(`[${index}] Suspicious ticker: "${tx.ticker}"`);
  }

  return errors;
}

// ── CLI ──

async function main() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.log("Usage: npx tsx scripts/parse-pdf.ts <path-to-pdf>");
    console.log("       npx tsx scripts/parse-pdf.ts /tmp/cabinet-pdfs/filing.pdf");
    process.exit(1);
  }

  console.log(`\n=== Open Cabinet PDF Parser ===\n`);
  console.log(`PDF: ${pdfPath}`);

  const result = await parsePdf(pdfPath);

  // Quick validation pass
  const allErrors: string[] = [];
  result.transactions.forEach((tx, i) => {
    allErrors.push(...quickValidate(tx, i));
  });

  const lowConfidence = result.transactions.filter(
    (tx) => tx.confidence < 0.8
  );

  // Report
  console.log(`\n--- Results ---`);
  console.log(`Transactions extracted: ${result.transactions.length}`);
  console.log(`Validation errors: ${allErrors.length}`);
  console.log(`Low confidence (<0.8): ${lowConfidence.length}`);
  console.log(
    `Tokens: ${result.tokenUsage.inputTokens} in / ${result.tokenUsage.outputTokens} out`
  );
  console.log(`Cost: $${result.tokenUsage.estimatedCostUsd}`);
  console.log(`Model: ${result.model}`);

  if (allErrors.length > 0) {
    console.log(`\nValidation errors:`);
    allErrors.forEach((e) => console.log(`  ${e}`));
  }

  if (lowConfidence.length > 0) {
    console.log(`\nLow-confidence transactions:`);
    lowConfidence.forEach((tx) =>
      console.log(`  ${tx.date} | ${tx.description.substring(0, 50)}... | conf: ${tx.confidence}`)
    );
  }

  // Write output JSON
  const outputPath = pdfPath.replace(/\.pdf$/i, ".parsed.json");
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nOutput: ${outputPath}`);
}

// ── BATCH PARSING ──
// The Anthropic Batch API processes requests at 50% cost.
// Use this for bulk operations (initial parse, re-parse after model update).
// Results take up to 1 hour instead of real-time.

interface BatchItem {
  customId: string; // e.g., "bessent-278T-2025-05-05"
  pdfPath: string;
}

async function createBatch(items: BatchItem[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");

  const client = new Anthropic({ apiKey });

  const requests = await Promise.all(
    items.map(async (item) => {
      const pdfBuffer = await readFile(item.pdfPath);
      const pdfBase64 = pdfBuffer.toString("base64");

      return {
        custom_id: item.customId,
        params: {
          model: "claude-haiku-4-5" as const,
          max_tokens: 16000,
          messages: [
            {
              role: "user" as const,
              content: [
                {
                  type: "document" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "application/pdf" as const,
                    data: pdfBase64,
                  },
                },
                {
                  type: "text" as const,
                  text: EXTRACTION_PROMPT,
                },
              ],
            },
          ],
        },
      };
    })
  );

  console.log(`Submitting batch of ${requests.length} PDFs (50% cost)...`);
  const batch = await client.messages.batches.create({ requests });
  console.log(`Batch ID: ${batch.id}`);
  console.log(`Status: ${batch.processing_status}`);
  return batch.id;
}

// Export for use by other scripts (pipeline orchestrator)
export { parsePdf, createBatch, quickValidate, VALID_TYPES, VALID_AMOUNTS };
export type { ParsedTransaction, ParseResult, BatchItem };

// Run CLI if invoked directly
main().catch((err) => {
  console.error("Parse failed:", err.message);
  process.exit(1);
});
