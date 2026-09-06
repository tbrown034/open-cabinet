import { describe, it, expect } from "vitest";
import {
  extractNumberTokens,
  canonicalizeToken,
  extractDateTokens,
  checkAnswerNumbers,
  checkAnswerLanguage,
  templateAnswer,
  pendingAnswer,
  outOfScopeAnswer,
} from "./check";
import { stripDashes, declineText, DECLINE_CATEGORIES } from "./decline";
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

  it("does not treat a date's digits as figures", () => {
    // A date is matched whole, elsewhere. Splitting it into 2025, 01 and 01
    // let a result containing one date vouch for unrelated counts.
    expect(extractNumberTokens("between 2025-01-01 and 2025-06-30")).toEqual([]);
    expect(extractDateTokens("between 2025-01-01 and 2025-06-30")).toEqual([
      "2025-01-01",
      "2025-06-30",
    ]);
  });

  it("does not swallow the comma after a figure", () => {
    expect(extractNumberTokens("On 2026-12-31, the count was 227.")).toEqual(["227"]);
    expect(extractNumberTokens("The count was 1,364, up from 41.")).toEqual(["1,364", "41"]);
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
      ["The most recent verified rows are listed.", "recent"],
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

describe("decline text", () => {
  it("has no dash of any kind in any category", () => {
    for (const category of DECLINE_CATEGORIES) {
      const text = declineText(category);
      expect(text, category).not.toMatch(/[—–]/);
      expect(text.length, category).toBeGreaterThan(20);
    }
  });

  it("explains why an average is unsupported", () => {
    expect(declineText("unsupported_computation")).toBe(
      "This box counts, totals and lists verified trades. It does not compute averages " +
        "or medians because filings disclose ranges, not amounts."
    );
  });

  it("asks for explicit dates rather than guessing a period", () => {
    expect(declineText("needs_date_range")).toContain("2026-01-01 to 2026-03-31");
  });

  it("falls back to the general sentence for an unknown category", () => {
    expect(declineText("nonsense")).toBe(declineText("other"));
  });
});

describe("templateAnswer for late_share", () => {
  const LATE_RESULT: ExecuteResult = {
    aggregate: "late_share",
    matchedRows: 299,
    lateShare: {
      late: 41,
      total: 299,
      percent: 13.7,
      display: "41 of 299 verified trades (13.7%) were flagged late",
    },
    numbers: [41, 299],
    displayStrings: ["41", "299", "13.7%", "41 of 299 verified trades (13.7%) were flagged late"],
  };

  it("uses the executor's own arithmetic verbatim", () => {
    expect(
      templateAnswer(
        { filters: {}, aggregate: "late_share" },
        "Trades, measured for the share flagged late.",
        LATE_RESULT
      )
    ).toBe(
      "Trades, measured for the share flagged late. 41 of 299 verified trades (13.7%) were flagged late."
    );
  });

  it("passes both of its own checks", () => {
    const answer = templateAnswer(
      { filters: {}, aggregate: "late_share" },
      "Trades, measured for the share flagged late.",
      LATE_RESULT
    );
    expect(checkAnswerNumbers(answer, LATE_RESULT).ok).toBe(true);
    expect(checkAnswerLanguage(answer).ok).toBe(true);
  });

  it("rejects a percentage the executor did not compute", () => {
    const check = checkAnswerNumbers("About 14% of verified trades were late.", LATE_RESULT);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["14%"]);
  });
});

describe("word numbers", () => {
  const RANKED: ExecuteResult = {
    aggregate: "top_officials",
    matchedRows: 11,
    shownRows: 3,
    groupCount: 3,
    numbers: [11, 3, 8, 2, 1],
    displayStrings: ["11", "3", "8", "2", "1"],
  };

  it("accepts a spelled-out count the result vouches for", () => {
    // Three officials, and groupCount is 3.
    expect(checkAnswerNumbers("11 verified trades involved three officials.", RANKED).ok).toBe(true);
  });

  it("rejects a spelled-out count the result does not vouch for", () => {
    // The live failure mode: the model counts the rows it can see in a
    // truncated ranking and states that as the number of officials.
    const check = checkAnswerNumbers("11 verified trades involved five officials.", RANKED);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["five"]);
  });

  it("leaves 'one' alone, because it is usually a pronoun", () => {
    expect(checkAnswerNumbers("Only one of them was late.", RANKED).ok).toBe(true);
  });
});

