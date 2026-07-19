import { describe, it, expect } from "vitest";
import {
  selectDigestItems,
  digestIdempotencyKey,
  chunkKey,
  filterRecipientsByFollows,
  followsBreakdown,
  type FollowsRecipient,
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

// The follows routing rule is the security-relevant bit: a digest must reach a
// follow-all subscriber and any follower of an official IN the digest, and must
// NOT reach a follower of some other official. These exercise the filter/
// breakdown directly.
describe("filterRecipientsByFollows", () => {
  const recipients: FollowsRecipient[] = [
    { id: 1, email: "all-1@x.test", officialSlug: null },
    { id: 2, email: "bessent@x.test", officialSlug: "bessent-scott" },
    { id: 3, email: "all-2@x.test", officialSlug: null },
    { id: 4, email: "lutnick@x.test", officialSlug: "lutnick-howard" },
  ];

  it("a null follow (follow-all) is reached by every digest", () => {
    const out = filterRecipientsByFollows(recipients, ["bessent-scott"]);
    expect(out.map((r) => r.id)).toContain(1);
    expect(out.map((r) => r.id)).toContain(3);
  });

  it("includes a follower whose official IS in the digest", () => {
    const out = filterRecipientsByFollows(recipients, ["bessent-scott"]);
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("excludes a follower whose official is NOT in the digest", () => {
    const out = filterRecipientsByFollows(recipients, ["bessent-scott"]);
    expect(out.some((r) => r.id === 4)).toBe(false);
  });

  it("with empty digestSlugs, only follow-all subscribers are reached", () => {
    const out = filterRecipientsByFollows(recipients, []);
    expect(out.map((r) => r.id)).toEqual([1, 3]);
    expect(out.every((r) => r.officialSlug === null)).toBe(true);
  });

  it("reaches followers of multiple officials in the digest", () => {
    const out = filterRecipientsByFollows(recipients, [
      "bessent-scott",
      "lutnick-howard",
    ]);
    expect(out.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it("does not mutate the input array", () => {
    const copy = [...recipients];
    filterRecipientsByFollows(recipients, ["bessent-scott"]);
    expect(recipients).toEqual(copy);
  });

  it("handles an empty recipient list", () => {
    expect(filterRecipientsByFollows([], ["bessent-scott"])).toEqual([]);
    expect(filterRecipientsByFollows([], [])).toEqual([]);
  });
});

describe("followsBreakdown", () => {
  const recipients: FollowsRecipient[] = [
    { id: 1, email: "all-1@x.test", officialSlug: null },
    { id: 2, email: "bessent-1@x.test", officialSlug: "bessent-scott" },
    { id: 3, email: "all-2@x.test", officialSlug: null },
    { id: 4, email: "lutnick@x.test", officialSlug: "lutnick-howard" },
    { id: 5, email: "bessent-2@x.test", officialSlug: "bessent-scott" },
  ];

  it("computes total/allFollowers/reached/excluded for a digest", () => {
    const b = followsBreakdown(recipients, ["bessent-scott"]);
    // total = 5; reached = 2 follow-all + 2 bessent followers = 4; excluded = 1
    // (the lutnick follower, whose official is not in the digest).
    expect(b.total).toBe(5);
    expect(b.allFollowers).toBe(2);
    expect(b.reached).toBe(4);
    expect(b.excluded).toBe(1);
  });

  it("counts followers per official in byOfficial (single-official only)", () => {
    const b = followsBreakdown(recipients, ["bessent-scott"]);
    expect(b.byOfficial).toEqual({
      "bessent-scott": 2,
      "lutnick-howard": 1,
    });
  });

  it("excluded + reached === total (math is consistent)", () => {
    const b = followsBreakdown(recipients, ["lutnick-howard"]);
    expect(b.reached + b.excluded).toBe(b.total);
  });

  it("with empty digestSlugs, only follow-all subscribers are reached", () => {
    const b = followsBreakdown(recipients, []);
    expect(b.reached).toBe(b.allFollowers);
    expect(b.reached).toBe(2);
    expect(b.excluded).toBe(3);
  });

  it("is all-zero (empty byOfficial) for an empty list", () => {
    expect(followsBreakdown([], ["bessent-scott"])).toEqual({
      total: 0,
      allFollowers: 0,
      reached: 0,
      excluded: 0,
      byOfficial: {},
    });
  });

  it("does not mutate the input array", () => {
    const copy = [...recipients];
    followsBreakdown(recipients, ["bessent-scott"]);
    expect(recipients).toEqual(copy);
  });
});
