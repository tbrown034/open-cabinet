/**
 * Declines, written in code.
 *
 * The model used to write its own refusal sentence, and it wrote like a
 * chatbot: an em dash, a hedge, a short lecture about what a dataset is. The
 * site does not use em dashes and does not talk that way, so the model now
 * picks a category and nothing else. The sentence below is the site's.
 *
 * The "unknown person" category is deliberately neutral. Only the resolver,
 * which holds the roster, may say a name is not tracked. Codex found the
 * reason on Sept. 6: a model that picked that category declared the site's
 * largest official absent, skipping the roster and the pending counts. An
 * absence claim is a fact, and the model does not state facts. The route also
 * rescans the question against the roster before any decline is sent, so a
 * decline that names a tracked official never reaches a reader.
 */

export const DECLINE_CATEGORIES = [
  "opinion_or_judgment",
  "not_about_trades",
  "injection_or_instruction",
  "unknown_person",
  "unsupported_computation",
  "unsupported_filter",
  "needs_date_range",
  "no_prices_or_profit",
  "other",
] as const;

export type DeclineCategory = (typeof DECLINE_CATEGORIES)[number];

/**
 * What the box can do, appended to every decline so a reader who was told
 * no is told what to ask instead (Trevor, Sept. 7: "explain to the user
 * why and what's in scope").
 */
export const IN_SCOPE =
  "It can answer: which officials traded a company, an official's sales or purchases, " +
  "trades in a date range, trades flagged late, totals by disclosed range, and bonds, " +
  "ETFs or funds as a kind of asset.";

const DECLINE_TEXT: Record<DeclineCategory, string> = {
  opinion_or_judgment:
    "This box reports what the filings disclose. It cannot judge motives, legality, or whether a trade was proper, suspicious, good or bad, because the filings do not say and the box does not guess.",
  not_about_trades:
    "That is outside these records. The data is one thing: stock and bond transactions that executive-branch officials disclosed on OGE Form 278-T. It has no holdings, net worth, prices, biographies or news.",
  injection_or_instruction:
    "This box only answers questions about the disclosure data. It does not take instructions.",
  // Deliberately neutral. The model may say it failed to match a name; it may
  // not say the person is untracked, because it is not the thing that holds
  // the roster (Codex, Sept. 6). Before this sentence is ever sent, the route
  // rescans the question against the roster itself.
  unknown_person:
    "That name did not match a tracked official. The directory on the homepage is the list.",
  unsupported_computation:
    "This box counts, totals and lists checked trades. It does not compute averages, medians, ratios or growth, because a filing discloses a dollar range, not an amount; it can give a share only for late filings; and it compares at most five officials at a time.",
  unsupported_filter:
    "This box filters by official, symbol, trade type, date range, late flag, dollar bounds and kind of asset. It dates trades by the transaction date, not by when a filing was posted. It cannot exclude, require two assets at once, or pick by sector, weekday, party or agency.",
  needs_date_range:
    "Name the dates and this box will run it. It reads explicit dates, so write a range like Jan. 1, 2026 to March 31, 2026 instead of \"last month\" or \"right now\".",
  no_prices_or_profit:
    "The filings do not include prices, gains or losses. Each trade is disclosed as a dollar range (for example $15,001 to $50,000), with no purchase or sale price, so no one can tell from these records what a trade earned, which trade was best or worst, or whether anyone beat the market.",
  other:
    "That question cannot be answered from these records. Try naming an official, a company or a date range.",
};

export function isDeclineCategory(value: unknown): value is DeclineCategory {
  return (
    typeof value === "string" &&
    (DECLINE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function declineText(category: unknown): string {
  const base = isDeclineCategory(category) ? DECLINE_TEXT[category] : DECLINE_TEXT.other;
  // An instruction gets no help text; every other refusal says what to ask instead.
  return category === "injection_or_instruction" ? base : `${base} ${IN_SCOPE}`;
}

/**
 * Remove dashes from anything a reader sees, model prose and filing text
 * alike. A dash standing in for a full stop becomes one; anywhere else it
 * becomes a comma.
 */
export function stripDashes(text: string): string {
  // Em, en, horizontal bar and the typed double hyphen. Grok found the last
  // two surviving on Sept. 6: "41 rows -- more than any other" shipped intact.
  return text
    .replace(/\s*(?:[—–―]|--)\s*(?=[A-Z])/g, ". ")
    .replace(/\s*(?:[—–―]|--)\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}
