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
 * Dates are matched and removed before any number is looked at.
 *
 * Codex found the reason, Sept. 6: a result containing Oct. 21, 2025 vouched
 * for the loose figures 2025, 10 and 21, so "10 verified rows shown" passed a
 * check on a result that listed one. A date's digits are not figures. They are
 * matched whole, against the whole dates the result actually carries, and the
 * rest of the sentence is checked separately.
 */
const DATE_TOKEN =
  /\d{4}-\d{2}-\d{2}|(?:Jan\.|Feb\.|March|April|May|June|July|Aug\.|Sept\.|Oct\.|Nov\.|Dec\.)\s+\d{1,2},\s+\d{4}/g;

export function extractDateTokens(text: string): string[] {
  return text.match(DATE_TOKEN) ?? [];
}

function withoutDates(text: string): string {
  return text.replace(DATE_TOKEN, " ");
}

/**
 * Money, plain integers, decimals and percentages. Grouping commas are only
 * taken when three digits follow, so a figure at the end of a clause does not
 * swallow the comma after it. The K, M and B suffixes are part of the token,
 * not trailing noise: without them "$4.5M" in a result vouched for a bare
 * "$4.5" and for "$4.5B" in a sentence, a thousandfold error either way.
 */
const NUMBER_TOKEN =
  /\$?\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|thousand|percent)\b|[KMB]\b)?%?/gi;

export function extractNumberTokens(text: string): string[] {
  return withoutDates(text).match(NUMBER_TOKEN) ?? [];
}

const SCALE: Record<string, number> = {
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
};

/**
 * Reduce a token to one comparable value. "$4.5 million", "$4.5M" and
 * "4,500,000" all become 4500000; "12%" stays "12%"; a bare "$4.5" stays 4.5
 * and matches only a result that really holds 4.5.
 */
export function canonicalizeToken(token: string): string | null {
  const cleaned = token.trim().toLowerCase().replace(/\$/g, "").replace(/,/g, "");
  const percent = /^(\d+(?:\.\d+)?)\s*(?:%|percent)$/.exec(cleaned);
  if (percent) return `${Number(percent[1])}%`;
  const scaled = /^(\d+(?:\.\d+)?)\s*(thousand|million|billion|k|m|b)?$/.exec(cleaned);
  if (!scaled) return null;
  const value = Number(scaled[1]);
  if (!Number.isFinite(value)) return null;
  const factor = scaled[2] ? SCALE[scaled[2]] : 1;
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

/** Every whole date the result carries. */
export function allowedDates(result: ExecuteResult): Set<string> {
  const allowed = new Set<string>();
  for (const display of result.displayStrings) {
    for (const date of extractDateTokens(display)) allowed.add(date);
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
  // asked for, so a sentence must not present it as a finding. Live testing
  // caught "dated as recently as June 23, 2026" slipping past a narrower
  // rule that only looked for "most recent".
  [/\brecent(ly)?\b/i, "recent"],
  [/\blatest\b/i, "latest"],
  [/\bnewest\b/i, "newest"],
  [/\boldest\b/i, "oldest"],
];

/**
 * Quantities written as words.
 *
 * "There were one billion verified trades" carries no numeral, so the
 * tokenizer above never sees it, and the sentence used to pass both checks
 * (Codex, Sept. 6). Every quantity word in a sentence has to be vouched for:
 * either the executor printed that exact word in a display string, or the
 * word has a value the result actually holds.
 *
 * "Half", "twice" and "double" have no value to check against, so they only
 * pass when the executor wrote them, which it never does.
 */
const WORD_NUMBERS: Record<string, number | null> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  dozen: 12,
  half: null,
  twice: null,
  double: null,
};

const WORD_NUMBER_TOKEN = new RegExp(
  `\\b(${Object.keys(WORD_NUMBERS).join("|")})s?\\b`,
  "gi"
);

export function extractWordNumbers(text: string): string[] {
  return withoutDates(text).match(WORD_NUMBER_TOKEN) ?? [];
}

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
  const dates = allowedDates(result);
  const unmatched: string[] = [];

  for (const date of extractDateTokens(answer)) {
    if (!dates.has(date)) unmatched.push(date.trim());
  }
  for (const token of extractNumberTokens(answer)) {
    const canonical = canonicalizeToken(token);
    if (canonical === null || !allowed.has(canonical)) unmatched.push(token.trim());
  }
  // A quantity written as words passes only when the executor wrote that
  // exact word, or when the value it names is one the result holds.
  const spelled = result.displayStrings.join(" ").toLowerCase();
  for (const raw of extractWordNumbers(answer)) {
    const word = raw.toLowerCase().replace(/s$/, "");
    if (new RegExp(`\\b${word}s?\\b`).test(spelled)) continue;
    const value = WORD_NUMBERS[word];
    if (value !== null && value !== undefined && allowed.has(String(value))) continue;
    unmatched.push(raw.trim());
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
      return `${planText} That query matches ${rows}. ${shown.toLocaleString("en-US")} are listed below.`;
    }
    case "top_officials": {
      const top = result.topOfficials?.[0];
      const missing = result.missingOfficials ?? [];
      if (!top) {
        if (missing.length > 0) {
          return `${planText} None of them has a verified row matching that query.`;
        }
        return `${planText} That query matches no verified rows.`;
      }
      const lead = `${top.name} leads with ${top.count.toLocaleString("en-US")} verified rows estimated at ${top.estimateDisplay}.`;
      // On a comparison, the official with nothing is half the answer.
      if (missing.length > 0) {
        const who = missing.length === 1 ? missing[0] : missing.join(", ");
        const verb = missing.length === 1 ? "has" : "have";
        return `${planText} ${lead} ${who} ${verb} no verified row matching it.`;
      }
      return `${planText} ${lead}`;
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
    case "late_share": {
      const share = result.lateShare;
      if (!share || share.total === 0) {
        return `${planText} That query matches no verified rows.`;
      }
      // The display string is the executor's own arithmetic. Nothing here
      // divides anything.
      return `${planText} ${share.display}.`;
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
/**
 * The sentence for an official the site tracks but keeps out of its current
 * roster. Open Cabinet excludes prior-administration holdovers from every
 * aggregate view, so their rows are not in the query set and reporting zero
 * would read as "this person traded nothing." Codex found the case on Sept. 6.
 */
export function outOfScopeAnswer(names: string[]): string {
  const who = names.length === 1 ? names[0] : names.join(", ");
  const verb = names.length === 1 ? "is a" : "are";
  const noun = names.length === 1 ? "holdover" : "holdovers";
  return (
    `${who} ${verb} prior-administration ${noun}. Open Cabinet keeps their filings on ` +
    `the site but out of current-roster totals, so this box does not query them. ` +
    `Their pages carry the full record.`
  );
}

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
