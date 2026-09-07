import { describe, it, expect } from "vitest";
import { classifyIntent } from "./intent";

function kindOf(question: string) {
  return classifyIntent(question).intent.kind;
}

function categoryOf(question: string) {
  const { intent } = classifyIntent(question);
  return intent.kind === "decline" ? intent.category : null;
}

// Every input below shipped as a confident answer to a different question in
// Grok's Sept. 6 review, or is the same shape one step over.
describe("item C1: averages and medians", () => {
  it("declines before a model is called", () => {
    for (const q of [
      "Average trade size for Doug Burgum",
      "What is the median value of Linda McMahon's sales?",
      "What is the mean sale for Wright?",
      "What is a typical trade for Bessent?",
      "How much per trade did Wright sell?",
      "What did Wright sell on average?",
    ]) {
      expect(categoryOf(q), q).toBe("unsupported_computation");
    }
  });

  it("leaves a plain count alone", () => {
    expect(kindOf("How many trades did Christopher Wright report?")).toBe("ok");
  });
});

describe("item C2: shares", () => {
  it("forces late_share for a share of late filings", () => {
    for (const q of [
      "What percentage of Wright's trades were late?",
      "What share of trades were filed late?",
      "What proportion were late?",
      "How often were Wright's trades late?",
      "What fraction of 2026 trades were late?",
    ]) {
      const { intent } = classifyIntent(q);
      expect(intent.kind, q).toBe("require_aggregate");
      if (intent.kind === "require_aggregate") expect(intent.aggregate).toBe("late_share");
    }
  });

  it("declines a share of anything else, which has no denominator here", () => {
    for (const q of [
      "What percentage of Wright's purchases were energy stocks?",
      "What share of trades were sales?",
      "What proportion of Burgum's trades were over $1 million?",
    ]) {
      expect(categoryOf(q), q).toBe("unsupported_computation");
    }
  });
});

describe("item C3: exclusions", () => {
  it("declines set subtraction, which no filter can express", () => {
    for (const q of [
      "Sales except Tesla",
      "Wright but not Bessent",
      "All trades excluding Nvidia",
      "Officials other than Trump",
      "Trades apart from energy stocks",
      "Neither Wright nor Burgum",
    ]) {
      expect(categoryOf(q), q).toBe("unsupported_filter");
    }
  });
});

describe("item C4: two assets at once", () => {
  it("declines an intersection across assets", () => {
    expect(categoryOf("Who traded both NVDA and AAPL?")).toBe("unsupported_filter");
    expect(categoryOf("Which officials bought both Tesla and Apple?")).toBe(
      "unsupported_filter"
    );
  });

  it("leaves a single asset alone", () => {
    expect(kindOf("Which officials sold Liberty Energy?")).toBe("ok");
  });
});

describe("item C5: ranking by size", () => {
  it("requires an amount sort rather than letting date order pass for size", () => {
    for (const q of [
      "Largest sales by Doug Burgum",
      "Biggest trades in 2026",
      "Most expensive sales",
      "Highest value purchases",
      "Top trades by value",
    ]) {
      const { intent } = classifyIntent(q);
      expect(intent.kind, q).toBe("require_sort");
      if (intent.kind === "require_sort") expect(intent.sort).toBe("amount");
    }
  });

  it("does not fire on a plain listing", () => {
    expect(kindOf("Show me trades between $250,000 and $500,000")).toBe("ok");
  });
});

describe("precedence", () => {
  it("declines rather than requiring when a question does both", () => {
    // "Largest" would want an amount sort, but an average is unanswerable.
    expect(categoryOf("What is the average of the largest sales?")).toBe(
      "unsupported_computation"
    );
  });

  it("names the rule that fired, for the log", () => {
    expect(classifyIntent("Average trade size").rule).toBe("average");
    expect(classifyIntent("Sales except Tesla").rule).toBe("exclusion");
    expect(classifyIntent("What percent were late?").rule).toBe("late_share");
    expect(classifyIntent("Largest sales").rule).toBe("by_size");
    expect(classifyIntent("How many trades?").rule).toBe("none");
  });
});
