/**
 * Deterministic cross-check of an AI-parsed 278-T against the PDF's own
 * text layer.
 *
 * The AI parse (parse-pdf.ts) is the primary extraction lane. This is the
 * independent second lane: pdftotext -layout plus a column-aware row parser,
 * built so the two lanes fail differently — the model errs rarely and
 * randomly, a column parser errs systematically on layout drift. Agreement
 * between them is strong evidence; disagreement halts the ingest before a
 * bad parse can reach the site.
 *
 * Deliberately compares only the machine-checkable columns (type, date,
 * amount, late flag, row count, row-number continuity) and NOT descriptions —
 * description text wraps unpredictably in -layout output, and a wrap
 * difference is not a data error. Known limitation: a parse that attached
 * the right tuple to the wrong asset name would pass; the visual lane and
 * golden files cover that class.
 *
 * Fail-closed design (a false OK is worse than a false alarm):
 *  - pdftotext failing to run is an ERROR (halts ingest), not a scan.
 *  - A text layer that clearly contains a transactions table but yields no
 *    extractable rows is an ERROR, not a scan.
 *  - A row whose notification column shows neither Yes nor No is a problem,
 *    not a silent "not late".
 *  - Printed row numbers must run 1..N with no gaps or duplicates.
 *
 * Scanned filings (no text layer, e.g. Trump's) cannot be cross-checked
 * here; for those the result is "scan", and the caller must surface the
 * standing rule: visual row-number reconciliation before commit.
 *
 * Standalone usage (checks a PDF against its .parsed.json cache):
 *   npx tsx scripts/text-layer-crosscheck.ts data/pdfs/Some-Filing-278T.pdf
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

/** Bump when the comparison changes. Recorded in data/meta/crosscheck-log.json. */
export const CHECKER_VERSION = "2026-09-05.2";

export interface CrossCheckRow {
  rowNumber: number;
  type: string;
  date: string; // YYYY-MM-DD
  amount: string;
  /** true/false when the Yes/No column was read; null when unreadable */
  lateFilingFlag: boolean | null;
}

export type CrossCheckResult =
  | { status: "ok"; rowCount: number }
  | { status: "scan" } // no text layer — visual lane required
  | { status: "error"; message: string } // tooling/extraction failure — halt
  | { status: "mismatch"; problems: string[] };

type Extraction =
  | {
      kind: "rows";
      rows: CrossCheckRow[];
      /** Printed row numbers that carry no transaction: account headers
       * ("Spouse Investment Account #1") and "Line is intentionally left
       * blank". The form numbers them; the model rightly omits them. */
      placeholderRows: number[];
    }
  | { kind: "no-text" }
  | { kind: "tool-error"; message: string };

/** Numbered lines the form prints that are not transactions. */
const PLACEHOLDER_LINE =
  /line is (?:intentionally left|left intentionally) blank|\baccount\s*#?\s*\d*\s*(?:No|Yes)?\s*$/i;

/** "Sale (Partial)" and "Sale (Full)" count as Sale for comparison; the AI
 * lane normalizes subtypes the same way at parse time. */
function baseType(t: string): string {
  if (/^sale/i.test(t)) return "Sale";
  if (/^purchase/i.test(t)) return "Purchase";
  if (/^exchange/i.test(t)) return "Exchange";
  return t.trim();
}

