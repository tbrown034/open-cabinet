import { describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  decideReview,
  listOpenReviews,
  openReviewItem,
  problemsFromCrosscheck,
  renderReviewRequest,
} from "./review-queue";

const file = () => path.join(mkdtempSync(path.join(tmpdir(), "oc-review-")), "queue.json");

describe("review queue", () => {
  it("parses comparator problems into located, two-lane problems", () => {
    const problems = problemsFromCrosscheck(
      "/nonexistent.pdf",
      [
        "row 9: text layer [Sale|2225-04-04|$1,001-$15,000|ontime] vs AI parse [Sale|2025-04-04|$1,001-$15,000|ontime]",
        "row count: text layer has 100, AI parse has 97",
      ],
      Array.from({ length: 9 }, (_, i) => ({ description: i === 8 ? "NIKE, Inc. (NKE)" : "x" }))
    );
    expect(problems[0].location.printedRow).toBe(9);
    expect(problems[0].location.description).toBe("NIKE, Inc. (NKE)");
    expect(problems[0].textLayerSaid).toBe("Sale|2225-04-04|$1,001-$15,000|ontime");
    expect(problems[0].modelSaid).toBe("Sale|2025-04-04|$1,001-$15,000|ontime");
    expect(problems[1].location.printedRow).toBeNull();
    expect(problems[1].detail).toMatch(/row count/);
  });

  it("opens an item without sending, lists it, and records a decision", async () => {
    const f = file();
    const item = await openReviewItem(
      {
        kind: "lane_disagreement",
        slug: "kennedy-robert-f",
        officialName: "Robert F Kennedy",
        filing: { url: "https://example.gov/x.pdf", pdfFile: "x.pdf", date: "2025-05-17" },
        problems: [
          {
            location: { page: 2, printedRow: 9, parsedRow: 9, description: "NIKE, Inc. (NKE)" },
            modelSaid: "Sale|2025-04-04|$1,001-$15,000|ontime",
            textLayerSaid: "Sale|2225-04-04|$1,001-$15,000|ontime",
            detail: "row 9 differs",
          },
        ],
        holding: "every row of x.pdf",
      },
      { send: false, file: f }
    );
    expect(item.status).toBe("open");
    expect(item.emailSentAt).toBeUndefined();
    expect(listOpenReviews(f).map((i) => i.id)).toEqual([item.id]);

    const { subject, body } = renderReviewRequest(item);
    expect(subject).toBe("Review needed: Robert F Kennedy, lane disagreement");
    expect(body).toContain("Open the filing: https://example.gov/x.pdf");
    expect(body).toContain('Look at page 2, printed row 9: "NIKE, Inc. (NKE)"');
    expect(body).toContain("The text layer reads: Sale|2225-04-04");
    expect(body).toContain("The model read:       Sale|2025-04-04");
    expect(body).toContain(`scripts/review.ts decide ${item.id}`);

    const decided = decideReview(item.id, "filing typo; model reading is correct", "trevor", f);
    expect(decided?.status).toBe("decided");
    expect(decided?.decidedBy).toBe("trevor");
    expect(listOpenReviews(f)).toEqual([]);
    expect(decideReview(item.id, "again", "trevor", f)).toBeNull();
  });

  it("does not open a second item for a filing that already has one open", async () => {
    const f = file();
    const input = {
      kind: "lane_disagreement" as const,
      slug: "chavez-deremer-lori",
      officialName: "Lori Chavez-DeRemer",
      filing: { url: "https://example.gov/c.pdf", pdfFile: "c.pdf", date: "2025-07-02" },
      problems: [],
      holding: "every row of c.pdf",
    };
    const first = await openReviewItem(input, { send: false, file: f });
    const second = await openReviewItem(input, { send: false, file: f });
    expect(second.id).toBe(first.id);
    expect(listOpenReviews(f)).toHaveLength(1);
    // New evidence opens a new item and marks the old one superseded.
    const third = await openReviewItem(
      { ...input, problems: [{ location: { page: 1, printedRow: 2, parsedRow: 2, description: "X" }, modelSaid: "a", textLayerSaid: "b", detail: "row 2 differs" }] },
      { send: false, file: f }
    );
    expect(third.id).not.toBe(first.id);
    expect(listOpenReviews(f).map((i) => i.id)).toEqual([third.id]);
  });
});
