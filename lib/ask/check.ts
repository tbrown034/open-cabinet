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
  /\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|(?:Jan\.|Feb\.|March|April|May|June|July|Aug\.|Sept\.|Oct\.|Nov\.|Dec\.)\s+\d{1,2},\s+\d{4}/g;

/**
 * Month names carry no figure but sit next to one. Grok found the gap on
 * Sept. 6: a by-month result put "2025-03" in the display strings, the old
 * tokenizer split it into 2025 and 03, and "There were 2026 checked trades"
 * passed. Months are removed alongside dates so their digits vouch for
 * nothing.
 */
const MONTH_NAME =
  /\b(?:Jan\.|January|Feb\.|February|March|April|May|June|July|Aug\.|August|Sept\.|September|Oct\.|October|Nov\.|November|Dec\.|December)\b/gi;

export function extractDateTokens(text: string): string[] {
  return text.match(DATE_TOKEN) ?? [];
}

function withoutDates(text: string): string {
  return text.replace(DATE_TOKEN, " ").replace(MONTH_NAME, " ");
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
 * Words that turn a count of checked rows into a claim about the whole
 * record. Most rows on the site have not cleared every check, so "all 41
 * sales" or "1,364 trades on file" is false by an order of magnitude. The
 * model is told not to write them; this is the part that enforces it.
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
  zero: 0,
  none: 0,
  half: null,
  twice: null,
  double: null,
};

/**
 * A magnitude word with no numeral attached is a quantity nobody checked.
 * "There were millions of checked trades" used to pass whenever the result
 * happened to contain "$4.5 million", because the word sat in a display
 * string (Grok, Sept. 6).
 *
 * Found by subtraction rather than by lookbehind: the numeric tokens are
 * removed from the sentence first, since those already carry their own
 * suffix ("$4.5 million" is one token and is checked at full scale). Whatever
 * magnitude word survives that had no numeral in front of it.
 */
const MAGNITUDE_WORD =
  /\b(?:hundreds?|thousands?|millions?|billions?|trillions?)\b/gi;

/**
 * The sentence with dates, month names and complete numeric tokens removed.
 * What is left is the prose, where a quantity can only be spelled out. A
 * numeric token carries its own suffix, so "$4.5 million" leaves nothing
 * behind and is checked once, at full scale, by the numeric pass.
 */
export function residualText(text: string): string {
  let rest = withoutDates(text);
  for (const token of rest.match(NUMBER_TOKEN) ?? []) {
    rest = rest.replace(token, " ");
  }
  return rest;
}

function bareMagnitudes(residual: string): string[] {
  return residual.match(MAGNITUDE_WORD) ?? [];
}

/** A count of officials must be the number of officials the result found. */
const OFFICIAL_COUNT = /(\d[\d,]*)\s+(?:checked\s+)?officials\b/gi;

const WORD_NUMBER_TOKEN = new RegExp(
  `\\b(${Object.keys(WORD_NUMBERS).join("|")})s?\\b`,
  "gi"
);

export function extractWordNumbers(text: string): string[] {
  return residualText(text).match(WORD_NUMBER_TOKEN) ?? [];
}

export interface LanguageCheck {
  ok: boolean;
  problems: string[];
}

/**
 * A phrased answer must qualify its counts as checked and must not claim
 * completeness. Applied to model text only; code-built sentences are written
 * to this standard already.
 */
export function checkAnswerLanguage(answer: string): LanguageCheck {
  const problems: string[] = [];
  for (const [pattern, label] of OVERCLAIM_PATTERNS) {
    if (pattern.test(answer)) problems.push(label);
  }
  if (!/\bchecked\b/i.test(answer)) problems.push("missing the word checked");
  // "Verified" is the word this box used to use for a weaker bar than the
  // rest of the site means by it (Grok, Sept. 6). One word, one meaning.
  if (/\bverified\b/i.test(answer)) problems.push("verified");
  return { ok: problems.length === 0, problems };
}