function isoDate(mmddyyyy: string): string {
  const [m, d, y] = mmddyyyy.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Normalize "$500,001 - $1,000,000" (possibly wrapped) to the dataset's
 * "$500,001-$1,000,000"; "Over $50,000,000" and "Over $1,000,000" pass
 * through as-is (they are real OGE range labels, not parse errors). */
/** Token both lanes use when a filing states no value for a row. */
export const UNKNOWN_AMOUNT_TOKEN = "unknown";

function normalizeAmount(raw: string): string {
  // The filing's own phrase for "no value stated". The AI lane stores these
  // rows as amount null; both sides compare as the same token.
  if (/not\s+readily\s+ascertainable/i.test(raw)) return UNKNOWN_AMOUNT_TOKEN;
  const overs = raw.match(/Over\s+\$[\d,]+/i);
  if (overs) return overs[0].replace(/\s+/g, " ").replace(/over/i, "Over");
  const m = raw.match(/\$[\d,]+\s*-\s*\$[\d,]+/);
  if (m) return m[0].replace(/\s*-\s*/, "-");
  return raw.trim();
}

/** Extract comparison rows from a 278-T's text layer. */
export function extractTextLayerRows(pdfPath: string): Extraction {
  let text: string;
  try {
    text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err: any) {
    // Fail closed: a broken tool must not silently downgrade the check to
    // "scan" — that path skips verification entirely.
    return { kind: "tool-error", message: `pdftotext failed: ${err?.message ?? err}` };
  }
  return parseTextLayer(text);
}

/** Pure: the column parser over pdftotext -layout output. Tested on strings. */
export function parseTextLayer(text: string): Extraction {

  // Walk all lines and treat "row-number + 2+ spaces + content" as a row
  // start; the transactions table is the only numbered wide-row table whose
  // rows carry a type token, a MM/DD/YYYY date, and a dollar range, so
  // non-transaction numbered rows (endnote tables) are filtered by the
  // field requirements below.
  const lines = text.split("\n");
  const rowStart = /^\s{0,4}(\d{1,4})\s{2,}\S/;
  const blocks: Array<{ num: number; lines: string[] }> = [];
  let current: { num: number; lines: string[] } | null = null;
  for (const line of lines) {
    const start = line.match(rowStart);
    if (start) {
      if (current) blocks.push(current);
      current = { num: parseInt(start[1], 10), lines: [line] };
    } else if (current) {
      // Continuation lines (wrapped description or wrapped amount) are
      // indented past the row-number column; a blank line ends the block.
      if (line.trim() === "") {
        blocks.push(current);
        current = null;
      } else {
        current.lines.push(line);
      }
    }
  }
  if (current) blocks.push(current);

  const rows: CrossCheckRow[] = [];
  const placeholderRows: number[] = [];
  for (const block of blocks) {
    const blockText = block.lines.join("\n");
    const date = blockText.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (!date && PLACEHOLDER_LINE.test(blockText)) {
      placeholderRows.push(block.num);
      continue;
    }
    // The TYPE column sits between the description and the date, but type
    // words also appear inside company names ("Intercontinental Exchange
    // Group"). Take the LAST type token before the date, which is the
    // column value, not a description word.
    let type: string | null = null;
    if (date) {
      const beforeDate = blockText.slice(0, date.index!);
      const typeTokens = [
        ...beforeDate.matchAll(
          /\b(Purchase|Sale \(Partial\)|Sale \(Full\)|Sale|Exchange)\b/g
        ),
      ];
      type = typeTokens.length ? typeTokens[typeTokens.length - 1][1] : null;
    }
    // Amount ranges wrap unpredictably: the upper bound can land on the next
    // line AFTER wrapped description text ("$100,001 -\n  (HOOD)   $250,000"),
    // so pair the low bound with the next dollar token anywhere later in the
    // block rather than requiring adjacency.
    let amountRaw: string | null = null;
    const over = blockText.match(/Over\s+\$[\d,]+/i);
    const notAscertainable = blockText.match(/value\s+not\s+readily\s+ascertainable/i);
    if (notAscertainable) {
      // The filing states no value. Both lanes compare this as "unknown".
      amountRaw = notAscertainable[0];
    } else if (over) {
      amountRaw = over[0];
    } else {
      const low = blockText.match(/(\$[\d,]+)\s*-/);
      if (low) {
        const rest = blockText.slice(low.index! + low[0].length);
        // The upper bound is a whole-dollar token larger than the lower
        // bound. A wrapped description can put an option strike price
        // ("$57.27)") between the two, which once produced "$50,001-$57".
        // Skip any dollar token followed by a decimal point and any token
        // that is not larger than the low bound.
        const lowValue = Number(low[1].replace(/[$,]/g, ""));
        let high: string | null = null;
        for (const m of rest.matchAll(/\$[\d,]+(?![\d.])/g)) {
          const value = Number(m[0].replace(/[$,]/g, ""));
          if (Number.isFinite(value) && value > lowValue) {
            high = m[0];
            break;
          }
        }
        if (high) amountRaw = `${low[1]}-${high}`;
      }
    }
    if (!type || !date || !amountRaw) continue; // not a transaction row
    // The Yes/No notification column sits between the date and the amount.
    // Fail closed: if neither token is present the column is unreadable and
    // the row is flagged as a problem rather than assumed on-time.
    const afterDate = blockText.slice(
      blockText.indexOf(date[1]) + date[1].length
    );
    const window = afterDate.slice(0, afterDate.indexOf("$") + 1 || undefined);
    const late = /\bYes\b/.test(window)
      ? true
      : /\bNo\b/.test(window)
        ? false
        : null;
    rows.push({
      rowNumber: block.num,
      type: baseType(type),
      date: isoDate(date[1]),
      amount: normalizeAmount(amountRaw),
      lateFilingFlag: late,
    });
  }

  if (rows.length === 0) {
    // Distinguish "image scan, nothing to read" from "there IS a table in
    // the text but the extractor got nothing" — the latter must not skip
    // verification.
    const looksLikeTable =
      /Transactions/i.test(text) && /\$[\d,]+\s*-/.test(text) && /\b\d{2}\/\d{2}\/\d{4}\b/.test(text);
    if (looksLikeTable) {
      return {
        kind: "tool-error",
        message:
          "text layer contains a transactions table but no rows were extracted — extractor cannot verify this layout",
      };
    }
    return { kind: "no-text" };
  }
  return { kind: "rows", rows, placeholderRows };
}

function tupleOf(r: {
  type: string;
  date: string;
  amount: string | null;
  lateFilingFlag: boolean | null;
}): string {
  const late =
    r.lateFilingFlag === null ? "unreadable" : r.lateFilingFlag ? "late" : "ontime";
  const amount = r.amount === null ? UNKNOWN_AMOUNT_TOKEN : r.amount;
  return `${r.type}|${r.date}|${amount}|${late}`;
}

/**
 * Compare the AI parse against the text layer. `parsed` is the AI lane's
 * rows for the SAME single filing PDF, in document order (both lanes
 * transcribe top-to-bottom, so comparison is positional — stronger than a
 * multiset check, which a swapped pair of rows would pass).
 */
export function crossCheckParsedFiling(
  pdfPath: string,
  parsed: Array<{ type: string; date: string; amount: string | null; lateFilingFlag?: boolean }>
): CrossCheckResult {
  // A 278-TERM termination report is a different form: no notification
  // column, different sections. The column parser does not read it. Say so
  // by name rather than reporting every row as a mismatch.
  if (/278-?TERM/i.test(pdfPath)) {
    return { status: "error", message: "unsupported form: 278-TERM termination report; the column parser reads 278-T only" };
  }

  const extraction = extractTextLayerRows(pdfPath);
  if (extraction.kind === "no-text") return { status: "scan" };
  if (extraction.kind === "tool-error")
    return { status: "error", message: extraction.message };

  const textRows = extraction.rows;
  const problems: string[] = [];

  // Printed row numbers must run 1..N contiguously. A gap means the
  // extractor dropped a row it couldn't read — which would otherwise turn
  // a real discrepancy into a false OK. Placeholder rows the form numbers
  // but that hold no transaction count toward continuity, not toward the
  // comparison.
  const nums = textRows.map((r) => r.rowNumber);
  const seen = new Set<number>();
  for (const n of nums) {
    if (seen.has(n)) problems.push(`printed row number ${n} appears twice`);
    seen.add(n);
  }
  for (const n of extraction.placeholderRows) seen.add(n);
  const maxNum = Math.max(...nums);
  for (let n = 1; n <= maxNum; n++) {
    if (!seen.has(n))
      problems.push(
        `printed row ${n} missing from text-layer extraction (rows run 1..${maxNum})`
      );
  }

  for (const r of textRows) {
    if (r.lateFilingFlag === null)
      problems.push(`row ${r.rowNumber}: notification (Yes/No) column unreadable`);
  }

  if (textRows.length !== parsed.length) {
    problems.push(
      `row count: text layer has ${textRows.length}, AI parse has ${parsed.length}`
    );
  } else {
    const normalizedParsed = parsed.map((t) => ({
      type: baseType(t.type),
      date: t.date,
      amount: t.amount,
      lateFilingFlag: !!t.lateFilingFlag,
    }));
    for (let i = 0; i < textRows.length; i++) {
      const want = tupleOf(textRows[i]);
      const got = tupleOf(normalizedParsed[i]);
      if (want !== got) {
        problems.push(
          `row ${textRows[i].rowNumber}: text layer [${want}] vs AI parse [${got}]`
        );
        if (problems.length > 20) {
          problems.push("(further differences suppressed)");
          break;
        }
      }
    }
  }

  return problems.length
    ? { status: "mismatch", problems }
    : { status: "ok", rowCount: textRows.length };
}

// ---- standalone CLI: check a PDF against its .parsed.json cache ----
if (process.argv[1]?.endsWith("text-layer-crosscheck.ts")) {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("usage: npx tsx scripts/text-layer-crosscheck.ts <filing.pdf>");
    process.exit(2);
  }
  const cachePath = pdfPath.replace(/\.pdf$/i, ".parsed.json");
  if (!existsSync(cachePath)) {
    console.error(`no parse cache at ${cachePath}`);
    process.exit(2);
  }
  const parsed = JSON.parse(readFileSync(cachePath, "utf-8")).transactions;
  const result = crossCheckParsedFiling(pdfPath, parsed);
  if (result.status === "ok") {
    console.log(`OK — text layer and AI parse agree on ${result.rowCount} rows`);
  } else if (result.status === "scan") {
    console.log(
      "SCAN — no usable text layer; visual row-number reconciliation required"
    );
  } else if (result.status === "error") {
    console.error(`ERROR — ${result.message}`);
    process.exit(1);
  } else {
    console.error("MISMATCH:");
    for (const p of result.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}
