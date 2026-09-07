/**
 * The query plan: the only thing the model is allowed to produce.
 *
 * A question goes to a model once, and what comes back is not an answer. It is
 * a plan — a set of filters and one aggregate, in a fixed shape this file
 * validates field by field. Anything the validator does not recognize is
 * rejected outright rather than coerced, and a rejected plan never reaches the
 * data.
 *
 * The model may write official names and asset names the way a person would.
 * It may not write slugs, because it does not know them. The resolver here
 * turns names into slugs conservatively: an exact slug, an exact full name, or
 * a last name that belongs to exactly one official. A name that matches two
 * people, or none, is not guessed at — the question comes back as not_in_data
 * with the names it could have meant.
 *
 * Written by hand rather than with zod, which is not a dependency of this
 * repo. The checks below are exhaustive on purpose: every known key is typed,
 * and every unknown key is an error.
 */
import type { TransactionType } from "../types";
import type { OfficialRef } from "../published-rows";
import { INSTRUMENT_LABEL, type InstrumentType } from "../instrument-type";

/** The instrument types the plan may filter on, as the asset lane names them. */
export const INSTRUMENT_TYPES = Object.keys(INSTRUMENT_LABEL) as InstrumentType[];

export const AGGREGATES = [
  "count",
  "sum_estimate",
  "list",
  "top_officials",
  "top_assets",
  "by_month",
  "first_last_dates",
  "late_share",
] as const;

export type Aggregate = (typeof AGGREGATES)[number];

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  "Sale",
  "Sale (Partial)",
  "Sale (Full)",
  "Purchase",
  "Exchange",
  "Unstated",
];

export const MAX_LIMIT = 25;

/**
 * A comparison across a handful of named officials is a ranking. Past five
 * it is a table nobody asked for, and the box declines instead of guessing.
 */
export const MAX_OFFICIALS = 5;

export interface QueryPlanFilters {
  /** Official slugs, after resolution. The model emits names; code resolves. */
  officials?: string[];
  tickers?: string[];
  descriptionContains?: string;
  types?: TransactionType[];
  /** Instrument types from the asset lane: municipal_bond, corporate_note, etf, and so on. */
  instrumentTypes?: InstrumentType[];
  dateFrom?: string;
  dateTo?: string;
  lateOnly?: boolean;
  /** Keep rows whose disclosed range floor is at least this many dollars. */
  amountAtLeast?: number;
  /**
   * Keep rows whose disclosed range ceiling is at most this many dollars.
   * With amountAtLeast this reads as "the whole disclosed range sits inside
   * the window," which is the only reading a range can support. An
   * open-ended range has no ceiling and is excluded whenever this is set.
   */
  amountAtMost?: number;
}

export const SORTS = ["date", "amount", "amount_asc"] as const;
export type Sort = (typeof SORTS)[number];

export interface QueryPlan {
  filters: QueryPlanFilters;
  aggregate: Aggregate;
  limit?: number;
  /**
   * How a list is ordered. "date" is newest first, the order the rows are
   * stored in. "amount" is by the site's estimate for the disclosed range,
   * largest first, with unknown amounts last. A question about the largest
   * sales used to come back as a date-sorted list and read as an answer
   * (Grok, Sept. 6), so the ordering is now something the plan states.
   */
  sort?: Sort;
}

export type PlanParse =
  | { ok: true; plan: QueryPlan }
  | { ok: false; errors: string[] };

const FILTER_KEYS = new Set([
  "officials",
  "tickers",
  "descriptionContains",
  "instrumentTypes",
  "types",
  "dateFrom",
  "dateTo",
  "lateOnly",
  "amountAtLeast",
  "amountAtMost",
]);