/** "No trades", "no rows": a zero claim, and only true when the count is 0. */
const NO_QUANTITY = /\bno\s+(?:checked\s+)?(?:trades|rows|transactions|sales|purchases|officials)\b/i;

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
  // A quantity written as words passes only when the value it names is one
  // the result holds. "Zero" and "none" need the result to actually be zero.
  const stripped = residualText(answer);
  for (const raw of extractWordNumbers(answer)) {
    const word = raw.toLowerCase().replace(/s$/, "");
    const value = WORD_NUMBERS[word];
    if (value !== null && value !== undefined && allowed.has(String(value))) continue;
    if (value === 0 && result.matchedRows === 0) continue;
    unmatched.push(raw.trim());
  }

  if (NO_QUANTITY.test(stripped) && result.matchedRows !== 0) {
    unmatched.push("a claim that there are none");
  }

  for (const bare of bareMagnitudes(stripped)) unmatched.push(bare.trim());

  // "3 officials" has to be the number of officials the ranking found, not
  // the length of the truncated list and not some other figure in the result.
  if (result.groupCount !== undefined) {
    // Run on the text with its numerals intact: this rule is about the
    // numeral sitting in front of the word "officials".
    for (const match of withoutDates(answer).matchAll(OFFICIAL_COUNT)) {
      const stated = Number(match[1].replace(/,/g, ""));
      if (stated !== result.groupCount) unmatched.push(match[0].trim());
    }
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
  const rows = `${result.matchedRows.toLocaleString("en-US")} checked ${
    result.matchedRows === 1 ? "row" : "rows"
  }`;
  const plural = (n: number, word: string) =>
    `${n.toLocaleString("en-US")} checked ${word}${n === 1 ? "" : "s"}`;

  switch (plan.aggregate) {
    case "count":
      return `${planText} That query matches ${rows}.`;
    case "sum_estimate": {
      const t = result.totals;
      if (!t) return `${planText} That query matches ${rows}.`;
      return (
        `${planText} The ${plural(t.knownCount, "row")} with a disclosed range estimate ` +
        `to ${t.estimateDisplay}, and ${t.unknownCount.toLocaleString("en-US")} ` +
        `${t.unknownCount === 1 ? "row" : "rows"} with no stated value are excluded.`
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
          return `${planText} None of them has a checked row matching that query.`;
        }
        return `${planText} That query matches no checked rows.`;
      }
      const lead = `${top.name} leads with ${plural(top.count, "row")} estimated at ${top.estimateDisplay}.`;
      // On a comparison, the official with nothing is half the answer.
      if (missing.length > 0) {
        const who = missing.length === 1 ? missing[0] : missing.join(", ");
        const verb = missing.length === 1 ? "has" : "have";
        return `${planText} ${lead} ${who} ${verb} no checked row matching it.`;
      }
      return `${planText} ${lead}`;
    }
    case "top_assets": {
      const top = result.topAssets?.[0];
      if (!top) return `${planText} That query matches no checked rows.`;
      return `${planText} ${top.label} appears in ${plural(top.count, "row")}, more than any other asset here.`;
    }
    case "by_month": {
      const months = result.byMonth ?? [];
      if (months.length === 0) return `${planText} That query matches no checked rows.`;
      const busiest = months.reduce((a, b) => (b.count > a.count ? b : a));
      return `${planText} The query matches ${rows} across ${months.length.toLocaleString("en-US")} months, with ${busiest.count.toLocaleString("en-US")} in ${busiest.month}.`;
    }
    case "late_share": {
      const share = result.lateShare;
      if (!share || share.total === 0) {
        return `${planText} That query matches no checked rows.`;
      }
      // The display string is the executor's own arithmetic. Nothing here
      // divides anything.
      return `${planText} ${share.display}.`;
    }
    case "first_last_dates": {
      if (!result.firstDate || !result.lastDate) {
        return `${planText} That query matches no checked rows.`;
      }
      return `${planText} The checked rows run from ${formatDate(result.firstDate)} to ${formatDate(result.lastDate)}.`;
    }
  }
}

/**
 * The sentence for a query that matched no checked row but did match rows
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
  const verb = names.length === 1 ? "served" : "served";
  return (
    `${who} ${verb} in a prior administration and is outside the current roster. ` +
    `The download includes those rows.`
  );
}

/**
 * The one-line note that rides along with an answer, naming the rows this
 * same question matched that the box could not use. Grok's point on Sept. 6:
 * a site-wide excluded figure tells a reader nothing about their question.
 */
export function pendingNote(pending: {
  underReview: number;
  auditPending: number;
  notYetCompared: number;
}): string | null {
  const total = pending.underReview + pending.auditPending + pending.notYetCompared;
  if (total === 0) return null;
  return (
    `Rows matching this question but not yet checked: ` +
    `${pending.underReview.toLocaleString("en-US")} under review, ` +
    `${pending.auditPending.toLocaleString("en-US")} awaiting audit, ` +
    `${pending.notYetCompared.toLocaleString("en-US")} not yet compared.`
  );
}

export function pendingAnswer(
  planText: string,
  pending: { underReview: number; auditPending: number; notYetCompared: number },
  subject?: string
): string {
  const total = pending.underReview + pending.auditPending + pending.notYetCompared;
  if (total === 0) return `${planText} No checked row matches that question.`;

  const breakdown =
    `${pending.underReview.toLocaleString("en-US")} under review, ` +
    `${pending.auditPending.toLocaleString("en-US")} awaiting the page audit and ` +
    `${pending.notYetCompared.toLocaleString("en-US")} not yet compared`;
  const lead = subject
    ? `${subject} is tracked here.`
    : `${planText} Rows match that question.`;

  return (
    `${lead} The ${total.toLocaleString("en-US")} rows matching this question have not ` +
    `cleared a check: ${breakdown}. There is no checked answer yet.`
  );
}
