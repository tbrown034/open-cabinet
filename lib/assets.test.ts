import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  NEVER_A_SYMBOL,
  SYMBOL_SHAPE,
  cleanCompanyName,
  companyGroupName,
  resolveTicker,
} from "./assets";
import { TICKER_NAME_OVERRIDES } from "./data";

describe("resolveTicker", () => {
  it("keeps an ordinary filed symbol", () => {
    expect(resolveTicker("Apple, Inc. (AAPL)", "AAPL")).toEqual({ ticker: "AAPL", source: "filed" });
    expect(resolveTicker("Berkshire Hathaway Class B", "BRK.B").ticker).toBe("BRK.B");
  });

  it("withholds a name suffix that was read as a symbol", () => {
    for (const d of ["KROGER CO (THE)", "American Tower Corporation (REIT)", "WILLIAMS COS INC (DEL)"]) {
      const r = resolveTicker(d, d.match(/\((\w+)\)$/)![1]);
      expect(r.ticker).toBeNull();
      expect(r.source).toBe("withheld");
      expect(r.warning).toMatch(/suffix/);
    }
  });

  it("keeps an ambiguous short symbol only when the description names the issuer", () => {
    expect(resolveTicker("Deere & Co. (DE)", "DE").ticker).toBe("DE");
    expect(resolveTicker("Ovintiv Inc. (DE)", "DE").ticker).toBeNull();
    expect(resolveTicker("Agilent Technologies, Inc. (A)", "A").ticker).toBe("A");
    expect(resolveTicker("Barrick Mining Corp (B)", "B").ticker).toBe("B");
    expect(resolveTicker("Some Fund Class (A)", "A").ticker).toBeNull();
  });

  it("does not fill an empty ticker at read time, and fills carefully at parse time", () => {
    expect(resolveTicker("Ovintiv Inc. (DE) (OVV)", null)).toEqual({ ticker: null, source: "none" });
    expect(resolveTicker("Ovintiv Inc. (DE) (OVV)", null, { fillFromParenthetical: true }).ticker).toBe("OVV");
    expect(resolveTicker("American Tower Corporation (REIT)", null, { fillFromParenthetical: true }).ticker).toBeNull();
    expect(resolveTicker("Arthur Ventures IV, LP - Decimal Technologies, Inc. (IRA)", null, { fillFromParenthetical: true }).ticker).toBeNull();
    expect(resolveTicker("Old Farm Partners", null, { fillFromParenthetical: true })).toEqual({ ticker: null, source: "none" });
  });

  it("withholds brokerage shorthand that is not symbol-shaped", () => {
    expect(resolveTicker("KEYCORP DP SH PFD H", "KEYpI").ticker).toBeNull();
    expect(resolveTicker("BANK OF AMERICA PFD", "K-PEC").ticker).toBeNull();
  });
});

describe("companyGroupName", () => {
  it("never names a company after a swap, bond or preferred line when a plain name exists", () => {
    const name = companyGroupName(
      [
        "Total return swap contract with JPMorgan (value not readily ascertainable)",
        "JPMorgan Chase & Co 7.132% Due 2065",
        "JPMorgan Chase & Co.",
        "JPMorgan Chase & Co.",
      ],
      "JPM"
    );
    expect(name).toBe("JPMorgan Chase & Co.");
  });

  it("uses the inverted form's parenthetical when that is all there is", () => {
    expect(companyGroupName(["SPMD (S&P 400 Mid-Cap ETF)"], "SPMD")).toBe("S&P 400 Mid-Cap ETF");
  });

  it("falls back to the symbol when nothing names the company", () => {
    expect(companyGroupName(["SPY"], "SPY")).toBe("SPY");
  });

  it("titles a group by its symbol when only instrument lines were filed", () => {
    expect(companyGroupName(["KEYCORP DP SH PFD H - KEY", "KEYCORP DP SH PFD H"], "KEY")).toBe("KEY");
    expect(companyGroupName(["Total return swap contract with JPMorgan"], "JPM")).toBe("JPM");
  });

  it("keeps real symbols that look like suffixes when the issuer is named", () => {
    expect(resolveTicker("Colgate-Palmolive Co (CL)", "CL").ticker).toBe("CL");
    expect(resolveTicker("First Majestic Silver Corp (AG)", "AG").ticker).toBe("AG");
    expect(resolveTicker("Seabridge Gold Inc (SA)", "SA").ticker).toBe("SA");
    expect(resolveTicker("Some Holdings SA", "SA").ticker).toBeNull();
    expect(resolveTicker("Ford Motor Co (F)", "F").ticker).toBe("F");
    expect(resolveTicker("Growth Fund Class (F)", "F").ticker).toBeNull();
  });

  it("strips a trailing parenthetical and share-class boilerplate", () => {
    expect(cleanCompanyName("Liberty Energy Inc. (LBRT)")).toBe("Liberty Energy Inc.");
    expect(cleanCompanyName("Alphabet Inc. Class A")).toBe("Alphabet Inc.");
  });
});

describe("published data: ticker hygiene", () => {
  const dir = path.join(process.cwd(), "data", "officials");
  const rows: Array<{ slug: string; description: string; ticker: string | null }> = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const o = JSON.parse(readFileSync(path.join(dir, file), "utf-8"));
    for (const t of o.transactions) rows.push({ slug: o.slug, description: t.description, ticker: t.ticker ?? null });
  }

  it("no stored ticker is a name suffix, after the five THE rows are patched", () => {
    const bad = rows.filter((r) => r.ticker && NEVER_A_SYMBOL.has(r.ticker.toUpperCase()));
    // Five Trump rows carry ticker "THE" until the approved data patch lands.
    // The resolver withholds them at read time; this assertion pins the
    // count so a sixth cannot appear unnoticed, and drops to zero after.
    expect(bad.length).toBeLessThanOrEqual(5);
    expect(bad.every((r) => r.ticker === "THE" && r.slug === "trump-donald-j")).toBe(true);
  });

  it("every stored ticker is symbol-shaped", () => {
    const bad = rows.filter((r) => r.ticker && !SYMBOL_SHAPE.test(r.ticker.toUpperCase()));
    expect(bad.map((r) => `${r.slug}: ${r.ticker}`)).toEqual([]);
  });

  it("no filed ticker disagrees with an explicit symbol in its own description", () => {
    const bad: string[] = [];
    for (const r of rows) {
      if (!r.ticker) continue;
      const m = r.description.match(/\(([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\)\s*$/);
      if (!m) continue;
      const shown = m[1];
      if (NEVER_A_SYMBOL.has(shown)) continue;
      if (shown !== r.ticker.toUpperCase()) bad.push(`${r.slug}: ${r.ticker} vs (${shown}) in "${r.description}"`);
    }
    expect(bad).toEqual([]);
  });

  it("every display-name override shares a word with a filed description for that ticker", () => {
    const bad: string[] = [];
    for (const [ticker, name] of Object.entries(TICKER_NAME_OVERRIDES)) {
      const filed = rows.filter((r) => r.ticker?.toUpperCase() === ticker).map((r) => r.description.toLowerCase());
      if (filed.length === 0) continue;
      const words = name.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const ok = filed.some((d) => words.some((w) => d.includes(w)));
      if (!ok) bad.push(`${ticker}: "${name}" matches no filed description`);
    }
    expect(bad).toEqual([]);
  });
});