const PLAN_KEYS = new Set(["filters", "aggregate", "limit", "sort"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function stringArray(
  value: unknown,
  field: string,
  errors: string[]
): string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of strings`);
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      errors.push(`${field} must contain only non-empty strings`);
      return undefined;
    }
    out.push(item.trim());
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Validate a raw plan from the model. Never throws, never coerces: an
 * unrecognized key or a wrong type is an error, and the caller declines.
 */
/** A strict-schema model fills unused fields with null; null means "not set". */
function withoutNulls(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null) continue;
    out[k] = isRecord(v) ? withoutNulls(v) : v;
  }
  return out;
}

export function parseQueryPlan(rawInput: unknown): PlanParse {
  const errors: string[] = [];
  const input = withoutNulls(rawInput);
  if (!isRecord(input)) return { ok: false, errors: ["plan must be an object"] };

  for (const key of Object.keys(input)) {
    if (!PLAN_KEYS.has(key)) errors.push(`unknown key "${key}" on plan`);
  }

  const aggregate = input.aggregate;
  if (typeof aggregate !== "string" || !(AGGREGATES as readonly string[]).includes(aggregate)) {
    errors.push(`aggregate must be one of ${AGGREGATES.join(", ")}`);
  }

  let limit: number | undefined;
  if (input.limit !== undefined) {
    if (typeof input.limit !== "number" || !Number.isInteger(input.limit)) {
      errors.push("limit must be a whole number");
    } else if (input.limit < 1 || input.limit > MAX_LIMIT) {
      errors.push(`limit must be between 1 and ${MAX_LIMIT}`);
    } else {
      limit = input.limit;
    }
  }

  let sort: Sort | undefined;
  if (input.sort !== undefined) {
    if (typeof input.sort !== "string" || !(SORTS as readonly string[]).includes(input.sort)) {
      errors.push(`sort must be one of ${SORTS.join(", ")}`);
    } else {
      sort = input.sort as Sort;
    }
  }

  const filters: QueryPlanFilters = {};
  const rawFilters = input.filters === undefined ? {} : input.filters;
  if (!isRecord(rawFilters)) {
    errors.push("filters must be an object");
  } else {
    for (const key of Object.keys(rawFilters)) {
      if (!FILTER_KEYS.has(key)) errors.push(`unknown filter "${key}"`);
    }

    if (rawFilters.officials !== undefined) {
      filters.officials = stringArray(rawFilters.officials, "officials", errors);
    }
    if (rawFilters.tickers !== undefined) {
      filters.tickers = stringArray(rawFilters.tickers, "tickers", errors);
    }
    if (rawFilters.instrumentTypes !== undefined) {
      const list = stringArray(rawFilters.instrumentTypes, "instrumentTypes", errors) ?? [];
      const bad = list.filter((t) => !(INSTRUMENT_TYPES as string[]).includes(t));
      if (bad.length > 0) errors.push(`instrumentTypes must be among ${INSTRUMENT_TYPES.join(", ")}`);
      else if (list.length > 0) filters.instrumentTypes = list as InstrumentType[];
    }
    if (rawFilters.descriptionContains !== undefined) {
      const value = rawFilters.descriptionContains;
      if (typeof value !== "string" || value.trim().length === 0) {
        errors.push("descriptionContains must be a non-empty string");
      } else if (value.length > 40) {
        errors.push("descriptionContains must be 40 characters or fewer");
      } else if (/\d{3,}/.test(value)) {
        // A search string is a name fragment; three digits in a row is a
        // figure, and a figure inside the restatement reads as a fact.
        errors.push("descriptionContains may not contain a number of three or more digits");
      } else if (!/^[\p{L}\p{N} .,&'()/-]+$/u.test(value.trim())) {
        // Letters, digits and the punctuation asset names use. Quotation
        // marks and sentence punctuation are refused so the value can never
        // read as prose inside a template (Codex, Sept. 7).
        errors.push("descriptionContains may contain only letters, digits, spaces and . , & ' ( ) / -");
      } else {
        filters.descriptionContains = value.trim();
      }
    }
    if (rawFilters.types !== undefined) {
      const list = stringArray(rawFilters.types, "types", errors);
      if (list) {
        const bad = list.filter((t) => !(TRANSACTION_TYPES as readonly string[]).includes(t));
        if (bad.length > 0) {
          errors.push(`unknown transaction type: ${bad.join(", ")}`);
        } else {
          filters.types = list as TransactionType[];
        }
      }
    }
    for (const field of ["dateFrom", "dateTo"] as const) {
      const value = rawFilters[field];
      if (value === undefined) continue;
      if (typeof value !== "string" || !isValidIsoDate(value)) {
        errors.push(`${field} must be an ISO date, YYYY-MM-DD`);
      } else {
        filters[field] = value;
      }
    }
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      errors.push("dateFrom must not be after dateTo");
    }
    if (rawFilters.lateOnly !== undefined) {
      if (typeof rawFilters.lateOnly !== "boolean") {
        errors.push("lateOnly must be true or false");
      } else if (rawFilters.lateOnly) {
        filters.lateOnly = true;
      }
    }
    for (const field of ["amountAtLeast", "amountAtMost"] as const) {
      const value = rawFilters[field];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push(`${field} must be a number of dollars, zero or more`);
      } else {
        filters[field] = value;
      }
    }
    if (
      filters.amountAtLeast !== undefined &&
      filters.amountAtMost !== undefined &&
      filters.amountAtLeast > filters.amountAtMost
    ) {
      errors.push("amountAtLeast must not be above amountAtMost");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: { filters, aggregate: aggregate as Aggregate, limit, sort } };
}

/** True when a plan narrows nothing at all. */
export function hasNoFilters(plan: QueryPlan): boolean {
  const f = plan.filters;
  return (
    !f.officials?.length &&
    !f.tickers?.length &&
    !f.descriptionContains &&
    !(f.instrumentTypes && f.instrumentTypes.length > 0) &&
    !f.types?.length &&
    !f.dateFrom &&
    !f.dateTo &&
    !f.lateOnly &&
    f.amountAtLeast === undefined &&
    f.amountAtMost === undefined
  );
}

/**
 * A bare "trades" used to come back as a list of whatever sat at the top of
 * the array, which the phraser then narrated as though the rows were a
 * finding. An unfiltered question gets a count instead; the reader can filter
 * from there.
 */
export function normalizePlan(plan: QueryPlan): QueryPlan {
  if (plan.aggregate === "list" && hasNoFilters(plan)) {
    return { ...plan, aggregate: "count", limit: undefined };
  }
  // A share of late filings needs the whole set as its denominator. A
  // lateOnly filter would make the answer 100% by construction, so it goes.
  if (plan.aggregate === "late_share" && plan.filters.lateOnly) {
    const { lateOnly, ...rest } = plan.filters;
    void lateOnly;
    return { ...plan, filters: rest };
  }
  return plan;
}

/* ── Resolution ─────────────────────────────────────────────────────────── */

export type Resolution<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; candidates: string[] };

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Short forms readers and models actually write. Grok's Sept. 6 table: "Doug
 * Burgum", "Chris Wright" and "Robert Kennedy" all failed against filed names
 * that carry a middle initial or a longer first name, and the reader got the
 * absence sentence, which is the one claim this box may not make.
 *
 * "Sean" and "Shawn" are deliberately absent: they are different names, not
 * two spellings of one, and guessing between them is exactly the kind of
 * confidence this resolver refuses.
 */
const SHORT_FORMS: Record<string, string[]> = {
  doug: ["douglas"],
  chris: ["christopher"],
  bob: ["robert"],
  bobby: ["robert"],
  rob: ["robert"],
  robert: ["bob", "bobby"],
  mike: ["michael"],
  jim: ["james"],
  jimmy: ["james"],
  steve: ["stephen", "steven"],
  tom: ["thomas"],
  dan: ["daniel"],
  danny: ["daniel"],
  ed: ["edward"],
  eddie: ["edward"],
  ken: ["kenneth"],
  bill: ["william"],
  billy: ["william"],
  will: ["william"],
  pete: ["peter"],
  matt: ["matthew"],
  dave: ["david"],
  joe: ["joseph"],
  tony: ["anthony"],
  rick: ["richard"],
  dick: ["richard"],
  nick: ["nicholas"],
  greg: ["gregory"],
  jeff: ["jeffrey"],
  andy: ["andrew"],
  chuck: ["charles"],
  charlie: ["charles"],
};

/** Honorifics a reader puts in front of a name. Not part of the name. */
const HONORIFIC =
  /^(?:president|vice president|secretary|sec|senator|sen|governor|gov|administrator|director|ambassador|attorney general|justice|judge|mr|mrs|ms|dr)\s+/i;

function stripHonorific(name: string): string {
  // Normalize first so punctuation and case cannot hide the honorific:
  // "President Trump" and "Sec. Burgum" both have to lose their title.
  return normalizeName(name).replace(HONORIFIC, "").trim();
}

/** Every token of a filed name: "Trump, Donald J" -> [donald, j, trump]. */
function nameTokens(filedName: string): string[] {
  const comma = filedName.indexOf(",");
  const normalized =
    comma > 0
      ? normalizeName(`${filedName.slice(comma + 1)} ${filedName.slice(0, comma)}`)
      : normalizeName(filedName);
  return normalized.split(" ").filter(Boolean);
}

/** Does one written token stand for one token of the filed name? */
function tokenMatches(written: string, filed: string): boolean {
  if (written === filed) return true;
  if (SHORT_FORMS[written]?.includes(filed)) return true;
  if (SHORT_FORMS[filed]?.includes(written)) return true;
  // A hyphenated surname answers to either half: "Chavez" for
  // "Chavez-DeRemer", when only one official has that half.
  if (filed.includes(" ") && filed.split(" ").includes(written)) return true;
  return false;
}

/**
 * A written name matches a filed name when every token the reader wrote finds
 * a distinct token of the filed name, the surname included. That accepts
 * "Doug Burgum" for "Burgum, Douglas J" and "President Trump" for "Trump,
 * Donald J" without accepting a first name on its own.
 */
function looseNameMatches(written: string, official: OfficialRef): boolean {
  const wrote = stripHonorific(written).split(" ").filter(Boolean);
  if (wrote.length < 2) return false;
  const filed = nameTokens(official.filedName);
  const surname = filed[filed.length - 1];
  // The surname has to be one of the tokens written, or this is a guess.
  if (!wrote.some((w) => tokenMatches(w, surname))) return false;

  const remaining = [...filed];
  for (const token of wrote) {
    const index = remaining.findIndex((f) => tokenMatches(token, f));
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function lastNameOf(filedName: string): string {
  // Stored as "Last, First Middle"; fall back to the final word.
  const comma = filedName.indexOf(",");
  if (comma > 0) return normalizeName(filedName.slice(0, comma));
  const parts = normalizeName(filedName).split(" ");
  return parts[parts.length - 1] ?? "";
}

/**
 * Turn the names a model wrote into slugs. Exact slug, exact full name in
 * either order, or a last name held by exactly one official. Anything else
 * is refused with the names it might have meant.
 */
export function resolveOfficials(
  inputs: string[],
  officials: OfficialRef[]
): Resolution<string[]> {
  const slugs = new Set<string>();
  for (const raw of inputs) {
    const input = normalizeName(raw);
    const bySlug = officials.find((o) => o.slug === raw.trim().toLowerCase());
    if (bySlug) {
      slugs.add(bySlug.slug);
      continue;
    }
    const exact = officials.filter((o) => {
      const display = normalizeName(o.name);
      const filed = normalizeName(o.filedName);
      const reversed = filed.split(" ").reverse().join(" ");
      return display === input || filed === input || reversed === input;
    });
    if (exact.length === 1) {
      slugs.add(exact[0].slug);
      continue;
    }
    if (exact.length > 1) {
      return {
        ok: false,
        reason: `"${raw}" matches more than one official`,
        candidates: exact.map((o) => o.name),
      };
    }
    // Loose match before surname-only: "Doug Burgum" is more specific than
    // "Burgum", and a reader who writes both names deserves the better match.
    const loose = officials.filter((o) => looseNameMatches(raw, o));
    if (loose.length === 1) {
      slugs.add(loose[0].slug);
      continue;
    }
    if (loose.length > 1) {
      return {
        ok: false,
        reason: `"${raw}" could mean more than one official`,
        candidates: loose.map((o) => o.name),
      };
    }

    const surnameInput = stripHonorific(raw);
    const byLast = officials.filter((o) => {
      const surname = lastNameOf(o.filedName);
      if (surname === surnameInput) return true;
      // Either half of a hyphenated surname, when it is unambiguous.
      return surname.includes(" ") && surname.split(" ").includes(surnameInput);
    });
    if (byLast.length === 1) {
      slugs.add(byLast[0].slug);
      continue;
    }
    if (byLast.length > 1) {
      return {
        ok: false,
        reason: `"${raw}" could mean more than one official`,
        candidates: byLast.map((o) => o.name),
      };
    }
    // The roster is the whole officials index, so an unmatched name really
    // is not tracked. Listing a dozen arbitrary officials would not help, so
    // the caller points at the directory instead.
    return {
      ok: false,
      reason: `"${raw}" is not among the officials Open Cabinet tracks`,
      candidates: [],
    };
  }
  return { ok: true, value: Array.from(slugs) };
}

/** Uppercase and confirm each symbol actually appears in the published rows. */
export function resolveTickers(
  inputs: string[],
  available: Iterable<string>
): Resolution<string[]> {
  const set = new Set(Array.from(available, (t) => t.toUpperCase()));
  const out = new Set<string>();
  for (const raw of inputs) {
    const symbol = raw.trim().toUpperCase();
    if (!set.has(symbol)) {
      // Another class of the same issuer (BRK.A asked, BRK.B in the data)
      // is offered, never substituted (Codex, Sept. 7: contradictory classes).
      const root = symbol.replace(/[.-][A-Z]$/, "");
      const siblings = Array.from(set).filter((t) => t !== symbol && t.replace(/[.-][A-Z]$/, "") === root && root.length >= 2);
      return {
        ok: false,
        reason: `No checked trade in this data names the symbol ${symbol}`,
        candidates: siblings.sort(),
      };
    }
    out.add(symbol);
  }
  return { ok: true, value: Array.from(out) };
}

/**
 * Resolve a whole plan. Returns a plan whose officials and tickers are known
 * to exist, or the reason it could not.
 */
export function resolvePlan(
  plan: QueryPlan,
  officials: OfficialRef[],
  tickers: Iterable<string>
): Resolution<QueryPlan> {
  const filters: QueryPlanFilters = { ...plan.filters };
  if (filters.officials) {
    const resolved = resolveOfficials(filters.officials, officials);
    if (!resolved.ok) return resolved;
    filters.officials = resolved.value;
  }
  if (filters.tickers) {
    const resolved = resolveTickers(filters.tickers, tickers);
    if (!resolved.ok) return resolved;
    filters.tickers = resolved.value;
  }
  return { ok: true, value: { ...plan, filters } };
}

/**
 * Find any tracked official the question names, without a model.
 *
 * The last line of defence against a decline that hides a real person. A model
 * that picks "unknown person" for a question naming the site's largest
 * official would otherwise have the last word (Codex, Sept. 6). Surnames only,
 * matched on word boundaries, longest first so "Trump" inside a longer name
 * does not win over the longer match.
 */
export function officialsNamedIn(
  question: string,
  officials: OfficialRef[]
): OfficialRef[] {
  const haystack = normalizeName(question);
  const hits: OfficialRef[] = [];
  for (const official of officials) {
    const surname = lastNameOf(official.filedName);
    if (surname.length < 4) continue;
    if (new RegExp(`\\b${surname}\\b`).test(haystack)) hits.push(official);
  }
  return hits.sort(
    (a, b) => lastNameOf(b.filedName).length - lastNameOf(a.filedName).length
  );
}

/* ── Plain English ──────────────────────────────────────────────────────── */

const AGGREGATE_PHRASE: Record<Aggregate, string> = {
  count: "counted",
  sum_estimate: "totaled by estimated value",
  list: "listed",
  top_officials: "ranked by official",
  top_assets: "ranked by asset",
  by_month: "counted by month",
  first_last_dates: "reduced to the first and last dates",
  late_share: "measured for the share flagged late",
};

/**
 * Restate the plan in a sentence, built in code from the validated fields.
 * The model never writes this line, so a reader can always see what was run.
 */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function describePlan(plan: QueryPlan, officials: OfficialRef[]): string {
  const bySlug = new Map(officials.map((o) => [o.slug, o]));
  const f = plan.filters;
  const parts: string[] = [];

  const typeText = f.types && f.types.length > 0 ? f.types.join(" or ") + " rows" : "Trades";
  parts.push(f.lateOnly ? `${typeText} flagged late` : typeText);

  if (f.officials && f.officials.length > 0) {
    // A holdover's rows are in scope, so the restatement says which people
    // are former rather than leaving a reader to assume a current seat.
    const names = f.officials.map((slug) => {
      const official = bySlug.get(slug);
      if (!official) return slug;
      return official.former ? `${official.name} (former)` : official.name;
    });
    parts.push(`by ${joinNames(names)}`);
  }
  if (f.tickers && f.tickers.length > 0) {
    parts.push(`in ${f.tickers.join(", ")}`);
  }
  if (f.instrumentTypes && f.instrumentTypes.length > 0) {
    parts.push(`typed as ${f.instrumentTypes.map((t) => INSTRUMENT_LABEL[t].toLowerCase()).join(" or ")}`);
  }
  if (f.descriptionContains) {
    parts.push(`whose description mentions the text ${f.descriptionContains.toUpperCase()}`);
  }
  // Both bounds are named, and the wording says what a bound means against a
  // range: the disclosed range has to sit inside the window, not overlap it.
  const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (f.amountAtLeast !== undefined && f.amountAtMost !== undefined) {
    parts.push(
      `whose disclosed range falls entirely between ${dollars(f.amountAtLeast)} and ${dollars(f.amountAtMost)}`
    );
  } else if (f.amountAtLeast !== undefined) {
    parts.push(`whose disclosed range starts at ${dollars(f.amountAtLeast)} or more`);
  } else if (f.amountAtMost !== undefined) {
    parts.push(`whose disclosed range tops out at ${dollars(f.amountAtMost)} or less`);
  }
  if (f.dateFrom && f.dateTo) parts.push(`between ${f.dateFrom} and ${f.dateTo}`);
  else if (f.dateFrom) parts.push(`on or after ${f.dateFrom}`);
  else if (f.dateTo) parts.push(`on or before ${f.dateTo}`);

  const ordering =
    plan.sort === "amount"
      ? ", largest disclosed range first"
      : plan.sort === "amount_asc"
      ? ", smallest disclosed range first"
      : plan.aggregate === "list"
        ? ", newest first"
        : "";
  return `${parts.join(" ")}, ${AGGREGATE_PHRASE[plan.aggregate]}${ordering}.`;
}

/* ── Does the plan answer the question that was asked? ─────────────────── */

/**
 * Cheap correspondence checks between the question's own words and the
 * resolved plan (Codex, Sept. 7: "validation checks whether a plan is
 * executable, not whether it preserves the question"). Each rule names one
 * thing the question plainly asked for that the plan dropped or invented.
 * A mismatch means "not translated", never a substitute answer.
 */
/** Levenshtein distance, small strings only. */
function editDistance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const GENERIC_TITLE_WORDS = new Set(["secretary", "deputy", "director", "administrator", "assistant", "office", "department", "united", "states", "president", "chairman", "commissioner", "executive", "general", "counsel", "under", "former", "acting", "board", "federal", "national"]);

export function planCorrespondence(
  question: string,
  plan: QueryPlan,
  officials: OfficialRef[]
): { ok: true } | { ok: false; reason: string } {
  const q = question;
  const f = plan.filters;

  // A four-digit year in the question must survive as a date bound in that year.
  const years = [...q.matchAll(/\b(20[0-3]\d)\b/g)].map((m) => m[1]);
  if (years.length > 0) {
    const bounds = [f.dateFrom, f.dateTo].filter((d): d is string => !!d);
    const covered = years.every((y) => bounds.some((d) => d.startsWith(y)));
    if (!covered) return { ok: false, reason: `the question names ${years.join(" and ")} but the query carries no date bound in that year` };
  }

  // Dollar bounds only when the question talks money.
  const money = /\$|\bdollars?\b|\b\d+\s?(k|m|million|thousand|billion)\b|\b(over|under|above|below|at least|at most|more than|less than|between|worth|value|valued)\b/i.test(q);
  if ((f.amountAtLeast !== undefined || f.amountAtMost !== undefined) && !money) {
    return { ok: false, reason: "the query carries a dollar bound the question did not ask for" };
  }
  // A dollar ceiling nobody would type is a filled-in placeholder, not a filter.
  if (f.amountAtMost !== undefined && f.amountAtMost >= 1e9) {
    return { ok: false, reason: "the query carries a dollar ceiling the question did not ask for" };
  }

  // "Late" in the question must reach the plan.
  if (/\blate\b|\boverdue\b|\bpast the deadline\b/i.test(q) && !f.lateOnly && plan.aggregate !== "late_share") {
    return { ok: false, reason: "the question asks about late trades but the query does not filter on the late flag" };
  }

  // Every tracked person the question names must be in the plan, and the
  // plan must not name a person the question did not.
  const named = officialsNamedIn(q, officials).map((o) => o.slug);
  const planned = f.officials ?? [];
  for (const slug of named) {
    if (!planned.includes(slug)) return { ok: false, reason: "the query dropped an official the question named" };
  }
  for (const slug of planned) {
    if (!named.includes(slug)) {
      const o = officials.find((x) => x.slug === slug);
      // Allow a first-name-only or nickname match the surname scan missed;
      // reject only when nothing in the question resembles the person.
      const hay = normalizeName(q);
      const first = (o?.name ?? "").split(" ")[0].toLowerCase();
      const surname = o ? lastNameOf(o.filedName) : "";
      // A title or agency word also counts: "the energy secretary" is
      // Christopher Wright, and the model was right to say so.
      const titleWords = `${o?.title ?? ""} ${o?.agency ?? ""}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 5 && !GENERIC_TITLE_WORDS.has(w));
      // Initials too: "RFK" is Robert F Kennedy.
      const initials = (o?.name ?? "").split(/\s+/).map((w) => w[0]?.toLowerCase() ?? "").join("");
      // A misspelling within two edits of the surname ("lutnik", "bessant")
      // still names the person; the model resolved it and the check agrees.
      const tokens = hay.split(/[^a-z]+/).filter((t) => t.length >= 4);
      const nearSurname = surname.length >= 5 && tokens.some((t) => editDistance(t, surname) <= 2);
      const mentioned =
        nearSurname ||
        (initials.length >= 3 && new RegExp(`\\b${initials}\\b`).test(hay)) ||
        (first.length >= 3 && hay.includes(first)) ||
        (surname.length >= 4 && hay.includes(surname)) ||
        titleWords.some((w) => new RegExp(`\\b${w}\\b`).test(hay));
      if (!mentioned) return { ok: false, reason: "the query names an official the question did not" };
    }
  }

  return { ok: true };
}

