import { describe, it, expect } from "vitest";
import {
  parseQueryPlan,
  resolveOfficials,
  resolveTickers,
  resolvePlan,
  describePlan,
  normalizePlan,
  hasNoFilters,
  MAX_OFFICIALS,
  officialsNamedIn,
} from "./plan";
import type { OfficialRef } from "../published-rows";

const OFFICIALS: OfficialRef[] = [
  { slug: "bessent-scott", name: "Scott Bessent", filedName: "Bessent, Scott", title: "Secretary of the Treasury", agency: "Treasury" },
  { slug: "burgum-doug", name: "Doug Burgum", filedName: "Burgum, Doug", title: "Secretary of the Interior", agency: "Interior" },
  { slug: "smith-alice", name: "Alice Smith", filedName: "Smith, Alice", title: "Administrator", agency: "Agency A" },
  { slug: "smith-brian", name: "Brian Smith", filedName: "Smith, Brian", title: "Administrator", agency: "Agency B" },
];

describe("parseQueryPlan", () => {
  it("accepts a minimal plan", () => {
    const parsed = parseQueryPlan({ filters: {}, aggregate: "count" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.plan.aggregate).toBe("count");
  });

  it("accepts a full plan and trims strings", () => {
    const parsed = parseQueryPlan({
      filters: {
        officials: [" Scott Bessent "],
        tickers: ["nvda"],
        descriptionContains: " Nvidia ",
        types: ["Purchase"],
        dateFrom: "2025-01-01",
        dateTo: "2025-06-30",
        lateOnly: true,
        amountAtLeast: 50000,
      },
      aggregate: "list",
      limit: 10,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.filters.officials).toEqual(["Scott Bessent"]);
    expect(parsed.plan.filters.descriptionContains).toBe("Nvidia");
    expect(parsed.plan.limit).toBe(10);
  });

  it("rejects an unknown aggregate", () => {
    const parsed = parseQueryPlan({ filters: {}, aggregate: "average" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects an unknown filter key", () => {
    const parsed = parseQueryPlan({ filters: { officialName: "Bessent" }, aggregate: "count" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain("officialName");
  });

  it("rejects an unknown top-level key", () => {
    const parsed = parseQueryPlan({ filters: {}, aggregate: "count", sql: "SELECT 1" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a limit above the cap", () => {
    expect(parseQueryPlan({ filters: {}, aggregate: "list", limit: 500 }).ok).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(parseQueryPlan({ filters: { dateFrom: "Jan 2025" }, aggregate: "count" }).ok).toBe(false);
    expect(parseQueryPlan({ filters: { dateFrom: "2025-02-30" }, aggregate: "count" }).ok).toBe(false);
  });

  it("rejects a reversed date range", () => {
    const parsed = parseQueryPlan({
      filters: { dateFrom: "2026-01-01", dateTo: "2025-01-01" },
      aggregate: "count",
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects an unknown transaction type", () => {
    expect(parseQueryPlan({ filters: { types: ["Short"] }, aggregate: "count" }).ok).toBe(false);
  });

  it("rejects a non-object plan", () => {
    expect(parseQueryPlan("count").ok).toBe(false);
    expect(parseQueryPlan(null).ok).toBe(false);
    expect(parseQueryPlan([]).ok).toBe(false);
  });
});

describe("resolveOfficials", () => {
  it("resolves a full name", () => {
    const r = resolveOfficials(["Scott Bessent"], OFFICIALS);
    expect(r).toEqual({ ok: true, value: ["bessent-scott"] });
  });

  it("resolves the filed order and a slug", () => {
    expect(resolveOfficials(["Bessent, Scott"], OFFICIALS)).toEqual({ ok: true, value: ["bessent-scott"] });
    expect(resolveOfficials(["bessent-scott"], OFFICIALS)).toEqual({ ok: true, value: ["bessent-scott"] });
  });

  it("resolves a unique last name", () => {
    expect(resolveOfficials(["Burgum"], OFFICIALS)).toEqual({ ok: true, value: ["burgum-doug"] });
  });

  it("refuses an ambiguous last name and names the candidates", () => {
    const r = resolveOfficials(["Smith"], OFFICIALS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.candidates).toEqual(["Alice Smith", "Brian Smith"]);
  });

  it("refuses a name that is not in the data", () => {
    const r = resolveOfficials(["Nancy Pelosi"], OFFICIALS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("not among the officials Open Cabinet tracks");
  });

  it("deduplicates repeated names", () => {
    const r = resolveOfficials(["Burgum", "Doug Burgum"], OFFICIALS);
    expect(r).toEqual({ ok: true, value: ["burgum-doug"] });
  });
});

describe("resolveTickers", () => {
  it("uppercases and accepts a known symbol", () => {
    expect(resolveTickers(["nvda"], ["NVDA", "AAPL"])).toEqual({ ok: true, value: ["NVDA"] });
  });

  it("refuses a symbol with no verified row", () => {
    const r = resolveTickers(["ZZZZ"], ["NVDA"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("ZZZZ");
  });
});

describe("resolvePlan", () => {
  it("replaces names with slugs", () => {
    const parsed = parseQueryPlan({
      filters: { officials: ["Burgum"], tickers: ["nvda"] },
      aggregate: "count",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = resolvePlan(parsed.plan, OFFICIALS, ["NVDA"]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.filters.officials).toEqual(["burgum-doug"]);
    expect(resolved.value.filters.tickers).toEqual(["NVDA"]);
  });
});

describe("describePlan", () => {
  it("restates the plan in code, not from the model", () => {
    const text = describePlan(
      {
        filters: {
          officials: ["bessent-scott"],
          types: ["Purchase"],
          dateFrom: "2025-01-01",
          dateTo: "2025-06-30",
        },
        aggregate: "count",
      },
      OFFICIALS
    );
    expect(text).toBe(
      "Purchase rows by Scott Bessent between 2025-01-01 and 2025-06-30, counted."
    );
  });

  it("names a late-only filter", () => {
    const text = describePlan({ filters: { lateOnly: true }, aggregate: "count" }, OFFICIALS);
    expect(text).toContain("flagged late");
  });
});

describe("normalizePlan", () => {
  it("turns an unfiltered list into a count", () => {
    const p = normalizePlan({ filters: {}, aggregate: "list", limit: 10 });
    expect(p.aggregate).toBe("count");
    expect(p.limit).toBeUndefined();
  });

  it("leaves a filtered list alone", () => {
    const p = normalizePlan({ filters: { lateOnly: true }, aggregate: "list", limit: 10 });
    expect(p.aggregate).toBe("list");
    expect(p.limit).toBe(10);
  });

  it("leaves other aggregates alone", () => {
    expect(normalizePlan({ filters: {}, aggregate: "by_month" }).aggregate).toBe("by_month");
  });

  it("treats empty filter arrays as no filter", () => {
    expect(hasNoFilters({ filters: { officials: [], tickers: [] }, aggregate: "list" })).toBe(true);
  });
});

describe("resolveOfficials against the full roster", () => {
  // The roster passed in is the whole officials index, so an official whose
  // rows are all still under review still resolves. The live run returned
  // "Trump is not among the officials listed in this dataset" for the
  // largest official on the site; that is the case this covers.
  const ROSTER = [
    ...OFFICIALS,
    {
      slug: "trump-donald-j",
      name: "Donald J Trump",
      filedName: "Trump, Donald J",
      title: "President",
      agency: "The White House",
      publishedRowCount: 0,
    },
  ];

  it("resolves an official with no verified rows", () => {
    expect(resolveOfficials(["Trump"], ROSTER)).toEqual({ ok: true, value: ["trump-donald-j"] });
  });

  it("still refuses a name nobody on the roster holds", () => {
    const r = resolveOfficials(["Nancy Pelosi"], ROSTER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.candidates).toEqual([]);
  });
});

describe("dollar windows", () => {
  it("accepts both bounds", () => {
    const parsed = parseQueryPlan({
      filters: { amountAtLeast: 250_000, amountAtMost: 500_000 },
      aggregate: "count",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.filters.amountAtMost).toBe(500_000);
  });

  it("rejects an inverted window", () => {
    expect(
      parseQueryPlan({
        filters: { amountAtLeast: 500_000, amountAtMost: 250_000 },
        aggregate: "count",
      }).ok
    ).toBe(false);
  });

  it("names both bounds in the restatement, so neither can go missing", () => {
    const text = describePlan(
      { filters: { amountAtLeast: 250_000, amountAtMost: 500_000 }, aggregate: "count" },
      OFFICIALS
    );
    expect(text).toBe(
      "Trades whose disclosed range falls entirely between $250,000 and $500,000, counted."
    );
  });

  it("names a lone ceiling", () => {
    const text = describePlan({ filters: { amountAtMost: 500_000 }, aggregate: "count" }, OFFICIALS);
    expect(text).toContain("tops out at $500,000 or less");
  });
});

describe("comparisons", () => {
  it("resolves both named officials into one ranking plan", () => {
    const parsed = parseQueryPlan({
      filters: { officials: ["Bessent", "Burgum"], types: ["Purchase"] },
      aggregate: "top_officials",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = resolvePlan(parsed.plan, OFFICIALS, []);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.filters.officials).toEqual(["bessent-scott", "burgum-doug"]);
    expect(resolved.value.aggregate).toBe("top_officials");
  });

  it("caps a comparison at five officials", () => {
    expect(MAX_OFFICIALS).toBe(5);
  });
});

describe("late_share normalization", () => {
  it("drops lateOnly, which would make the share 100 percent by construction", () => {
    const p = normalizePlan({
      filters: { officials: ["wright-christopher"], lateOnly: true },
      aggregate: "late_share",
    });
    expect(p.filters.lateOnly).toBeUndefined();
    expect(p.filters.officials).toEqual(["wright-christopher"]);
  });

  it("leaves lateOnly alone on other aggregates", () => {
    expect(normalizePlan({ filters: { lateOnly: true }, aggregate: "count" }).filters.lateOnly).toBe(
      true
    );
  });
});

// Item 6: a decline must never be the last word on whether a person exists.
describe("item 6: officialsNamedIn", () => {
  it("finds a tracked official by surname in free text", () => {
    const hits = officialsNamedIn("What did Burgum buy in 2026?", OFFICIALS);
    expect(hits.map((o) => o.slug)).toEqual(["burgum-doug"]);
  });

  it("finds one by full name", () => {
    expect(
      officialsNamedIn("How many trades did Scott Bessent report?", OFFICIALS).map((o) => o.slug)
    ).toEqual(["bessent-scott"]);
  });

  it("returns every candidate when a surname is shared", () => {
    expect(officialsNamedIn("What did Smith sell?", OFFICIALS)).toHaveLength(2);
  });

  it("finds nobody in a question that names nobody", () => {
    expect(officialsNamedIn("Is insider trading legal?", OFFICIALS)).toEqual([]);
  });

  it("does not match a surname inside another word", () => {
    expect(officialsNamedIn("What about burgundy bonds?", OFFICIALS)).toEqual([]);
  });
});

// Item 8: a holdover's rows are in scope, and the restatement says so.
describe("item 8: former officials", () => {
  const ROSTER = [
    ...OFFICIALS,
    {
      slug: "criswell-deanne",
      name: "Deanne Criswell",
      filedName: "Criswell, Deanne",
      title: "Administrator",
      agency: "FEMA",
      former: true,
    },
  ];

  it("resolves a holdover like anyone else", () => {
    expect(resolveOfficials(["Criswell"], ROSTER)).toEqual({
      ok: true,
      value: ["criswell-deanne"],
    });
  });

  it("marks a holdover as former in the restatement", () => {
    const text = describePlan(
      { filters: { officials: ["criswell-deanne"] }, aggregate: "count" },
      ROSTER
    );
    expect(text).toBe("Trades by Deanne Criswell (former), counted.");
  });

  it("leaves a current official unmarked", () => {
    const text = describePlan(
      { filters: { officials: ["burgum-doug"] }, aggregate: "count" },
      ROSTER
    );
    expect(text).toBe("Trades by Doug Burgum, counted.");
  });
});
