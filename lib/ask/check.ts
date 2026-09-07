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
import { readerMoney, type ExecuteResult } from "./execute";
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

  // "No trades" is a true claim about an official the comparison named who
  // has nothing; the executor vouches for that list in missingOfficials.
  const zeroVouched = (result.missingOfficials?.length ?? 0) > 0;
  if (NO_QUANTITY.test(stripped) && result.matchedRows !== 0 && !zeroVouched) {
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

/* ── Reader wording ─────────────────────────────────────────────────────── */

/** "sales", "purchases", "exchanges" or "trades", from the plan's type filter. */
export function tradeNoun(plan: QueryPlan, n: number): string {
  const types = plan.filters.types ?? [];
  const one = n === 1;
  if (types.length > 0 && types.every((t) => t.startsWith("Sale"))) return one ? "sale" : "sales";
  if (types.length > 0 && types.every((t) => t === "Purchase")) return one ? "purchase" : "purchases";
  if (types.length > 0 && types.every((t) => t === "Exchange")) return one ? "exchange" : "exchanges";
  return one ? "trade" : "trades";
}

/** "March 2026" from "2026-03". */
function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function n(v: number): string {
  return v.toLocaleString("en-US");
}

/** "Christopher Wright, Secretary of Energy," or "Officials in this data". */
function whoPhrase(result: ExecuteResult): { subject: string; possessive: string; named: boolean } {
  const who = result.subjectOfficials ?? [];
  if (who.length === 0) return { subject: "Officials in this data", possessive: "Officials'", named: false };
  const one = (o: { name: string; title: string; agency?: string }) => (o.title ? `${o.name}, ${fullTitle(o)},` : o.name);
  if (who.length === 1) return { subject: one(who[0]), possessive: `${who[0].name}'s`, named: true };
  const names = who.map((o) => o.name);
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return { subject: list, possessive: `${list}'s`, named: true };
}

/** "Chairman" alone says nothing; "Chairman, Federal Reserve" does. Skipped when the title already names the agency. */
function fullTitle(o: { name: string; title: string; agency?: string }): string {
  if (!o.agency) return o.title;
  const words = o.agency.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 5 && !["department", "office", "united", "states", "federal", "national", "administration", "agency", "commission"].includes(w));
  const shared = words.some((w) => o.title.toLowerCase().includes(w));
  return shared ? o.title : `${o.title}, ${o.agency}`;
}

function ofAsset(result: ExecuteResult): string {
  return result.assetLabel ? ` of ${result.assetLabel}` : "";
}

function whenPhrase(plan: QueryPlan): string {
  const f = plan.filters;
  if (f.dateFrom && f.dateTo) return ` between ${formatDate(f.dateFrom)} and ${formatDate(f.dateTo)}`;
  if (f.dateFrom) return ` since ${formatDate(f.dateFrom)}`;
  if (f.dateTo) return ` through ${formatDate(f.dateTo)}`;
  return "";
}

function qualifiers(plan: QueryPlan): string {
  const f = plan.filters;
  const parts: string[] = [];
  if (f.lateOnly) parts.push("flagged as reported late");
  const dollars = (v: number) => `$${v.toLocaleString("en-US")}`;
  if (f.amountAtLeast !== undefined && f.amountAtMost !== undefined) parts.push(`with a disclosed range inside ${dollars(f.amountAtLeast)} to ${dollars(f.amountAtMost)}`);
  else if (f.amountAtLeast !== undefined) parts.push(`with a disclosed range starting at ${dollars(f.amountAtLeast)} or more`);
  else if (f.amountAtMost !== undefined) parts.push(`with a disclosed range ending at ${dollars(f.amountAtMost)} or less`);
  return parts.length ? ` ${parts.join(", ")}` : "";
}

/**
 * The sentence a reader sees. Assembled from the result, so it can only be
 * wrong if the arithmetic is wrong. Written for a reader, not a database:
 * "sales" not "rows", the official's title, the company's name, dollars
 * rounded the way a story would print them (Trevor, Sept. 7). The scope
 * ("checked rows only") lives in the status label and the disclosure.
 */
export function templateAnswer(
  plan: QueryPlan,
  planText: string,
  result: ExecuteResult
): string {
  // One closing sentence carries the scope every answer must state.
  const body = readerSentence(plan, result);
  return `${body} Checked trades only.`;
}

