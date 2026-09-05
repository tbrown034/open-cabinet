import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import {
  SEC_SNAPSHOT_PATH,
  canonicalizeSymbol,
  loadAssetRegistry,
  lookupAsset,
  registryDisplayName,
  resolveSymbol,
} from "./asset-registry";
import { SYMBOL_SHAPE } from "./assets";
import { getTradesByTicker } from "./data";

describe("asset registry files", () => {
  const { registry, pending } = loadAssetRegistry();

  it("records the SEC snapshot it was seeded from, and the snapshot still matches", () => {
    expect(registry.meta.source.url).toBe("https://www.sec.gov/files/company_tickers.json");
    expect(registry.meta.source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const sha = createHash("sha256").update(readFileSync(SEC_SNAPSHOT_PATH)).digest("hex");
    expect(registry.meta.source.snapshotSha256).toBe(sha);
    expect(path.join(process.cwd(), registry.meta.source.snapshot)).toBe(SEC_SNAPSHOT_PATH);
  });

  it("meta counts match the entries", () => {
    expect(Object.keys(registry.assets).length).toBe(registry.meta.entries);
    expect(Object.keys(pending.pending).length).toBe(pending.meta.entries);
    expect(registry.meta.pending).toBe(pending.meta.entries);
    expect(registry.meta.entries + registry.meta.pending).toBe(registry.meta.symbolsInData);
  });

  it("no symbol is in both files, and every key is its entry's symbol", () => {
    for (const [key, e] of Object.entries(registry.assets)) {
      expect(e.symbol).toBe(key);
      expect(pending.pending[key]).toBeUndefined();
    }
    for (const [key, e] of Object.entries(pending.pending)) expect(e.symbol).toBe(key);
  });

  it("every SEC entry carries a name, a CIK, a fetch date and a review block", () => {
    for (const e of Object.values(registry.assets)) {
      expect(e.secName.length).toBeGreaterThan(0);
      expect(Number.isInteger(e.cik) && e.cik > 0).toBe(true);
      expect(e.source.fetchedAt).toBe(registry.meta.source.fetchedAt);
      expect(["unreviewed", "reviewed"]).toContain(e.review.status);
      expect(["shares_a_word", "no_shared_word"]).toContain(e.nameAgreement);
      expect(e.filedAs.length).toBeGreaterThan(0);
      expect(e.filedSymbols).toContain(e.symbol);
    }
  });

  it("every pending entry says why it is pending and what it was filed as", () => {
    for (const e of Object.values(pending.pending)) {
      expect(e.reason).toBe("not in SEC company_tickers.json");
      expect(e.filedAs.length).toBeGreaterThan(0);
      expect(["unreviewed", "reviewed"]).toContain(e.review.status);
    }
  });

  it("every registry symbol is symbol-shaped", () => {
    for (const s of [...Object.keys(registry.assets), ...Object.keys(pending.pending)]) {
      expect(SYMBOL_SHAPE.test(s), s).toBe(true);
    }
  });

  it("an inferred instrument type is labeled inferred", () => {
    for (const e of [...Object.values(registry.assets), ...Object.values(pending.pending)]) {
      if (e.review.status === "unreviewed") expect(e.instrumentTypeSource).toBe("inferred_from_name");
    }
  });

  it("every alias carries evidence and resolves to its entry", () => {
    for (const e of [...Object.values(registry.assets), ...Object.values(pending.pending)]) {
      for (const a of e.aliases) {
        expect(a.evidence.length).toBeGreaterThan(10);
        expect(resolveSymbol(a.filedSymbol)).toBe(e.symbol);
      }
    }
  });
});

describe("symbol resolution", () => {
  it("normalizes the SEC's hyphen to the site's dot", () => {
    expect(canonicalizeSymbol("brk-b")).toBe("BRK.B");
    expect(canonicalizeSymbol("AAPL")).toBe("AAPL");
  });

  it("folds recorded filed variants into one symbol", () => {
    expect(resolveSymbol("APPL")).toBe("AAPL");
    expect(resolveSymbol("BRKB")).toBe("BRK.B");
    expect(resolveSymbol("BRK-B")).toBe("BRK.B");
    expect(resolveSymbol("BRK.B")).toBe("BRK.B");
  });

  it("looks up SEC entries, pending entries and nothing else", () => {
    const aapl = lookupAsset("AAPL");
    expect(aapl.kind).toBe("sec");
    if (aapl.kind === "sec") expect(aapl.entry.cik).toBe(320193);
    expect(lookupAsset("GAJPX").kind).toBe("pending");
    expect(lookupAsset("ZZZZZ").kind).toBe("unknown");
  });

  it("gives a display name for a bare symbol, from the carried table or the SEC", () => {
    expect(registryDisplayName("GAJPX")).toBe("Goldman Sachs Dynamic Municipal Income Fund");
    expect(registryDisplayName("SPY")).toBe("SPDR S&P 500 ETF Trust");
    expect(registryDisplayName("AAPL")).toBe("Apple Inc.");
    expect(registryDisplayName("ZZZZZ")).toBeNull();
  });
});

describe("company pages against the registry", () => {
  it("every symbol on a company page is in the registry or pending, never unknown", async () => {
    const companies = await getTradesByTicker();
    expect(companies.size).toBeGreaterThan(300);
    const unknown = [...companies.values()].filter((c) => c.registry.kind === "unknown").map((c) => c.ticker);
    expect(unknown).toEqual([]);
  });

  it("no company page carries a symbol another entry folds away", async () => {
    const companies = await getTradesByTicker();
    for (const ticker of companies.keys()) expect(resolveSymbol(ticker)).toBe(ticker);
    expect(companies.has("APPL")).toBe(false);
    expect(companies.has("BRKB")).toBe(false);
    expect(companies.get("BRK.B")?.trades.length).toBeGreaterThanOrEqual(5);
  });

  it("a business development company is not Belden", async () => {
    const companies = await getTradesByTicker();
    const bdc = companies.get("BDC");
    expect(bdc?.trades.some((t) => /MSD Investment/i.test(t.description)) ?? false).toBe(false);
  });
});