/* ── The query line a reader sees ───────────────────────────────────────── */

/**
 * The same plan, in the words the answer sentence uses: "Sales of Liberty
 * Energy Inc. (LBRT) by Christopher Wright, flagged late, between Jan. 1 and
 * March 31, 2026, ranked by official." describePlan stays as the precise
 * form for the log and the phraser.
 */
export function describePlanForReader(plan: QueryPlan, officials: OfficialRef[], assetLabel: string | null): string {
  const bySlug = new Map(officials.map((o) => [o.slug, o]));
  const f = plan.filters;
  const types = f.types ?? [];
  const noun =
    types.length > 0 && types.every((t) => t.startsWith("Sale")) ? "Sales"
    : types.length > 0 && types.every((t) => t === "Purchase") ? "Purchases"
    : types.length > 0 && types.every((t) => t === "Exchange") ? "Exchanges"
    : "Trades";
  const parts: string[] = [noun];
  if (assetLabel) parts.push(`of ${assetLabel}`);
  if (f.officials && f.officials.length > 0) {
    const names = f.officials.map((slug) => { const o = bySlug.get(slug); return o ? (o.former ? `${o.name} (former)` : o.name) : slug; });
    parts.push(`by ${joinNames(names)}`);
  }
  if (f.lateOnly) parts.push("flagged as reported late");
  const dollars = (v: number) => `$${v.toLocaleString("en-US")}`;
  if (f.amountAtLeast !== undefined && f.amountAtMost !== undefined) parts.push(`with a disclosed range inside ${dollars(f.amountAtLeast)} to ${dollars(f.amountAtMost)}`);
  else if (f.amountAtLeast !== undefined) parts.push(`with a disclosed range starting at ${dollars(f.amountAtLeast)} or more`);
  else if (f.amountAtMost !== undefined) parts.push(`with a disclosed range ending at ${dollars(f.amountAtMost)} or less`);
  const fd = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (f.dateFrom && f.dateTo) parts.push(`between ${fd(f.dateFrom)} and ${fd(f.dateTo)}`);
  else if (f.dateFrom) parts.push(`since ${fd(f.dateFrom)}`);
  else if (f.dateTo) parts.push(`through ${fd(f.dateTo)}`);
  const how: Record<Aggregate, string> = {
    count: "counted",
    sum_estimate: "totaled by estimated value",
    list: plan.sort === "amount" ? "listed largest first" : plan.sort === "amount_asc" ? "listed smallest first" : "listed newest first",
    top_officials: plan.sort === "amount" ? "ranked by official by estimated value" : "ranked by official",
    top_assets: "ranked by asset",
    by_month: "counted by month",
    late_share: "measured for the share flagged late",
    first_last_dates: "first and last dates",
  };
  return `${parts.join(" ")}, ${how[plan.aggregate]}.`;
}