describe("recency language", () => {
  it("rejects the phrasing that slipped through live testing", () => {
    const check = checkAnswerLanguage(
      "122 verified trades, including sales dated as recently as June 23, 2026."
    );
    expect(check.ok).toBe(false);
    expect(check.problems).toContain("recent");
  });

  it("rejects latest, newest and oldest", () => {
    for (const word of ["latest", "newest", "oldest"]) {
      const check = checkAnswerLanguage(`The ${word} verified row was in June.`);
      expect(check.ok, word).toBe(false);
      expect(check.problems, word).toContain(word);
    }
  });
});

describe("templateAnswer for a comparison", () => {
  const COMPARISON: ExecuteResult = {
    aggregate: "top_officials",
    matchedRows: 234,
    shownRows: 1,
    groupCount: 1,
    topOfficials: [
      {
        name: "Christopher Wright",
        slug: "wright-christopher",
        count: 234,
        estimate: 91_183_500,
        estimateDisplay: "$91,183,500",
      },
    ],
    missingOfficials: ["Scott Bessent"],
    numbers: [234, 91_183_500, 1],
    displayStrings: ["234", "$91,183,500", "1"],
  };

  it("states the zero side, which is half of what was asked", () => {
    const answer = templateAnswer(
      { filters: {}, aggregate: "top_officials" },
      "Purchase rows by Scott Bessent and Christopher Wright, ranked by official.",
      COMPARISON
    );
    expect(answer).toBe(
      "Purchase rows by Scott Bessent and Christopher Wright, ranked by official. " +
        "Christopher Wright leads with 234 verified rows estimated at $91,183,500. " +
        "Scott Bessent has no verified row matching it."
    );
    expect(checkAnswerNumbers(answer, COMPARISON).ok).toBe(true);
    expect(checkAnswerLanguage(answer).ok).toBe(true);
  });

  it("handles a comparison where nobody named has a verified row", () => {
    const answer = templateAnswer(
      { filters: {}, aggregate: "top_officials" },
      "Purchase rows by A and B, ranked by official.",
      { ...COMPARISON, topOfficials: [], missingOfficials: ["A", "B"] }
    );
    expect(answer).toContain("None of them has a verified row");
  });
});

// Every case below is a defect Codex reproduced against commit 9721812.
describe("Codex findings, Sept. 6", () => {
  const R: ExecuteResult = {
    aggregate: "sum_estimate",
    matchedRows: 31,
    shownRows: 1,
    numbers: [31, 4_500_000, 28, 3, 1],
    displayStrings: [
      "31",
      "$4,500,000",
      "$4.5M",
      "$4.5 million",
      "28",
      "3",
      "1",
      "2025-10-21",
      "Oct. 21, 2025",
    ],
  };

  it("rejects a quantity spelled out with no numeral", () => {
    const check = checkAnswerNumbers("There were one billion verified trades.", R);
    expect(check.ok).toBe(false);
    expect(check.unmatched.length).toBeGreaterThan(0);
  });

  it("rejects a vague magnitude", () => {
    expect(checkAnswerNumbers("Hundreds of verified trades.", R).ok).toBe(false);
  });

  it("rejects a compact figure stripped of its suffix", () => {
    expect(checkAnswerNumbers("The verified trades estimate to $4.5.", R).ok).toBe(false);
  });

  it("rejects a thousandfold magnitude error", () => {
    const check = checkAnswerNumbers("The verified trades estimate to $4.5B.", R);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["$4.5B"]);
  });

  it("still accepts the compact figure the executor produced", () => {
    expect(checkAnswerNumbers("The verified trades estimate to $4.5M.", R).ok).toBe(true);
    expect(checkAnswerNumbers("The verified trades estimate to $4.5 million.", R).ok).toBe(true);
  });

  it("does not let a date's year authorize a count", () => {
    const check = checkAnswerNumbers("2026 verified trades were found.", R);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["2026"]);
  });

  it("does not let a date's month authorize a count", () => {
    // The result carries Oct. 21, 2025 and lists one row.
    const check = checkAnswerNumbers("10 verified rows shown.", R);
    expect(check.ok).toBe(false);
    expect(check.unmatched).toEqual(["10"]);
  });

  it("accepts a date the result actually carries, and refuses one it does not", () => {
    expect(checkAnswerNumbers("31 verified rows, the earliest on Oct. 21, 2025.", R).ok).toBe(true);
    const wrong = checkAnswerNumbers("31 verified rows, the earliest on Oct. 22, 2025.", R);
    expect(wrong.ok).toBe(false);
    expect(wrong.unmatched).toEqual(["Oct. 22, 2025"]);
  });

  it("accepts a correct count of what is shown", () => {
    expect(checkAnswerNumbers("1 verified result is shown.", R).ok).toBe(true);
  });

  it("never lets a decline claim a person is untracked", () => {
    // The category exists so the model can say it failed to match a name.
    // What it may not do is turn that into a claim about the roster, which
    // it does not hold. The route also rescans the question before sending.
    const text = declineText("unknown_person");
    expect(text).toContain("could not match a name");
    expect(text).not.toMatch(/not (a |an )?tracked|does not exist|not among/i);
  });
});

