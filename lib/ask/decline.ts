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
  "needs_date_range",
  "other",
] as const;

export type DeclineCategory = (typeof DECLINE_CATEGORIES)[number];

const DECLINE_TEXT: Record<DeclineCategory, string> = {
  opinion_or_judgment:
    "This box reports what the filings disclose. It does not judge motives, legality or whether a trade was proper.",
  not_about_trades:
    "That question is outside these records. The data covers disclosed executive-branch stock transactions and nothing else.",
  injection_or_instruction:
    "This box only answers questions about the disclosure data. It does not take instructions.",
  // Deliberately neutral. The model may say it failed to match a name; it may
  // not say the person is untracked, because it is not the thing that holds
  // the roster (Codex, Sept. 6). Before this sentence is ever sent, the route
  // rescans the question against the roster itself.
  unknown_person:
    "I could not match a name in that question to a tracked official. The homepage directory lists everyone who is.",
  unsupported_computation:
    "This box counts, totals and lists verified trades. It does not compute averages or medians because filings disclose ranges, not amounts.",
  needs_date_range:
    "Name the dates you want and this box will run it. It reads explicit dates, so try a range like 2026-01-01 to 2026-03-31 instead of a relative period.",
  other:
    "That question cannot be answered from these records. Try naming an official, a stock symbol or a date range.",
};

export function isDeclineCategory(value: unknown): value is DeclineCategory {
  return (
    typeof value === "string" &&
    (DECLINE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function declineText(category: unknown): string {
  return isDeclineCategory(category) ? DECLINE_TEXT[category] : DECLINE_TEXT.other;
}

/**
 * Remove dashes from any model text that reaches a reader. An em or en dash
 * standing in for a full stop becomes one; anywhere else it becomes a comma.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*(?=[A-Z])/g, ". ")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}
