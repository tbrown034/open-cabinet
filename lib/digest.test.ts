import { describe, it, expect } from "vitest";
import {
  selectDigestItems,
  digestIdempotencyKey,
  chunkKey,
  filterRecipientsByAudience,
  recipientAudienceCounts,
  type AudienceRecipient,
} from "./digest";
import type { OfficialData, Transaction } from "./types";

function trade(over: Partial<Transaction> = {}): Transaction {
  return {
    description: "Apple Inc.",
    ticker: "AAPL",
    type: "Purchase",
    date: "2026-06-10",
    amount: "$1,001-$15,000",
    lateFilingFlag: false,
    ...over,
  };
}

function official(over: Partial<OfficialData> = {}): OfficialData {
  return {
    name: "Test Official",
    slug: "test-official",
    title: "Secretary",
    agency: "Test Agency",
    level: "Cabinet",
    filingType: "278-T",
    mostRecentFilingDate: "2026-06-10",
    lastIngestedDate: "2026-06-15",
    lastIngestedNewCount: 2,
    transactions: [trade()],
    sourceFilings: [{ date: "2026-06-10", url: "https://oge.gov/a.pdf", label: "278-T" }],
    ...over,
  };
}

describe("selectDigestItems", () => {
  it("selects an official with new trades and an un-notified filing", () => {
    const result = selectDigestItems([official()], { notifiedUrls: new Set() });
    expect(result.empty).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].slug).toBe("test-official");
    expect(result.filingUrls).toEqual(["https://oge.gov/a.pdf"]);
    expect(result.filings).toEqual([{ url: "https://oge.gov/a.pdf", slug: "test-official" }]);
  });

  it("dedupes filings already in the notified ledger", () => {
    const result = selectDigestItems([official()], {
      notifiedUrls: new Set(["https://oge.gov/a.pdf"]),
    });
    expect(result.empty).toBe(true); // their only filing was already sent
    expect(result.filingUrls).toEqual([]); // nothing to ledger
  });

  it("includes only the un-notified filings for a partially-sent official", () => {
    const o = official({
      sourceFilings: [
        { date: "2026-06-10", url: "https://oge.gov/old.pdf", label: "278-T" },
        { date: "2026-06-14", url: "https://oge.gov/new.pdf", label: "278-T" },
      ],
    });
    const result = selectDigestItems([o], {
      notifiedUrls: new Set(["https://oge.gov/old.pdf"]),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].filingUrls).toEqual(["https://oge.gov/new.pdf"]);
    expect(result.items[0].primaryFilingUrl).toBe("https://oge.gov/new.pdf");
  });

  it("returns empty when nothing qualifies", () => {
    const result = selectDigestItems([], { notifiedUrls: new Set() });
    expect(result.empty).toBe(true);
    expect(result.filingUrls).toEqual([]);
    expect(result.filings).toEqual([]);
  });

  // The core data-loss fix: an un-notified filing whose latest-ingest delta was
  // clobbered to 0 (amended/restated report) renders no card, but its URL is
  // still surfaced so a confirmed send clears the ledger and it never re-triggers.
  it("ledgers an un-notified filing even when the trade delta is 0 (no card)", () => {
    const o = official({ lastIngestedNewCount: 0 });
    const result = selectDigestItems([o], { notifiedUrls: new Set() });
    expect(result.items).toHaveLength(0); // no displayable card
    expect(result.empty).toBe(true); // nothing to email on an all-amended day
    expect(result.filingUrls).toEqual(["https://oge.gov/a.pdf"]); // still ledgered
    expect(result.filings).toEqual([{ url: "https://oge.gov/a.pdf", slug: "test-official" }]);
  });

  // Mixed day: a normal official (delta > 0) triggers a send, and an
  // amended-only official's filing rides along into the ledger so it clears too.
  it("ledgers an amended-only official's URL alongside a displayed official", () => {
    const withTrades = official({
      slug: "has-trades",
      lastIngestedNewCount: 3,
      sourceFilings: [{ date: "2026-06-14", url: "https://oge.gov/live.pdf", label: "x" }],
    });
    const amendedOnly = official({
      slug: "amended-only",
      lastIngestedNewCount: 0,
      sourceFilings: [{ date: "2026-06-13", url: "https://oge.gov/amended.pdf", label: "x" }],
    });
    const result = selectDigestItems([withTrades, amendedOnly], { notifiedUrls: new Set() });
    expect(result.empty).toBe(false);
    expect(result.items.map((i) => i.slug)).toEqual(["has-trades"]);
    expect(result.filingUrls.sort()).toEqual([
      "https://oge.gov/amended.pdf",
      "https://oge.gov/live.pdf",
    ]);
    expect(result.filings).toContainEqual({ url: "https://oge.gov/amended.pdf", slug: "amended-only" });
  });

  it("attaches trades sorted newest-first and capped", () => {
    const o = official({
      lastIngestedNewCount: 10,
      transactions: [
        trade({ date: "2026-06-01", description: "Old" }),
        trade({ date: "2026-06-20", description: "New" }),
      ],
    });
    const result = selectDigestItems([o], { notifiedUrls: new Set() });
    expect(result.items[0].trades[0].description).toBe("New");
    expect(result.items[0].trades.length).toBeLessThanOrEqual(6);
  });

  it("orders items by new-trade count desc (deterministic)", () => {
    const a = official({ slug: "a", lastIngestedNewCount: 1, sourceFilings: [{ date: "2026-06-10", url: "https://oge.gov/a.pdf", label: "x" }] });
    const b = official({ slug: "b", lastIngestedNewCount: 5, sourceFilings: [{ date: "2026-06-10", url: "https://oge.gov/b.pdf", label: "x" }] });
    const result = selectDigestItems([a, b], { notifiedUrls: new Set() });
    expect(result.items.map((i) => i.slug)).toEqual(["b", "a"]);
  });
});

