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

export const AGGREGATES = [
  "count",
  "sum_estimate",
  "list",
  "top_officials",
  "top_assets",
  "by_month",
  "first_last_dates",
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

export interface QueryPlanFilters {
  /** Official slugs, after resolution. The model emits names; code resolves. */
  officials?: string[];
  tickers?: string[];
  descriptionContains?: string;
  types?: TransactionType[];
  dateFrom?: string;
  dateTo?: string;
  lateOnly?: boolean;
  /** Keep rows whose disclosed range floor is at least this many dollars. */
  amountAtLeast?: number;
}

export interface QueryPlan {
  filters: QueryPlanFilters;
  aggregate: Aggregate;
  limit?: number;
}

export type PlanParse =
  | { ok: true; plan: QueryPlan }
  | { ok: false; errors: string[] };

const FILTER_KEYS = new Set([
  "officials",
  "tickers",
  "descriptionContains",
  "types",
  "dateFrom",
  "dateTo",
  "lateOnly",
  "amountAtLeast",
]);

const PLAN_KEYS = new Set(["filters", "aggregate", "limit"]);

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
export function parseQueryPlan(input: unknown): PlanParse {
  const errors: string[] = [];
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
    if (rawFilters.descriptionContains !== undefined) {
      const value = rawFilters.descriptionContains;
      if (typeof value !== "string" || value.trim().length === 0) {
        errors.push("descriptionContains must be a non-empty string");
      } else if (value.length > 120) {
        errors.push("descriptionContains must be 120 characters or fewer");
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
    if (rawFilters.amountAtLeast !== undefined) {
      const value = rawFilters.amountAtLeast;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push("amountAtLeast must be a number of dollars, zero or more");
      } else {
        filters.amountAtLeast = value;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: { filters, aggregate: aggregate as Aggregate, limit } };
}

/** True when a plan narrows nothing at all. */
export function hasNoFilters(plan: QueryPlan): boolean {
  const f = plan.filters;
  return (
    !f.officials?.length &&
    !f.tickers?.length &&
    !f.descriptionContains &&
    !f.types?.length &&
    !f.dateFrom &&
    !f.dateTo &&
    !f.lateOnly &&
    f.amountAtLeast === undefined
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
    const byLast = officials.filter((o) => lastNameOf(o.filedName) === input);
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
      return {
        ok: false,
        reason: `no verified trade in this data names the symbol ${symbol}`,
        candidates: [],
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

/* ── Plain English ──────────────────────────────────────────────────────── */

const AGGREGATE_PHRASE: Record<Aggregate, string> = {
  count: "counted",
  sum_estimate: "totaled by estimated value",
  list: "listed",
  top_officials: "ranked by official",
  top_assets: "ranked by asset",
  by_month: "counted by month",
  first_last_dates: "reduced to the first and last dates",
};

/**
 * Restate the plan in a sentence, built in code from the validated fields.
 * The model never writes this line, so a reader can always see what was run.
 */
export function describePlan(plan: QueryPlan, officials: OfficialRef[]): string {
  const nameBySlug = new Map(officials.map((o) => [o.slug, o.name]));
  const f = plan.filters;
  const parts: string[] = [];

  const typeText = f.types && f.types.length > 0 ? f.types.join(" or ") + " rows" : "Trades";
  parts.push(f.lateOnly ? `${typeText} flagged late` : typeText);

  if (f.officials && f.officials.length > 0) {
    parts.push(`by ${f.officials.map((s) => nameBySlug.get(s) ?? s).join(", ")}`);
  }
  if (f.tickers && f.tickers.length > 0) {
    parts.push(`in ${f.tickers.join(", ")}`);
  }
  if (f.descriptionContains) {
    parts.push(`whose description mentions "${f.descriptionContains}"`);
  }
  if (f.amountAtLeast !== undefined) {
    parts.push(`with a disclosed range starting at $${f.amountAtLeast.toLocaleString("en-US")} or more`);
  }
  if (f.dateFrom && f.dateTo) parts.push(`between ${f.dateFrom} and ${f.dateTo}`);
  else if (f.dateFrom) parts.push(`on or after ${f.dateFrom}`);
  else if (f.dateTo) parts.push(`on or before ${f.dateTo}`);

  return `${parts.join(" ")}, ${AGGREGATE_PHRASE[plan.aggregate]}.`;
}
