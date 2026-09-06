import { describe, it, expect } from "vitest";
import {
  extractNumberTokens,
  canonicalizeToken,
  checkAnswerNumbers,
  checkAnswerLanguage,
  templateAnswer,
  pendingAnswer,
} from "./check";
import { stripDashes } from "./decline";
import type { ExecuteResult } from "./execute";

const COUNT_RESULT: ExecuteResult = {
  aggregate: "count",
  matchedRows: 142,
  count: 142,
  numbers: [142],
  displayStrings: ["142"],
};

const SUM_RESULT: ExecuteResult = {
  aggregate: "sum_estimate",
  matchedRows: 31,
  totals: {
    estimate: 4_500_000,
    estimateDisplay: "$4,500,000",
    estimateCompact: "$4.5M",
    knownCount: 28,
    unknownCount: 3,
    openEndedCount: 0,
  },
  numbers: [31, 4_500_000, 28, 3, 0],
  displayStrings: ["31", "$4,500,000", "$4.5M", "$4.5 million", "28", "3", "0"],
};

describe("extractNumberTokens", () => {
  it("finds money, plain counts and scaled figures", () => {
    expect(extractNumberTokens("142 trades worth $4.5 million, or $4,500,000.")).toEqual([
      "142",
      "$4.5 million",
      "$4,500,000",
    ]);
  });

  it("finds the parts of an ISO date", () => {
    expect(extractNumberTokens("between 2025-01-01 and 2025-06-30")).toEqual([
      "2025",
      "01",
      "01",
      "2025",
      "06",
      "30",
    ]);
  });

  it("does not swallow the comma after a figure", () => {
    expect(extractNumberTokens("On 2026-12-31, the count was 227.")).toEqual([
      "2026",
      "12",
      "31",
      "227",
    ]);
  });

  it("returns nothing for a sentence with no figures", () => {
    expect(extractNumberTokens("No verified row matches that query.")).toEqual([]);
  });
});

describe("canonicalizeToken", () => {
  it("reduces every spelling of one figure to the same value", () => {
    expect(canonicalizeToken("$4.5 million")).toBe("4500000");
    expect(canonicalizeToken("4,500,000")).toBe("4500000");
    expect(canonicalizeToken("$4500000")).toBe("4500000");
  });

  it("keeps percentages distinct", () => {
    expect(canonicalizeToken("12%")).toBe("12%");
    expect(canonicalizeToken("12 percent")).toBe("12%");
    expect(canonicalizeToken("12")).toBe("12");
  });
});

describe("checkAnswerNumbers", () => {
  it("passes a sentence whose figures are all in the result", () => {
    const check = checkAnswerNumbers("The query matches 142 verified rows.", COUNT_RESULT);
    expect(check).toEqual({ ok: true, unmatched: [] });
  });

  it("passes a sentence with no figures at all", () => {
    expect(checkAnswerNumbers("No verified row matches that query.", COUNT_RESULT).ok).toBe(true);
  });

  it("fails a figure the result never produced", () => {
    const check = checkAnswerNumbers("The query matches 143 verified rows.", COUNT_RESULT);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["143"]);
  });

  it("fails a plausible figure invented alongside a real one", () => {
    const check = checkAnswerNumbers(
      "The 142 rows were spread across 9 officials.",
      COUNT_RESULT
    );
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["9"]);
  });

  it("allows a rounding the executor itself produced", () => {
    expect(checkAnswerNumbers("They estimate to $4.5 million.", SUM_RESULT).ok).toBe(true);
    expect(checkAnswerNumbers("They estimate to $4,500,000.", SUM_RESULT).ok).toBe(true);
  });

  it("rejects a rounding the executor did not produce", () => {
    const check = checkAnswerNumbers("They estimate to about $5 million.", SUM_RESULT);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["$5 million"]);
  });

  it("rejects a share the executor never computed", () => {
    const check = checkAnswerNumbers("That is 19% of all disclosed trades.", SUM_RESULT);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["19%"]);
  });
});

