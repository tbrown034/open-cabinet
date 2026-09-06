/**
 * What the question is asking, decided in code before any model is called.
 *
 * The rule "if you cannot represent the question, decline instead of
 * approximating" lived only in a prompt, and a prompt is a request. Grok found
 * the consequences on Sept. 6: "Average trade size for Doug Burgum" shipped as
 * a headcount, "Largest sales by Doug Burgum" shipped as a date-sorted list.
 * Both looked finished. Answering a different question confidently is the
 * worst thing this box can do, so the phrases that name an unsupported shape
 * are now matched here, before the model is asked and before a token is spent.
 *
 * This is deliberately a phrase gate, not an understanding of the question. It
 * is meant to be over-eager: refusing a question the box could have answered
 * costs a reader one rephrase, while answering a question nobody asked costs
 * them a wrong fact with a citation under it.
 */
import type { Aggregate } from "./plan";
import type { DeclineCategory } from "./decline";

export type Intent =
  | { kind: "ok" }
  /** Force an aggregate the phrasing demands, whatever the model chose. */
  | { kind: "require_aggregate"; aggregate: Aggregate }
  /** Force a sort the phrasing demands. */
  | { kind: "require_sort"; sort: "amount" }
  | { kind: "decline"; category: DeclineCategory };

/** An average or a median over disclosed ranges is not a figure that exists. */
const AVERAGE = /\b(average|averages|averaged|mean|means|median|medians|typical|typically|per trade|per-trade|apiece|on average)\b/i;

/** A share of something. Only lateness has a denominator this box can name. */
const SHARE = /\b(percent|percentage|percentages|share|shares of|proportion|fraction|what portion|how often)\b/i;
const LATE = /\b(late|lateness|overdue|past the deadline|after the deadline|stock act deadline)\b/i;

/** Set subtraction. Every filter here is membership, never exclusion. */
const EXCLUSION = /\b(except|excepting|excluding|exclude|but not|other than|apart from|aside from|without|neither|nor|rather than)\b/i;

/** Intersection across assets. Filters are OR within a field, never AND. */
const BOTH_ASSETS = /\bboth\b[^.?!]*\b(and|&)\b/i;

/** Ranking by size, which needs a sort the plan has to carry explicitly. */
const BY_SIZE = /\b(largest|biggest|largest-value|most expensive|highest value|highest-value|priciest|top by value|biggest by value|by size|by value|smallest)\b/i;

export interface IntentCheck {
  intent: Intent;
  /** Which rule fired, for the log and for tests. */
  rule: string;
}

/**
 * Classify a question. Order matters: the most specific unsupported shape
 * wins, and a decline outranks a requirement.
 */
export function classifyIntent(question: string): IntentCheck {
  const q = question.trim();

  if (AVERAGE.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_computation" }, rule: "average" };
  }

  if (EXCLUSION.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_filter" }, rule: "exclusion" };
  }

  if (BOTH_ASSETS.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_filter" }, rule: "both_assets" };
  }

  if (SHARE.test(q)) {
    if (LATE.test(q)) {
      return { intent: { kind: "require_aggregate", aggregate: "late_share" }, rule: "late_share" };
    }
    return { intent: { kind: "decline", category: "unsupported_computation" }, rule: "share_not_late" };
  }

  if (BY_SIZE.test(q)) {
    return { intent: { kind: "require_sort", sort: "amount" }, rule: "by_size" };
  }

  return { intent: { kind: "ok" }, rule: "none" };
}
