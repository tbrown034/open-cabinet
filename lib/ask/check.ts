/**
 * The gate between the model's sentence and the reader.
 *
 * A model writes the phrasing, so a model can invent a figure inside it. This
 * file pulls every number out of the sentence and requires each one to match
 * something the executor actually produced — a raw figure, or a preformatted
 * string the executor wrote. Rounding is allowed only where execute.ts did the
 * rounding itself, because "$4.5 million" only clears the check when that
 * exact string is in the result payload.
 *
 * A sentence that fails is thrown away, not corrected. The reader gets a
 * sentence assembled in code instead. Nothing is published that a program did
 * not compute.
 */
import { formatDate } from "../format";
import type { ExecuteResult } from "./execute";
import type { QueryPlan } from "./plan";

/**
 * Money, plain integers, decimals, percentages, and the parts of a date.
 * Grouping commas are only taken when three digits follow, so a figure at the
 * end of a clause does not swallow the comma after it.
 */
const NUMBER_TOKEN =
  /\$?\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|thousand|percent))?%?/gi;

export function extractNumberTokens(text: string): string[] {
  return text.match(NUMBER_TOKEN) ?? [];
}

/**
 * Reduce a token to one comparable value. "$4.5 million", "4,500,000" and
 * "$4500000" all become 4500000; "12%" stays "12%".
 */
export function canonicalizeToken(token: string): string | null {
  const cleaned = token.trim().toLowerCase().replace(/\$/g, "").replace(/,/g, "");
  const percent = /^(\d+(?:\.\d+)?)\s*(?:%|percent)$/.exec(cleaned);
  if (percent) return `${Number(percent[1])}%`;
  const scaled = /^(\d+(?:\.\d+)?)\s*(million|billion|thousand)?$/.exec(cleaned);
  if (!scaled) return null;
  const value = Number(scaled[1]);
  if (!Number.isFinite(value)) return null;
  const factor =
    scaled[2] === "billion"
      ? 1_000_000_000
      : scaled[2] === "million"
        ? 1_000_000
        : scaled[2] === "thousand"
          ? 1_000
          : 1;
  return String(value * factor);
}

/** Every figure the result vouches for, in canonical form. */
export function allowedValues(result: ExecuteResult): Set<string> {
  const allowed = new Set<string>();
  for (const n of result.numbers) {
    const c = canonicalizeToken(String(n));
    if (c) allowed.add(c);
  }
  for (const display of result.displayStrings) {
    for (const token of extractNumberTokens(display)) {
      const c = canonicalizeToken(token);
      if (c) allowed.add(c);
    }
  }
  return allowed;
}

export interface NumberCheck {
  ok: boolean;
  /** Tokens in the sentence that the result does not vouch for. */
  unmatched: string[];
}

/* ── Language ───────────────────────────────────────────────────────────── */

/**
 * Words that turn a count of verified rows into a claim about the whole
 * record. Most rows on the site are still one model's read, so "all 41 sales"
 * or "1,364 trades on file" is false by an order of magnitude. The model is
 * told not to write them; this is the part that enforces it.
 */
const OVERCLAIM_PATTERNS: Array<[RegExp, string]> = [
  [/\ball\b/i, "all"],
  [/\bevery\b/i, "every"],
  [/\btotals?\b/i, "total"],
  [/\bon file\b/i, "on file"],
  [/\bcomplete\b/i, "complete"],
  [/\bentire\b/i, "entire"],
  [/\bdisclosure records show\b/i, "disclosure records show"],
  // Recency is an artifact of how rows are stored, not something the plan
  // asked for, so a sentence must not present it as a finding.
  [/\bmost recent\b/i, "most recent"],
];

export interface LanguageCheck {
  ok: boolean;
  problems: string[];
}

/**
 * A phrased answer must qualify its counts as verified and must not claim
 * completeness. Applied to model text only; code-built sentences are written
 * to this standard already.
 */
