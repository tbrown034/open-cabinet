import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STATE_LABEL, type RowVerification, type RowVerificationFile } from "@/lib/row-verification";
import VerificationMarker from "./verification-marker";
import VerificationSummary from "./verification-summary";

describe("row verification display", () => {
  it.each([
    [3, "deterministic_agree", "Checked"],
    [3, "human_verified", "Checked"],
    [2, "two_models_agree", "Checked by two models"],
    [1, "single_read", "Not yet checked"],
    [0, "disputed", "Under review"],
  ] as const)("shows score %s (%s) as visible text with an expandable note", (score, state, label) => {
    const verification: RowVerification = {
      id: "row", slug: "official", score, state, lane: null,
      sourceUrl: null, note: "The full recorded reason <with filing text>",
    };
    const html = renderToStaticMarkup(createElement(VerificationMarker, { verification }));
    expect(html).toMatch(new RegExp(`<summary[^>]*>${label}</summary>`));
    expect(html).toContain("<details");
    expect(html).toContain("The full recorded reason &lt;with filing text&gt;</p>");
    if (score === 0) expect(html).toContain("font-semibold text-amber-900");
  });

  it("does not invent a verdict when the record is absent", () => {
    const html = renderToStaticMarkup(createElement(VerificationMarker, { verification: null }));
    expect(html).toContain(">Not yet checked</summary>");
    expect(html).toContain("No verification record is available for this row");
  });

  it("renders each recorded state and a single overall checked share", () => {
    const summary: RowVerificationFile["summary"] = {
      rows: 20,
      byScore: { "3": 5, "2": 3, "1": 10, "0": 2 },
      byState: { deterministic_agree: 4, human_verified: 1, two_models_agree: 3, single_read: 10, disputed: 2 },
    };
    const html = renderToStaticMarkup(createElement(VerificationSummary, { summary }));
    expect(html).toContain("8 of 20 rows (40 percent)");
    expect(html.match(/percent/g)).toHaveLength(1);
    for (const [state, count] of Object.entries(summary.byState)) {
      expect(html).toContain(`${count} rows</strong> — ${STATE_LABEL[state as RowVerification["state"]]}.`);
    }
    expect(html).toContain("one model read with no independent comparison yet");
    expect(html).toContain("rows are on the site while a person decides");
  });

  it("handles missing and empty summaries without claiming coverage", () => {
    expect(renderToStaticMarkup(createElement(VerificationSummary, { summary: null })))
      .toContain("Row verification counts are not yet available");
    const summary: RowVerificationFile["summary"] = {
      rows: 0, byScore: { "3": 0, "2": 0, "1": 0, "0": 0 },
      byState: { deterministic_agree: 0, human_verified: 0, two_models_agree: 0, single_read: 0, disputed: 0 },
    };
    expect(renderToStaticMarkup(createElement(VerificationSummary, { summary })))
      .toContain("0 of 0 rows (0 percent)");
  });
});