/* ── Follow-ups a reader can click ──────────────────────────────────────── */

export interface FollowUp {
  label: string;
  plan: QueryPlan;
}

/**
 * One-click variations of the plan that just ran, each a plan the code
 * built, so none of them needs the model. Only variations that change
 * something are offered.
 */
export function followUpsFor(plan: QueryPlan, today: string): FollowUp[] {
  const f = plan.filters;
  const out: FollowUp[] = [];
  const types = f.types ?? [];
  const isSales = types.length > 0 && types.every((t) => t.startsWith("Sale"));
  const isBuys = types.length > 0 && types.every((t) => t === "Purchase");
  if (!isBuys) out.push({ label: "Only purchases", plan: { ...plan, filters: { ...f, types: ["Purchase"] } } });
  if (!isSales) out.push({ label: "Only sales", plan: { ...plan, filters: { ...f, types: ["Sale", "Sale (Partial)", "Sale (Full)"] } } });
  if (!f.lateOnly) out.push({ label: "Only those flagged late", plan: { ...plan, filters: { ...f, lateOnly: true } } });
  else out.push({ label: "Late or not", plan: { ...plan, filters: { ...f, lateOnly: undefined } } });
  const year = today.slice(0, 4);
  if (!f.dateFrom && !f.dateTo) out.push({ label: `Just ${year}`, plan: { ...plan, filters: { ...f, dateFrom: `${year}-01-01`, dateTo: today } } });
  else out.push({ label: "Any date", plan: { ...plan, filters: { ...f, dateFrom: undefined, dateTo: undefined } } });
  if (plan.aggregate !== "top_officials") out.push({ label: "Rank by official", plan: { ...plan, aggregate: "top_officials", sort: undefined } });
  if (plan.aggregate !== "top_assets" && (f.officials?.length ?? 0) > 0) out.push({ label: "Rank by asset", plan: { ...plan, aggregate: "top_assets", sort: undefined } });
  if (plan.aggregate !== "sum_estimate") out.push({ label: "Total by estimated value", plan: { ...plan, aggregate: "sum_estimate", sort: undefined } });
  if (plan.aggregate !== "list") out.push({ label: "List the trades", plan: { ...plan, aggregate: "list", limit: 25 } });
  if (plan.aggregate !== "by_month") out.push({ label: "By month", plan: { ...plan, aggregate: "by_month", sort: undefined } });
  return out.slice(0, 6);
}