describe("digestIdempotencyKey", () => {
  it("is deterministic for the same set", () => {
    const a = digestIdempotencyKey(["https://x/1.pdf", "https://x/2.pdf"]);
    const b = digestIdempotencyKey(["https://x/1.pdf", "https://x/2.pdf"]);
    expect(a).toBe(b);
  });

  it("is order-independent and dedupes", () => {
    const a = digestIdempotencyKey(["https://x/2.pdf", "https://x/1.pdf"]);
    const b = digestIdempotencyKey(["https://x/1.pdf", "https://x/2.pdf", "https://x/1.pdf"]);
    expect(a).toBe(b);
  });

  it("differs when the filing set differs", () => {
    const a = digestIdempotencyKey(["https://x/1.pdf"]);
    const b = digestIdempotencyKey(["https://x/2.pdf"]);
    expect(a).not.toBe(b);
  });

  it("returns a 64-char hex string", () => {
    expect(digestIdempotencyKey(["https://x/1.pdf"])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("chunkKey", () => {
  it("derives a stable per-chunk key", () => {
    expect(chunkKey("abc", 0)).toBe("abc-c0");
    expect(chunkKey("abc", 3)).toBe("abc-c3");
  });

  it("is unique per chunk index for a given send", () => {
    const key = "deadbeef";
    const keys = [0, 1, 2].map((n) => chunkKey(key, n));
    expect(new Set(keys).size).toBe(3);
  });
});

// The audience routing rule is the security-relevant bit: a routine send must
// NEVER reach a major-only subscriber. These exercise that filter directly.
describe("filterRecipientsByAudience", () => {
  const recipients: AudienceRecipient[] = [
    { id: 1, email: "all-1@x.test", alertType: "all" },
    { id: 2, email: "major-1@x.test", alertType: "major" },
    { id: 3, email: "all-2@x.test", alertType: "all" },
    { id: 4, email: "major-2@x.test", alertType: "major" },
  ];

  it("major reaches EVERY subscriber (both alert types)", () => {
    const out = filterRecipientsByAudience(recipients, "major");
    expect(out).toHaveLength(4);
    expect(out.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it("routine reaches ONLY every-filing ('all') subscribers", () => {
    const out = filterRecipientsByAudience(recipients, "routine");
    expect(out.map((r) => r.id)).toEqual([1, 3]);
    expect(out.every((r) => r.alertType === "all")).toBe(true);
  });

  it("routine excludes major-only subscribers entirely", () => {
    const out = filterRecipientsByAudience(recipients, "routine");
    expect(out.some((r) => r.alertType === "major")).toBe(false);
  });

  it("treats a legacy/blank alertType as major-only (excluded from routine)", () => {
    const legacy: AudienceRecipient[] = [
      { id: 5, email: "legacy@x.test", alertType: "" },
      { id: 6, email: "all@x.test", alertType: "all" },
    ];
    expect(filterRecipientsByAudience(legacy, "routine").map((r) => r.id)).toEqual([6]);
    // ...but a major send still reaches them.
    expect(filterRecipientsByAudience(legacy, "major").map((r) => r.id)).toEqual([5, 6]);
  });

  it("does not mutate the input array", () => {
    const copy = [...recipients];
    filterRecipientsByAudience(recipients, "routine");
    expect(recipients).toEqual(copy);
  });

  it("handles an empty list", () => {
    expect(filterRecipientsByAudience([], "routine")).toEqual([]);
    expect(filterRecipientsByAudience([], "major")).toEqual([]);
  });
});

describe("recipientAudienceCounts", () => {
  it("splits total into every-filing and major-only", () => {
    const counts = recipientAudienceCounts([
      { id: 1, email: "a@x.test", alertType: "all" },
      { id: 2, email: "b@x.test", alertType: "major" },
      { id: 3, email: "c@x.test", alertType: "all" },
    ]);
    expect(counts).toEqual({ total: 3, all: 2, major: 1 });
  });

  it("counts a blank/legacy alertType as major-only", () => {
    const counts = recipientAudienceCounts([
      { id: 1, email: "a@x.test", alertType: "" },
      { id: 2, email: "b@x.test", alertType: "all" },
    ]);
    expect(counts).toEqual({ total: 2, all: 1, major: 1 });
  });

  it("is all-zero for an empty list", () => {
    expect(recipientAudienceCounts([])).toEqual({ total: 0, all: 0, major: 0 });
  });

  it("agrees with the filter: major count === total - routine count", () => {
    const recipients: AudienceRecipient[] = [
      { id: 1, email: "a@x.test", alertType: "all" },
      { id: 2, email: "b@x.test", alertType: "major" },
      { id: 3, email: "c@x.test", alertType: "all" },
      { id: 4, email: "d@x.test", alertType: "major" },
    ];
    const counts = recipientAudienceCounts(recipients);
    const routine = filterRecipientsByAudience(recipients, "routine").length;
    const major = filterRecipientsByAudience(recipients, "major").length;
    expect(counts.all).toBe(routine);
    expect(counts.total).toBe(major);
    expect(counts.major).toBe(counts.total - counts.all);
  });
});