describe("outOfScopeAnswer", () => {
  it("says a holdover is out of scope rather than reporting zero", () => {
    expect(outOfScopeAnswer(["Deanne Criswell"])).toBe(
      "Deanne Criswell is a prior-administration holdover. Open Cabinet keeps their filings " +
        "on the site but out of current-roster totals, so this box does not query them. " +
        "Their pages carry the full record."
    );
  });

  it("has no dash", () => {
    expect(outOfScopeAnswer(["A", "B"])).not.toMatch(/[—–]/);
  });
});

describe("stripDashes on templated output", () => {
  it("cleans a dash a reader's own question carried into the restatement", () => {
    // descriptionContains echoes the question, so a dash can reach a template.
    expect(stripDashes('Trades whose description mentions "Bonds—test", counted.')).toBe(
      'Trades whose description mentions "Bonds, test", counted.'
    );
  });
});

// Item 1 of the Codex report, at the width the follow-up brief asked for:
// one..twenty, thirty..ninety, hundred, thousand, million, billion, dozen,
// half, twice, double.
describe("item 1: quantities written as words", () => {
  const R: ExecuteResult = {
    aggregate: "top_officials",
    matchedRows: 11,
    shownRows: 3,
    groupCount: 3,
    numbers: [11, 3, 8, 2],
    displayStrings: ["11", "3", "8", "2"],
  };

  it("rejects every word quantity the result does not hold", () => {
    for (const word of [
      "one",
      "four",
      "nineteen",
      "twenty",
      "thirty",
      "ninety",
      "hundred",
      "thousand",
      "million",
      "billion",
      "dozen",
      "half",
      "twice",
      "double",
    ]) {
      const check = checkAnswerNumbers(`There were ${word} verified trades.`, R);
      expect(check.ok, word).toBe(false);
    }
  });

  it("accepts a word quantity whose value the result does hold", () => {
    expect(checkAnswerNumbers("Three officials had verified trades.", R).ok).toBe(true);
    expect(checkAnswerNumbers("Two verified trades were late.", R).ok).toBe(true);
  });

  it("rejects a plural of an unvouched word", () => {
    expect(checkAnswerNumbers("Hundreds of verified trades.", R).ok).toBe(false);
    expect(checkAnswerNumbers("Millions of verified dollars.", R).ok).toBe(false);
  });

  it("has no value to compare for half, twice or double, so they never pass", () => {
    const full: ExecuteResult = { ...R, numbers: [...R.numbers, 100], displayStrings: [...R.displayStrings, "100"] };
    expect(checkAnswerNumbers("Half the verified trades were late.", full).ok).toBe(false);
    expect(checkAnswerNumbers("Twice as many verified trades.", full).ok).toBe(false);
  });
});
