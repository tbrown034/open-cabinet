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
import OpenAI from "openai";
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

type ModelChoice =
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "claude-opus-4-6"
  | "gpt-5.4-mini"
  | "gpt-5.4-nano";

// Cost per million tokens by model
const MODEL_COSTS: Record<ModelChoice, { input: number; output: number; provider: "anthropic" | "openai" }> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, provider: "anthropic" },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, provider: "anthropic" },
  "claude-opus-4-6": { input: 5.0, output: 25.0, provider: "anthropic" },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, provider: "openai" },
  "gpt-5.4-nano": { input: 0.20, output: 1.25, provider: "openai" },
};

async function parsePdf(
  pdfPath: string,
  modelOverride?: ModelChoice
): Promise<ParseResult> {
  // Route to OpenAI if an OpenAI model is selected
  if (modelOverride?.startsWith("gpt-")) {
    return parseWithOpenAI(pdfPath, modelOverride as "gpt-5.4-mini" | "gpt-5.4-nano");
  }

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

  // Model selection:
  // - sonnet (default): Best accuracy/cost balance for messy PDFs ($3/$15 per MTok)
  // - haiku: Cheapest, fine for clean PDFs ($1/$5 per MTok)
  // - opus: Highest accuracy, use for verification ($5/$25 per MTok)
  // Batch API halves all costs (50% discount)
  const model = modelOverride || "claude-sonnet-4-6";
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
  // Note: if credits run out, the SDK throws an Anthropic.BadRequestError
  // with message containing "credit balance is too low" — the pipeline
  // orchestrator should catch this and log it, not crash silently.
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

  // Calculate cost using model-specific pricing
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const pricing = MODEL_COSTS[model as ModelChoice] || MODEL_COSTS["claude-sonnet-4-6"];
  const costUsd =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;

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

/**
 * Compare two parse results and report differences.
 * Used by admin UI to verify a parse with a second model.
 */
function diffParseResults(
  primary: ParseResult,
  verification: ParseResult
): { matches: number; differences: string[]; total: number } {
  const differences: string[] = [];
  const pTx = primary.transactions;
  const vTx = verification.transactions;

  if (pTx.length !== vTx.length) {
    differences.push(
      `Transaction count: ${pTx.length} (${primary.model}) vs ${vTx.length} (${verification.model})`
    );
  }

  let matches = 0;
  const total = Math.max(pTx.length, vTx.length) * 5; // 5 fields per tx

  for (let i = 0; i < Math.min(pTx.length, vTx.length); i++) {
    const p = pTx[i];
    const v = vTx[i];
    if (p.description === v.description) matches++; else
      differences.push(`[${i}] description: "${p.description.substring(0, 40)}..." vs "${v.description.substring(0, 40)}..."`);
    if (p.type === v.type) matches++; else
      differences.push(`[${i}] type: ${p.type} vs ${v.type}`);
    if (p.date === v.date) matches++; else
      differences.push(`[${i}] date: ${p.date} vs ${v.date}`);
    if (p.amount === v.amount) matches++; else
      differences.push(`[${i}] amount: ${p.amount} vs ${v.amount}`);
    if (p.lateFilingFlag === v.lateFilingFlag) matches++; else
      differences.push(`[${i}] lateFilingFlag: ${p.lateFilingFlag} vs ${v.lateFilingFlag}`);
  }

  return { matches, differences, total };
}

async function main() {
  const args = process.argv.slice(2);
  const modelFlag = args.find((a) => a.startsWith("--model="));
  const verifyFlag = args.includes("--verify");
  const pdfPath = args.find((a) => !a.startsWith("--"));
  const selectedModel = modelFlag
    ? (modelFlag.split("=")[1] as ModelChoice)
    : undefined;

  if (!pdfPath) {
    console.log("Usage: npx tsx scripts/parse-pdf.ts <path-to-pdf> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --model=claude-sonnet-4-6  Model to use (default: sonnet)");
    console.log("  --model=claude-haiku-4-5   Cheaper, less accurate");
    console.log("  --model=claude-opus-4-6    Most accurate Anthropic model");
    console.log("  --model=gpt-5.4-mini       OpenAI cross-provider check");
    console.log("  --model=gpt-5.4-nano       OpenAI cheapest option");
    console.log("  --verify                   Parse then cross-check with different provider");
    console.log("");
    console.log("Projected costs per PDF:");
    console.log("  Haiku:      ~$0.01   (Anthropic, clean PDFs)");
    console.log("  Sonnet:     ~$0.02   (Anthropic, default — best accuracy/cost)");
    console.log("  Opus:       ~$0.06   (Anthropic, complex PDFs)");
    console.log("  GPT-5.4m:   ~$0.01   (OpenAI, cross-provider verify)");
    console.log("  GPT-5.4n:   ~$0.003  (OpenAI, cheapest)");
    console.log("  Batch:      50% off  (both providers)");
    process.exit(1);
  }

  console.log(`\n=== Open Cabinet PDF Parser ===\n`);
  console.log(`PDF: ${pdfPath}`);
  console.log(`Model: ${selectedModel || "claude-sonnet-4-6 (default)"}`);
  if (verifyFlag) console.log(`Verification: will re-parse with Opus after`);

  const result = await parsePdf(pdfPath, selectedModel);

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

  // Verification pass with a different provider for cross-check
  if (verifyFlag) {
    const useOpenAI = !!process.env.OPENAI_API_KEY;
    const verifyProvider = useOpenAI ? "OpenAI GPT-5.4-mini" : "Claude Opus";
    console.log(`\n--- Verification Pass (${verifyProvider}) ---`);

    const verifyResult = useOpenAI
      ? await parseWithOpenAI(pdfPath, "gpt-5.4-mini")
      : await parsePdf(pdfPath, "claude-opus-4-6");

    console.log(
      `Verification: ${verifyResult.transactions.length} transactions`
    );
    console.log(
      `Cost: $${verifyResult.tokenUsage.estimatedCostUsd} (${verifyResult.model})`
    );

    const diff = diffParseResults(result, verifyResult);
    const accuracy = diff.total > 0 ? ((diff.matches / diff.total) * 100).toFixed(1) : "100";
    console.log(`Agreement: ${accuracy}% (${diff.matches}/${diff.total} fields match)`);

    if (diff.differences.length > 0) {
      console.log(`\nDifferences:`);
      diff.differences.slice(0, 10).forEach((d) => console.log(`  ${d}`));
      if (diff.differences.length > 10) {
        console.log(`  ... and ${diff.differences.length - 10} more`);
      }
    } else {
      console.log(`Models agree on all fields.`);
    }

    console.log(
      `\nTotal cost: $${(result.tokenUsage.estimatedCostUsd + verifyResult.tokenUsage.estimatedCostUsd).toFixed(4)} (primary + verification)`
    );
  }
}

// ── OPENAI PARSING ──
// Cross-provider verification: parse with GPT as a second opinion

async function parseWithOpenAI(
  pdfPath: string,
  model: "gpt-5.4-mini" | "gpt-5.4-nano" = "gpt-5.4-mini"
): Promise<ParseResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be set in .env.local for OpenAI parsing");
  }

  const client = new OpenAI({ apiKey });
  const pdfBuffer = await readFile(pdfPath);
  const pdfBase64 = pdfBuffer.toString("base64");

  console.log(
    `  Sending PDF to OpenAI ${model} (${(pdfBuffer.length / 1024).toFixed(0)} KB)...`
  );

  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "filing.pdf",
              file_data: `data:application/pdf;base64,${pdfBase64}`,
            },
          } as any, // OpenAI SDK types may not include file type yet
          {
            type: "text",
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  const rawText = response.choices[0]?.message?.content?.trim() || "";
  let cleaned = rawText;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: ParsedTransaction[];
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse OpenAI JSON response:");
    console.error(cleaned.substring(0, 500));
    throw new Error(`JSON parse failed: ${err}`);
  }

  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const pricing = MODEL_COSTS[model];
  const costUsd =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;

  return {
    transactions: parsed,
    tokenUsage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: Math.round(costUsd * 10000) / 10000,
    },
    model,
    pdfPath,
  };
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
export { parsePdf, parseWithOpenAI, createBatch, quickValidate, diffParseResults, VALID_TYPES, VALID_AMOUNTS, MODEL_COSTS };
export type { ParsedTransaction, ParseResult, BatchItem, ModelChoice };

// Run CLI if invoked directly (not when imported by other scripts)
const isDirectRun = process.argv[1]?.includes("parse-pdf");
if (isDirectRun) {
  main().catch((err) => {
    console.error("Parse failed:", err.message);
    process.exit(1);
  });
}
