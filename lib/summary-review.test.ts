import { describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  addCandidate,
  listCandidates,
  publishSummary,
  reconcileSummaryAfterIngest,
  rejectCandidate,
} from "./summary-review";
import { buildFactBlock, computeStats, unwitnessedNumbers } from "./summary-facts";

function official(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-official",
    name: "Official, Test",
    title: "Secretary",
    agency: "Department",
    transactions: [
      { description: "Acme Corp (ACME)", ticker: "ACME", type: "Sale", date: "2025-03-04", amount: "$50,001-$100,000", lateFilingFlag: false },
      { description: "Widget LP", ticker: null, type: "Purchase", date: "2025-04-01", amount: "$1,001-$15,000", lateFilingFlag: true },
    ],
    ...overrides,
  } as Parameters<typeof addCandidate>[0];
}

function store() {
  return path.join(mkdtempSync(path.join(tmpdir(), "oc-summ-")), "candidates.json");
}

describe("numbers lint", () => {
  it("passes numbers that appear in the fact block and flags ones that do not", () => {
    const o = official();
    const block = buildFactBlock(computeStats(o), o);
    expect(unwitnessedNumbers("Official reported 1 sale and 1 purchase across 2 transactions.", block)).toEqual([]);
    expect(unwitnessedNumbers("Official reported 3,000 sales.", block)).toEqual(["3,000"]);
  });
});

describe("candidate lifecycle", () => {
  it("a candidate never touches the official; publishing copies exact bytes", () => {
    const file = store();
    const o = official();
    const c = addCandidate(o, "Official reported 1 sale and 1 purchase across 2 transactions.", "test-model", file);
    expect(c.status).toBe("pending");
    expect(c.unwitnessed).toEqual([]);
    expect(o.summary).toBeUndefined();

    const r = publishSummary(o, c.id, "trevor", file);
    expect(r.ok).toBe(true);
    expect(r.official?.summary).toBe(c.text);
    expect(r.official?.summarySource).toBe("model");
    expect(r.official?.summaryFactSha256).toBe(c.factSha256);
    expect(listCandidates("test-official", file)[0].status).toBe("published");

    // Publishing twice is refused.
    expect(publishSummary(o, c.id, "trevor", file).ok).toBe(false);
  });

  it("refuses to publish a candidate with an unwitnessed number", () => {
    const file = store();
    const o = official();
    const c = addCandidate(o, "Official reported 7,699 sales.", "test-model", file);
    expect(c.unwitnessed).toEqual(["7,699"]);
    const r = publishSummary(o, c.id, "trevor", file);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/numbers not in the facts/);
  });

  it("refuses to publish when the facts changed after the candidate was written", () => {
    const file = store();
    const before = official();
    const c = addCandidate(before, "Official reported 1 sale and 1 purchase across 2 transactions.", "test-model", file);
    const after = official({
      transactions: [
        ...before.transactions!,
        { description: "Third Co", ticker: null, type: "Sale", date: "2025-05-01", amount: "$1,001-$15,000" as const, lateFilingFlag: false },
      ],
    });
    const r = publishSummary(after, c.id, "trevor", file);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/facts changed/);
  });

  it("rejecting a candidate records who and when", () => {
    const file = store();
    const c = addCandidate(official(), "Anything.", "test-model", file);
    expect(rejectCandidate(c.id, "trevor", file)).toBe(true);
    const stored = listCandidates(undefined, file)[0];
    expect(stored.status).toBe("rejected");
    expect(stored.decidedBy).toBe("trevor");
  });
});

describe("ingest reconciliation", () => {
  it("writes the template only when no summary exists", () => {
    const o = reconcileSummaryAfterIngest(official(), "Template sentence.");
    expect(o.summary).toBe("Template sentence.");
    expect(o.summarySource).toBe("template");
    expect(o.summaryFactSha256).toBeTruthy();
  });

  it("never overwrites an existing summary, and marks it stale when the facts move", () => {
    const published = reconcileSummaryAfterIngest(official(), "Template sentence.");
    const withPublished = { ...published, summary: "Approved prose.", summarySource: "model" as const };
    const same = reconcileSummaryAfterIngest(withPublished, "New template.");
    expect(same.summary).toBe("Approved prose.");
    expect(same.summaryStaleSince).toBeUndefined();

    const changed = {
      ...withPublished,
      transactions: [
        ...withPublished.transactions!,
        { description: "New Co", ticker: null, type: "Sale", date: "2025-06-01", amount: "$1,001-$15,000" as const, lateFilingFlag: false },
      ],
    };
    const stale = reconcileSummaryAfterIngest(changed, "New template.", { today: "2026-09-05" });
    expect(stale.summary).toBe("Approved prose.");
    expect(stale.summaryStaleSince).toBe("2026-09-05");
  });

  it("a legacy summary with no fact hash goes stale when an ingest adds rows", () => {
    const legacy = { ...official(), summary: "Old prose from before hashes." };
    const untouched = reconcileSummaryAfterIngest(legacy, "T.", { rowsAdded: 0, today: "2026-09-05" });
    expect(untouched.summaryStaleSince).toBeUndefined();
    const stale = reconcileSummaryAfterIngest(legacy, "T.", { rowsAdded: 3, today: "2026-09-05" });
    expect(stale.summary).toBe("Old prose from before hashes.");
    expect(stale.summaryStaleSince).toBe("2026-09-05");
  });
});
