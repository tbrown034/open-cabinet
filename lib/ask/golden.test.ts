import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent";

/**
 * Layer A of the Ask evals: the intent gate against a golden list of
 * questions, no model call. A case marked knownGap is reported, not
 * enforced, so the file can carry the backlog from a red team without
 * turning CI red; every other case is a regression guard.
 */
interface GoldenCase {
  question: string;
  expect: { kind: "ok" | "decline"; category?: string };
  knownGap?: boolean;
}

const file = JSON.parse(readFileSync(path.join(process.cwd(), "data", "golden", "ask-questions.golden.json"), "utf-8")) as { cases: GoldenCase[] };

function outcome(question: string): { kind: string; category?: string } {
  const { intent } = classifyIntent(question);
  if (intent.kind === "decline") return { kind: "decline", category: intent.category };
  // require_aggregate / require_sort still reach the model with a constraint; for the golden they count as ok.
  return { kind: "ok" };
}

describe("ask golden questions (intent gate, no model)", () => {
  const enforced = file.cases.filter((c) => !c.knownGap);
  const gaps = file.cases.filter((c) => c.knownGap);

  it("every enforced case reaches its expected outcome", () => {
    const failures = enforced
      .map((c) => ({ c, got: outcome(c.question) }))
      .filter(({ c, got }) => got.kind !== c.expect.kind || (c.expect.category && got.category !== c.expect.category));
    expect(failures.map(({ c, got }) => `${c.question} -> ${JSON.stringify(got)}, expected ${JSON.stringify(c.expect)}`)).toEqual([]);
  });

  it("reports which known gaps are still open (informational)", () => {
    const stillOpen = gaps.filter((c) => {
      const got = outcome(c.question);
      return got.kind !== c.expect.kind || (c.expect.category && got.category !== c.expect.category);
    });
    const closed = gaps.length - stillOpen.length;
    console.info(`ask golden: ${enforced.length} enforced pass; ${stillOpen.length} of ${gaps.length} known gaps still open${closed ? ` (${closed} now closed: remove knownGap from those)` : ""}`);
    for (const c of stillOpen) console.info(`  gap: ${c.question}`);
    expect(true).toBe(true);
  });
});