export function checkAnswerLanguage(answer: string): LanguageCheck {
  const problems: string[] = [];
  for (const [pattern, label] of OVERCLAIM_PATTERNS) {
    if (pattern.test(answer)) problems.push(label);
  }
  if (!/\bverified\b/i.test(answer)) problems.push("missing the word verified");
  return { ok: problems.length === 0, problems };
}

export function checkAnswerNumbers(answer: string, result: ExecuteResult): NumberCheck {
  const allowed = allowedValues(result);
  const unmatched: string[] = [];
  for (const token of extractNumberTokens(answer)) {
    const canonical = canonicalizeToken(token);
    if (canonical === null || !allowed.has(canonical)) unmatched.push(token.trim());
  }
  return { ok: unmatched.length === 0, unmatched };
}

/**
 * The sentence used when the model's phrasing fails the check, or when no
 * model is available. Assembled from the result, so it can only be wrong if
 * the arithmetic is wrong.
 */
export function templateAnswer(
  plan: QueryPlan,
  planText: string,
  result: ExecuteResult
): string {
  const rows = `${result.matchedRows.toLocaleString("en-US")} verified ${
    result.matchedRows === 1 ? "row" : "rows"
  }`;

  switch (plan.aggregate) {
    case "count":
      return `${planText} That query matches ${rows}.`;
    case "sum_estimate": {
      const t = result.totals;
      if (!t) return `${planText} That query matches ${rows}.`;
      return (
        `${planText} The ${t.knownCount.toLocaleString("en-US")} verified rows with a disclosed ` +
        `range estimate to ${t.estimateDisplay}, and ${t.unknownCount.toLocaleString("en-US")} ` +
        `rows with no stated value are excluded.`
      );
    }
    case "list": {
      const shown = result.shownRows ?? 0;
      return `${planText} That query matches ${rows}. The ${shown.toLocaleString("en-US")} listed below run newest first.`;
    }
    case "top_officials": {
      const top = result.topOfficials?.[0];
      if (!top) return `${planText} That query matches no verified rows.`;
      return `${planText} ${top.name} leads with ${top.count.toLocaleString("en-US")} verified rows estimated at ${top.estimateDisplay}.`;
    }
    case "top_assets": {
      const top = result.topAssets?.[0];
      if (!top) return `${planText} That query matches no verified rows.`;
      return `${planText} ${top.label} appears in ${top.count.toLocaleString("en-US")} verified rows, more than any other asset here.`;
    }
    case "by_month": {
      const months = result.byMonth ?? [];
      if (months.length === 0) return `${planText} That query matches no verified rows.`;
      const busiest = months.reduce((a, b) => (b.count > a.count ? b : a));
      return `${planText} The query matches ${rows} across ${months.length.toLocaleString("en-US")} months, with ${busiest.count.toLocaleString("en-US")} in ${busiest.month}.`;
    }
    case "first_last_dates": {
      if (!result.firstDate || !result.lastDate) {
        return `${planText} That query matches no verified rows.`;
      }
      return `${planText} The verified rows run from ${formatDate(result.firstDate)} to ${formatDate(result.lastDate)}.`;
    }
  }
}

/**
 * The sentence for a query that matched no verified row but did match rows
 * the site is still checking.
 *
 * This exists because the first live run said "Trump is not among the
 * officials listed in this dataset." He is the largest official on the site.
 * Not one of his rows had cleared a check, which is a fact worth stating and
 * the opposite of the one that got stated.
 */
export function pendingAnswer(
  planText: string,
  pending: { underReview: number; notYetChecked: number },
  subject?: string
): string {
  const total = pending.underReview + pending.notYetChecked;
  if (total === 0) return `${planText} No verified row matches that query.`;

  const breakdown =
    `${pending.underReview.toLocaleString("en-US")} under review and ` +
    `${pending.notYetChecked.toLocaleString("en-US")} not yet checked`;
  const lead = subject
    ? `${subject} is tracked here.`
    : `${planText} Rows match that query.`;

  return (
    `${lead} The ${total.toLocaleString("en-US")} rows matching this query are still ` +
    `being checked, ${breakdown}. There is no verified answer yet.`
  );
}