export function readerSentence(plan: QueryPlan, result: ExecuteResult): string {
  const total = result.matchedRows;
  const noun = tradeNoun(plan, total);
  const { subject, possessive, named } = whoPhrase(result);
  const asset = ofAsset(result);
  const when = whenPhrase(plan);
  const qual = qualifiers(plan);
  const reported = named ? "reported" : "reported";
  const none = `${subject} ${reported} no ${tradeNoun(plan, 2)}${asset}${qual}${when}.`;

  switch (plan.aggregate) {
    case "count":
      if (total === 0) return none;
      return `${subject} ${reported} ${n(total)} ${noun}${asset}${qual}${when}.`;
    case "sum_estimate": {
      const t = result.totals;
      if (!t || total === 0) return none;
      const excluded = t.unknownCount > 0 ? ` ${n(t.unknownCount)} with no stated value ${t.unknownCount === 1 ? "is" : "are"} left out of the total.` : "";
      const open = t.openEndedCount > 0 ? ` ${n(t.openEndedCount)} ${t.openEndedCount === 1 ? "is an open-ended range" : "are open-ended ranges"}, counted at the site's convention.` : "";
      return `${subject} ${reported} ${n(total)} ${noun}${asset}${qual}${when}, an estimated ${readerMoney(t.estimate)} in total, adding the midpoint of each disclosed range.${excluded}${open}`;
    }
    case "list": {
      if (total === 0) return none;
      const shown = result.shownRows ?? 0;
      const order = plan.sort === "amount" ? "largest" : plan.sort === "amount_asc" ? "smallest" : "most recent";
      const listed = shown >= total ? (total === 1 ? " It is listed below." : " All are listed below.") : ` The ${n(shown)} ${order} are listed below.`;
      return `${subject} ${reported} ${n(total)} ${noun}${asset}${qual}${when}.${listed}`;
    }
    case "top_officials": {
      const top = result.topOfficials?.[0];
      const missing = result.missingOfficials ?? [];
      const pluralNoun = tradeNoun(plan, 2);
      if (!top) {
        if (missing.length > 0) return `None of them reported ${pluralNoun}${asset}${qual}${when}.`;
        return `No official in this data reported ${pluralNoun}${asset}${qual}${when}.`;
      }
      const groups = result.groupCount ?? 0;
      const ranked = result.topOfficials ?? [];
      const byValue = plan.sort === "amount";
      const tied = ranked.filter((o) => (byValue ? o.estimate === top.estimate : o.count === top.count));
      const person = (o: { name: string; title?: string; agency?: string }) => (o.title ? `${o.name}, ${fullTitle({ name: o.name, title: o.title, agency: o.agency })},` : o.name);
      const detail = (o: { count: number; estimate: number }) => `${n(o.count)} ${tradeNoun(plan, o.count)}, an estimated ${readerMoney(o.estimate)}`;
      let lead: string;
      if (groups === 1) {
        lead = `${person(top)} is the only official who reported ${pluralNoun}${asset}${qual}${when}: ${detail(top)}.`;
      } else {
        const head = `${n(groups)} officials reported ${pluralNoun}${asset}${qual}${when}.`;
        if (tied.length > 1) {
          const names = tied.length === ranked.length && groups > tied.length ? `The ${n(tied.length)} listed` : tied.map((o) => o.name).join(", ");
          lead = `${head} ${names} tie at ${n(top.count)} ${tradeNoun(plan, top.count)} each${byValue ? ` (about ${readerMoney(top.estimate)})` : ""}.`;
        } else if (byValue) {
          lead = `${head} ${person(top)} leads by estimated value with ${readerMoney(top.estimate)} across ${n(top.count)} ${tradeNoun(plan, top.count)}.`;
        } else {
          lead = `${head} ${person(top)} leads with ${detail(top)}.`;
        }
      }
      if (missing.length > 0) {
        const who = missing.length === 1 ? missing[0] : missing.join(", ");
        return `${lead} ${who} reported no ${pluralNoun}${asset}${when}.`;
      }
      return lead;
    }
    case "top_assets": {
      const top = result.topAssets?.[0];
      if (!top) return none;
      return `${possessive} most-traded asset${qual}${when} was ${top.label}, with ${n(top.count)} ${tradeNoun(plan, top.count)}.`;
    }
    case "by_month": {
      const months = result.byMonth ?? [];
      const undated = result.undatedRows ?? 0;
      if (total === 0) return none;
      const undatedNote = undated > 0 ? ` ${n(undated)} ${undated === 1 ? "has" : "have"} no transaction date printed and ${undated === 1 ? "is" : "are"} not placed in a month.` : "";
      if (months.length === 0) return `${subject} ${reported} ${n(total)} ${noun}${asset}${qual}${when}, none with a transaction date printed.`;
      const busiest = months.reduce((a, b) => (b.count > a.count ? b : a));
      return `${subject} ${reported} ${n(total)} ${noun}${asset}${qual}${when}, across ${n(months.length)} month${months.length === 1 ? "" : "s"}. The busiest was ${monthName(busiest.month)}, with ${n(busiest.count)}.${undatedNote}`;
    }
    case "late_share": {
      const share = result.lateShare;
      if (!share || share.total === 0) return none;
      return `${n(share.late)} of ${possessive === "Officials'" ? "the" : possessive} ${n(share.total)} ${tradeNoun(plan, share.total)}${asset}${when} (${share.percent} percent) were flagged as reported late.`;
    }
    case "first_last_dates": {
      const undated = result.undatedRows ?? 0;
      if (total === 0) return none;
      if (!result.firstDate || !result.lastDate) return `${subject} ${reported} ${n(total)} ${noun}${asset}${qual}${when}, none with a transaction date printed.`;
      const undatedNote = undated > 0 ? ` ${n(undated)} ${undated === 1 ? "has" : "have"} no transaction date printed and ${undated === 1 ? "is" : "are"} left out of that span.` : "";
      return `${possessive} ${tradeNoun(plan, 2)}${asset}${qual} run from ${formatDate(result.firstDate)} to ${formatDate(result.lastDate)}.${undatedNote}`;
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

/**
 * A useful zero. "Bessent reported no purchases" is a dead end; the same
 * rows without the type filter say "he reported 26 sales." Code-only, one
 * extra count, labeled as what it is.
 */
export function zeroHint(plan: QueryPlan, nearby: ExecuteResult | null): string {
  if (!nearby || nearby.matchedRows === 0) return "";
  const who = nearby.subjectOfficials ?? [];
  const subject = who.length === 1 ? who[0].name.split(" ").slice(-1)[0] : who.length > 1 ? "They" : "They";
  const n = nearby.matchedRows.toLocaleString("en-US");
  const noun = nearby.matchedRows === 1 ? "trade" : "trades";
  const asset = nearby.assetLabel ? ` in ${nearby.assetLabel}` : "";
  return ` ${subject} did report ${n} other ${noun}${asset} in that scope.`;
}
