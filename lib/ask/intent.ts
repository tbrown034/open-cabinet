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
  | { kind: "require_aggregate"; aggregate: Aggregate; sort?: "amount" | "amount_asc" }
  /** Force a sort the phrasing demands. */
  | { kind: "require_sort"; sort: "amount" | "amount_asc" }
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

/** "Who" or "which officials" asks for a ranking by official, whatever the model picked. */
const WHO = /^\s*(who|whom|which (officials?|cabinet (members?|secretaries)|secretaries|agency heads?|people|person))\b/i;

/** Ranking by size, which needs a sort the plan has to carry explicitly. */
const BY_SIZE = /\b(largest|biggest|largest-value|most expensive|highest value|highest-value|priciest|top by value|biggest by value|by size|by value)\b/i;
const BY_SIZE_ASC = /\b(smallest|cheapest|lowest value|lowest-value|least expensive|tiniest)\b/i;

/**
 * Rules added after the Sept. 7 red team (docs/grok-askai-redteam-2026-09-07.md),
 * which found that opinions, instructions, holdings and relative dates were
 * declined only by the model. A prompt is a request; these are rules.
 */
/** An instruction to the model rather than a question about the records. */
const INJECTION = /\b(ignore|disregard|forget|override)\b[^.?!]*\b(instructions?|rules?|prompt|guidelines?|previous|above)\b|\b(system prompt|your instructions|your rules|developer message)\b|\byou are (now|a|an)\b|\b(pretend|act as|roleplay|role-play|jailbreak|DAN)\b|\b(repeat|print|reveal|show|output)\b[^.?!]*\b(roster|prompt|instructions|verbatim|system)\b|\b(emit_plan|tool_choice|system note|as a system|calibration)\b/i;

/** Legality, propriety, motive: judgments the records cannot support. */
const JUDGMENT = /\b(illegal|legal|legally|lawful|unlawful|crime|criminal|corrupt|corruption|insider|bribe|unethical|ethical|ethics agreement|proper|improper|suspicious|shady|conflict of interest|should (he|she|they|have|[a-z]+ have)|why did|why does|why would|motive|motives|intend|intended|break (his|her|their) )\b/i;

/** Holdings, ownership and net worth: the 278-T is a transaction record. */
const HOLDINGS = /\b(own|owns|owned|ownership|holding|holdings|hold|holds|held|portfolio|net worth|networth|worth today|still (own|hold)|position in|stake in|divested everything|assets? (does|did) .* (have|own))\b/i;

/** A period relative to now. The plan carries explicit dates or none. */
const RELATIVE_DATE_STRICT = /\b(last|past|previous|this|next)\s+(\d+\s+)?(week|month|quarter|year|days|weeks|months|quarters|years)\b|\b(\d+\s+(days|weeks|months|years)\s+ago)\b|\b(year to date|ytd|so far this year|recently|lately)\b/i;

/** Comparison between named people, or an AND across two assets. */
const COMPARE = /\b(compare|comparison|versus|vs\.?|compared (to|with)|who traded more|who sold more|who bought more|outsold|outbought)\b|\b(more|less|fewer) than\b(?!\s*\$?\s*\d)/i;

/** The date a filing was posted is not a field; the plan dates trades. */
const FILING_DATE = /\b(disclosed|filed|reported|posted|published|submitted)\s+(in|on|during|between|after|before|since)\b|\bin the\b[^.?!]*\bfiling\b|\bfiling (of|from|dated)\b/i;

/** Day-of-week and holiday questions: the plan has dates, not calendars. */
const WEEKDAY = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|weekends|weekday|weekdays|holiday|holidays|christmas|thanksgiving)\b/i;

/** A sector or industry: the plan filters by symbol or asset kind, never by what a company does. */
const SECTOR = /\b(defen[cs]e|tech|technology|pharma|pharmaceutical|biotech|health\s?care|energy|oil|gas|bank|banking|financial|semiconductor|chip|retail|media|telecom|utility|utilities|real estate|airline|auto|automotive|mining|weapons|arms|tobacco|cannabis|gambling|fossil fuel)\s+(stocks?|companies|company|shares|firms|sector|industry|names|holdings|contractors?)\b|\b(sector|industry)\b/i;

/** Attributes the plan cannot filter on. */
const UNSUPPORTED_ATTRIBUTE = /\b(republican|republicans|democrat|democrats|gop|party|agency|agencies|department of|cabinet-level|women|men|youngest|oldest)\b/i;

/** Ratios and growth, beyond the eight aggregates. */
const RATIO_GROWTH = /\b(ratio|ratios|growth|grew|grow|year over year|year-over-year|yoy|trend|trending|rate of|per (month|year|week|official))\b/i;

/** Plainly not about these records. */
const OFF_TOPIC = /\b(weather|recipe|joke|poem|song|stock price|share price|price of|forecast|should i (buy|sell)|invest in|who is the (secretary|president|director|administrator|chairman)|what is (a|an|the) (stock act|278|oge)\b)/i;

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

  if (INJECTION.test(q)) {
    return { intent: { kind: "decline", category: "injection_or_instruction" }, rule: "injection" };
  }
  if (JUDGMENT.test(q)) {
    return { intent: { kind: "decline", category: "opinion_or_judgment" }, rule: "judgment" };
  }
  if (OFF_TOPIC.test(q)) {
    return { intent: { kind: "decline", category: "not_about_trades" }, rule: "off_topic" };
  }
  if (HOLDINGS.test(q)) {
    return { intent: { kind: "decline", category: "not_about_trades" }, rule: "holdings" };
  }
  if (RATIO_GROWTH.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_computation" }, rule: "ratio_growth" };
  }
  if (COMPARE.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_computation" }, rule: "compare" };
  }
  if (FILING_DATE.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_filter" }, rule: "filing_date" };
  }
  if (SECTOR.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_filter" }, rule: "sector" };
  }
  if (WEEKDAY.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_filter" }, rule: "weekday" };
  }
  if (UNSUPPORTED_ATTRIBUTE.test(q)) {
    return { intent: { kind: "decline", category: "unsupported_filter" }, rule: "attribute" };
  }
  if (RELATIVE_DATE_STRICT.test(q)) {
    return { intent: { kind: "decline", category: "needs_date_range" }, rule: "relative_date" };
  }

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

  if (WHO.test(q) && !/\bhow many\b/i.test(q)) {
    const sort = BY_SIZE.test(q) ? "amount" : BY_SIZE_ASC.test(q) ? "amount_asc" : undefined;
    return { intent: { kind: "require_aggregate", aggregate: "top_officials", ...(sort ? { sort } : {}) }, rule: "who" };
  }
  if (BY_SIZE_ASC.test(q)) {
    return { intent: { kind: "require_sort", sort: "amount_asc" }, rule: "by_size_asc" };
  }
  if (BY_SIZE.test(q)) {
    return { intent: { kind: "require_sort", sort: "amount" }, rule: "by_size" };
  }

  return { intent: { kind: "ok" }, rule: "none" };
}
