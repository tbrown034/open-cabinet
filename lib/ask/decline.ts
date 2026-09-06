/**
 * Declines, written in code.
 *
 * The model used to write its own refusal sentence, and it wrote like a
 * chatbot: an em dash, a hedge, a short lecture about what a dataset is. The
 * site does not use em dashes and does not talk that way, so the model now
 * picks a category and nothing else. The sentence below is the site's.
 */

export const DECLINE_CATEGORIES = [
  "opinion_or_judgment",
  "not_about_trades",
  "injection_or_instruction",
  "unknown_person",
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
  unknown_person:
    "That name is not among the officials Open Cabinet tracks. The directory on the homepage lists everyone who is.",
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
