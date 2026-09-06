/**
 * Validation of parsed 278-T rows, run on every parse whether it came from
 * the model just now or from a cache file on disk.
 *
 * This is the enum-and-shape gate for the production ingest. Before it
 * existed, `quickValidate` in scripts/parse-pdf.ts was called by the CLI and
 * by the dormant DB pipeline, never by scripts/ingest-new-filings.ts, so a
 * model response with one novel amount string could reach the published
 * JSON unchecked. Pure: no I/O, no model, no filesystem.
 *
 * What it checks, per row:
 *   - exactly the known keys, nothing extra (an injected or renamed field
 *     fails here rather than being carried into the dataset)
 *   - description: non-empty string, bounded length
 *   - ticker: null or a plausible symbol (dotted share classes allowed)
 *   - type: one of the five legal transaction types
 *   - amount: one of the eleven legal ranges, or null with a non-empty
 *     amountNote carrying the filing's own wording
 *   - date: a real calendar date, YYYY-MM-DD, not in the future, not before
 *     the 2019 floor the dataset uses
 *   - lateFilingFlag: a real boolean, not a string
 *   - confidence: a finite number between 0 and 1 (self-reported by the
 *     model; kept as a review signal, never treated as calibrated accuracy)
 *
 * What it does not check: whether the values are true. That is the job of
 * the text-layer cross-check and of a person.
 */
import { isAmountRange, type AmountRange } from "./amounts";

export const VALID_TRANSACTION_TYPES = [
  "Sale",
  "Purchase",
  "Sale (Partial)",
  "Sale (Full)",
  "Exchange",
  "Unstated",
] as const;

export type ValidTransactionType = (typeof VALID_TRANSACTION_TYPES)[number];

/** Row shape the parser is expected to produce. */
export interface ParsedRow {
  description: string;
  ticker: string | null;
  type: ValidTransactionType;
  date: string;
  amount: AmountRange | null;
  amountNote?: string;
  typeNote?: string;
  lateFilingFlag: boolean;
  confidence: number;
}

const KNOWN_KEYS = new Set([
  "description",
  "ticker",
  "type",
  "date",
  "amount",
  "amountNote",
  "typeNote",
  "lateFilingFlag",
  "confidence",
]);

export const MAX_DESCRIPTION_LENGTH = 300;
export const EARLIEST_TRANSACTION_YEAR = 2019;

/** Symbols are 1 to 5 capitals, optionally a dotted class suffix (BRK.B). */
export const TICKER_SHAPE = /^[A-Z]{1,5}(?:\.[A-Z]{1,2})?$/;

export interface ValidationResult {
  ok: boolean;
  rows: ParsedRow[];
  /** Problems that make the parse unusable. Any error means ok is false. */
  errors: string[];
  /** Repairs applied and recorded, never silent: an implausible symbol
   * (brokerage shorthand like "KEYpI" or "K-PEC") is withheld as null. The
   * description keeps the filing's text, so nothing is lost or invented. */
  warnings: string[];
}

function isRealCalendarDate(value: string, today: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return `not YYYY-MM-DD: "${value}"`;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return `not a real calendar date: "${value}"`;
  }
  if (y < EARLIEST_TRANSACTION_YEAR) return `before ${EARLIEST_TRANSACTION_YEAR}: "${value}"`;
  if (dt.getTime() > today.getTime()) return `in the future: "${value}"`;
  return null;
}

/**
 * Validates an unknown value as an array of parsed rows. Returns every
 * problem found rather than stopping at the first, so a bad parse can be
 * diagnosed from one log line per row.
 */
export function validateParsedRows(
  input: unknown,
  options: { today?: Date } = {}
): ValidationResult {
  const today = options.today ?? new Date();
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(input)) {
    return { ok: false, rows: [], errors: ["response is not a JSON array"], warnings };
  }
  const rows: ParsedRow[] = [];
  input.forEach((raw, i) => {
    const at = `row ${i + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`${at}: not an object`);
      return;
    }
    const r = raw as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (!KNOWN_KEYS.has(key)) errors.push(`${at}: unexpected field "${key}"`);
    }

    if (typeof r.description !== "string" || r.description.trim() === "") {
      errors.push(`${at}: empty description`);
    } else if (r.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`${at}: description longer than ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    let ticker: string | null = null;
    if (r.ticker !== null && r.ticker !== undefined) {
      if (typeof r.ticker === "string" && TICKER_SHAPE.test(r.ticker)) {
        ticker = r.ticker;
      } else {
        warnings.push(
          `${at}: ticker withheld, not a plausible symbol: ${JSON.stringify(r.ticker)}`
        );
      }
    }

    if (!VALID_TRANSACTION_TYPES.includes(r.type as ValidTransactionType)) {
      errors.push(`${at}: invalid type ${JSON.stringify(r.type)}`);
    } else if (r.type === "Unstated" && (typeof r.typeNote !== "string" || r.typeNote.trim() === "")) {
      errors.push(`${at}: type is Unstated but typeNote is missing`);
    }

    if (r.amount === null) {
      if (typeof r.amountNote !== "string" || r.amountNote.trim() === "") {
        errors.push(`${at}: amount is null but amountNote is missing`);
      }
    } else if (!isAmountRange(r.amount)) {
      errors.push(`${at}: invalid amount range ${JSON.stringify(r.amount)}`);
    }

    if (typeof r.date !== "string") {
      errors.push(`${at}: date is not a string`);
    } else {
      const problem = isRealCalendarDate(r.date, today);
      if (problem) errors.push(`${at}: date ${problem}`);
    }

    if (typeof r.lateFilingFlag !== "boolean") {
      errors.push(`${at}: lateFilingFlag is not a boolean`);
    }

    if (
      typeof r.confidence !== "number" ||
      !Number.isFinite(r.confidence) ||
      r.confidence < 0 ||
      r.confidence > 1
    ) {
      errors.push(`${at}: confidence is not a number between 0 and 1`);
    }

    rows.push({
      description: String(r.description ?? ""),
      ticker,
      type: r.type as ValidTransactionType,
      date: String(r.date ?? ""),
      amount: (r.amount ?? null) as AmountRange | null,
      ...(typeof r.amountNote === "string" ? { amountNote: r.amountNote } : {}),
      ...(typeof r.typeNote === "string" ? { typeNote: r.typeNote } : {}),
      lateFilingFlag: Boolean(r.lateFilingFlag),
      confidence: Number(r.confidence),
    });
  });
  return { ok: errors.length === 0, rows, errors, warnings };
}

/** Throws with every problem listed, for callers that must halt. */
/** Thrown when the model's rows fail the shape gate. Deterministic: the
 * same document read the same way fails the same way, so callers must not
 * retry it, and a batch should record it and move on. */
export class ParsedRowsInvalidError extends Error {
  constructor(context: string, public readonly problems: string[]) {
    super(`${context}: parsed rows failed validation:\n  ${problems.join("\n  ")}`);
    this.name = "ParsedRowsInvalidError";
  }
}

export function assertParsedRows(
  input: unknown,
  context: string,
  log: (line: string) => void = (line) => console.warn(line)
): ParsedRow[] {
  const result = validateParsedRows(input);
  for (const w of result.warnings) log(`${context}: ${w}`);
  if (!result.ok) throw new ParsedRowsInvalidError(context, result.errors);
  return result.rows;
}