describe("templateAnswer", () => {
  it("builds a count sentence from the result", () => {
    const answer = templateAnswer(
      { filters: {}, aggregate: "count" },
      "Trades, counted.",
      COUNT_RESULT
    );
    expect(answer).toBe("Trades, counted. That query matches 142 verified rows.");
  });

  it("names the excluded unknown-amount rows in a sum sentence", () => {
    const answer = templateAnswer(
      { filters: {}, aggregate: "sum_estimate" },
      "Trades, totaled by estimated value.",
      SUM_RESULT
    );
    expect(answer).toContain("$4,500,000");
    expect(answer).toContain("3 rows with no stated value are excluded");
  });

  it("passes its own number check", () => {
    const answer = templateAnswer(
      { filters: {}, aggregate: "sum_estimate" },
      "Trades, totaled by estimated value.",
      SUM_RESULT
    );
    expect(checkAnswerNumbers(answer, SUM_RESULT).ok).toBe(true);
  });
});

describe("checkAnswerLanguage", () => {
  it("accepts a sentence that qualifies its count as verified", () => {
    expect(checkAnswerLanguage("The query matches 142 verified rows.")).toEqual({
      ok: true,
      problems: [],
    });
  });

  it("rejects a sentence missing the word verified", () => {
    const check = checkAnswerLanguage("The query matches 142 rows.");
    expect(check.ok).toBe(false);
    expect(check.problems).toContain("missing the word verified");
  });

  it("rejects 'all', the live overclaim", () => {
    // Shipped once as "accounted for all 41 disclosed sale transactions."
    const check = checkAnswerLanguage(
      "Christopher Wright accounted for all 41 verified sale transactions."
    );
    expect(check.ok).toBe(false);
    expect(check.problems).toContain("all");
  });

  it("rejects every other completeness word", () => {
    for (const [text, word] of [
      ["Every verified row was late.", "every"],
      ["The verified total was 41.", "total"],
      ["There are 299 verified trades on file.", "on file"],
      ["This is the complete verified set.", "complete"],
      ["The entire verified record shows 41.", "entire"],
      ["Disclosure records show 299 verified trades.", "disclosure records show"],
      ["The most recent verified rows are listed.", "most recent"],
    ] as const) {
      const check = checkAnswerLanguage(text);
      expect(check.ok, text).toBe(false);
      expect(check.problems, text).toContain(word);
    }
  });

  it("does not trip on words that merely contain a banned word", () => {
    expect(checkAnswerLanguage("The verified rows totaled by month are shown.").ok).toBe(true);
  });
});

describe("stripDashes", () => {
  it("replaces an em dash before a capital with a full stop", () => {
    expect(stripDashes("It cannot be determined—The dataset only holds filings.")).toBe(
      "It cannot be determined. The dataset only holds filings."
    );
  });

  it("replaces a mid-clause em dash with a comma", () => {
    expect(stripDashes("41 verified rows—more than any other official.")).toBe(
      "41 verified rows, more than any other official."
    );
  });

  it("handles en dashes too and leaves clean text alone", () => {
    expect(stripDashes("41 verified rows – all told.")).toBe("41 verified rows, all told.");
    expect(stripDashes("41 verified rows.")).toBe("41 verified rows.");
  });
});

describe("pendingAnswer", () => {
  it("says an official is tracked when the rows are still being checked", () => {
    const answer = pendingAnswer(
      "Purchase rows by Donald J Trump in 2026, counted.",
      { underReview: 1051, notYetChecked: 7889 },
      "Donald J Trump"
    );
    expect(answer).toBe(
      "Donald J Trump is tracked here. The 8,940 rows matching this query are still being checked, " +
        "1,051 under review and 7,889 not yet checked. There is no verified answer yet."
    );
  });

  it("falls back to the plain sentence when nothing is pending either", () => {
    const answer = pendingAnswer("Trades in ZZZZ, counted.", {
      underReview: 0,
      notYetChecked: 0,
    });
    expect(answer).toBe("Trades in ZZZZ, counted. No verified row matches that query.");
  });

  it("works without a named subject", () => {
    const answer = pendingAnswer("Trades flagged late, counted.", {
      underReview: 2,
      notYetChecked: 3,
    });
    expect(answer).toContain("5 rows matching this query are still being checked");
  });
});
