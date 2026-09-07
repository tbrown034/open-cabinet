import { describe, expect, it } from "vitest";
import { assetNameKey, normalizeAssetName, printedShareClass, referenceNameKey } from "./asset-normalize";
import { classifyInstrument } from "./instrument-type";
import { canonicalListedSymbol, loadAssetReference, sharesDistinctiveWord } from "./asset-reference";
import { defaultContext, resolveAsset, type ResolutionContext } from "./asset-resolution";

/**
 * The golden set: every hard case from the Sep 6, 2026 survey of real
 * descriptions, with the outcome the lane must produce. The rule under
 * test is Trevor's: a wrong ticker is worse than a missing one. Every
 * case below that expects no ticker is a case where a looser matcher
 * would have printed the wrong company.
 */
const ctx: ResolutionContext = defaultContext();
const r = (description: string, ticker: string | null = null) => resolveAsset({ description, ticker }, ctx);

describe("normalizing printed names", () => {
  it("strips broker boilerplate, class markers, codes and parenthetical symbols, never the name", () => {
    expect(normalizeAssetName("Apple Inc Com Solicited Order Discretion Exercised Average Unit Price Transaction Your Broker Acted As Agent")).toBe("APPLE INC");
    expect(normalizeAssetName("Ishares Tr Russell 1000 Etf E1774634153032-00500 Average Unit Price Transaction Your Broker Acted As Agent")).toBe("ISHARES TR RUSSELL 1000 ETF");
    expect(normalizeAssetName("Ovintiv Inc. (DE) (OVV)")).toBe("OVINTIV INC");
    expect(normalizeAssetName("Eaton Corporation Plc Shs Isin#le00b8kqn827 Solicited Order Discretion Exercised")).toBe("EATON CORPORATION PLC");
  });
  it("keys meet across broker and reference spellings, and only exact keys meet", () => {
    expect(assetNameKey("Apple, Inc. (AAPL)")).toBe("APPLE");
    expect(referenceNameKey("Apple Inc. - Common Stock")).toBe("APPLE");
    expect(assetNameKey("Apple Hospitality REIT, Inc. (APLE)")).toBe("APPLE HOSPITALITY REIT");
    expect(assetNameKey("McDonald's Corp")).toBe(referenceNameKey("McDonald's Corporation - Common Stock"));
    expect(assetNameKey("QUALCOMM INC/DE")).toBe(assetNameKey("QUALCOMM Incorporated"));
    expect(assetNameKey("PROGRESSIVE CORP OH")).toBe(assetNameKey("PROGRESSIVE CORP/OH/"));
    expect(assetNameKey("PHILIP MORRIS INTL INC")).toBe(assetNameKey("Philip Morris International Inc."));
    expect(assetNameKey("LINDE PLC F")).toBe("LINDE");
    // Folding INSTRUMENTS to INSTRS is deterministic, so the broker's
    // abbreviation and the listing meet on an exact key.
    expect(assetNameKey("TEXAS INSTRS INC")).toBe(referenceNameKey("Texas Instruments Incorporated - Common Stock"));
    expect(assetNameKey("TEXAS PACIFIC LAND CORPORATION")).not.toBe(assetNameKey("TEXAS INSTRS INC"));
  });
  it("reads the printed share class", () => {
    expect(printedShareClass("Berkshire Hathaway Inc Del Cl B New")).toBe("B");
    expect(printedShareClass("Alphabet Inc Cl A")).toBe("A");
    expect(printedShareClass("APPLE INC")).toBeNull();
  });
  it("canonicalizes class symbols across the three spellings", () => {
    expect(canonicalListedSymbol("BRK-B")).toBe("BRK.B");
    expect(canonicalListedSymbol("BRK/B")).toBe("BRK.B");
    expect(canonicalListedSymbol("brk.b")).toBe("BRK.B");
  });
});

describe("instrument typing", () => {
  const t = (d: string) => classifyInstrument(d, null).type;
  it("types every kind from the text", () => {
    expect(t("PENNSYLVANIA ECON DEV FING AUTH UPMC REV UNIV PITTSBURGH MED CTR A B/E 4.00 % Due Oct 15, 2026")).toBe("municipal_bond");
    expect(t("ADAMS CNTY CO SCH DIST 001 MAPLETON PUB SCHS B/E 5.00 % Due Dec 1, 2030")).toBe("municipal_bond");
    expect(t("LIBERTY HILL TX RFDG B/E 4.00 % Due Sep 1, 2026")).toBe("municipal_bond");
    expect(t("State of Connecticut, bond (Cusip 207758U84)")).toBe("municipal_bond");
    expect(t("GENERAL MTRS FINL CO INC DUE 03/01/2026 05.250% MS 01 DISCRETIONARY ORDER YIELD 4.9")).toBe("corporate_note");
    expect(t("BLOCK FINL LLC SENIOR UNSECURED NOTE DUE 08/15/2030 03.875% FA 15")).toBe("corporate_note");
    expect(t("WELLS FARGO & CO PERP A BB N 3.9000% 12/31/49")).toBe("preferred");
    expect(t("KEYCORP DP SH PFD H DTD 08/24/22 RT 6.200%")).toBe("preferred");
    expect(t("AT&T INC 5 DEP RP PFD A - T.PR.A.")).toBe("preferred");
    expect(t("UNITED STATES TREASURY BILL")).toBe("treasury");
    expect(t("Crypto: SOL")).toBe("crypto");
    expect(t("THSDFS LLC - Series 31")).toBe("private");
    expect(t("Coinbase Global Inc. (COIN) call option exercise 5")).toBe("option");
    expect(t("STATE STRT INDSTL SLCT SCTR SPDR ETF")).toBe("etf");
    expect(t("SPDR SERIES TRUST STATE STREET SPDR PORTFOLIO HIGH YIELD BOND ETF DISCRETIONARY ORDER J.P. MORGAN SECURITIES LLC")).toBe("etf");
    expect(t("Dodge & Cox International Stock Fund (DODFX)")).toBe("mutual_fund");
    expect(t("AMERICAN GW FD OF AMERICA F2 CONFIRM NBR (GFFFX)")).toBe("mutual_fund");
    expect(t("TEXAS INSTRS INC")).toBe("common_stock");
    expect(t("Haleon plc American Depositary Shares (Each representing two Ordinary Shares) (HLN)")).toBe("common_stock");
    expect(t("AGNC Investment Corp. Depositary Shares Each Representing a 1/1000th Interest in a Share of 7.00% Series C Preferred Stock (AGNCN)")).toBe("preferred");
    expect(t("COGNIZANT TECHNOLOGY SOL CLASS A")).toBe("common_stock");
  });
  it("labels bonds by issuer, briefly", () => {
    expect(classifyInstrument("HARRIS CNTY TX MUD 495 AGI B/E 4.00 % Due Sep 1, 2035", null).issuerLabel).toMatch(/^Municipal bond, Harris County TX/);
    expect(classifyInstrument("UNITED STATES TREASURY BILL", null).issuerLabel).toBe("U.S. Treasury");
  });
});

describe("resolution rules", () => {
  it("R1: a printed symbol is accepted only when a listing corroborates it", () => {
    const a = r("Apple, Inc. (AAPL)", "AAPL");
    expect([a.tier, a.resolvedTicker, a.rule]).toEqual(["T1", "AAPL", "R1 filed ticker, corroborated"]);
    const t = r("AT&T Inc. (T)", "T");
    expect([t.tier, t.resolvedTicker]).toEqual(["T1", "T"]);
  });
  it("APL never becomes Apple, with or without a printed symbol", () => {
    const printed = r("Apple Inc (APL)", "APL");
    expect(printed.resolvedTicker).toBeNull();
    expect(printed.tier).not.toBe("T1");
    expect(r("APL").resolvedTicker).toBeNull();
    // A muni issuer whose name contains APL stays a bond.
    expect(r("ADAMS CNTY CO SCH DIST 001 MAPLETON PUB SCHS B/E 5.00 % Due Dec 1, 2030").instrumentType).toBe("municipal_bond");
  });
  it("Apple Hospitality REIT never becomes Apple Inc", () => {
    const x = r("Apple Hospitality REIT, Inc. (APLE)", "APLE");
    expect(x.resolvedTicker === null || x.resolvedTicker === "APLE").toBe(true);
    expect(x.resolvedTicker).not.toBe("AAPL");
    const y = r("APPLE HOSPITALITY REIT INC");
    expect(y.resolvedTicker).not.toBe("AAPL");
  });
  it("R3: exact name on both lists resolves, through the boilerplate and through a folded abbreviation", () => {
    const apple = r("Apple Inc Com Solicited Order Discretion Exercised Average Unit Price Transaction Your Broker Acted As Agent");
    expect([apple.tier, apple.resolvedTicker]).toEqual(["T1", "AAPL"]);
    const txn = r("TEXAS INSTRS INC");
    expect([txn.tier, txn.resolvedTicker]).toEqual(["T1", "TXN"]);
    // An abbreviation the table does not know stays unresolved.
    const abbott = r("ABBOTT LABS");
    expect(abbott.tier === "T1" ? abbott.resolvedTicker : null).toSatisfy((v: string | null) => v === null || v === "ABT");
    expect(r("OLLIES BARGAIN OUTLET HL").resolvedTicker).toBeNull();
  });
  it("R2: the dictionary resolves a broker abbreviation, and only that exact key", () => {
    const withDict: ResolutionContext = { ...ctx, dictionary: new Map([["TEXAS INSTRS", { nameKey: "TEXAS INSTRS", ticker: "TXN", decidedBy: "trevor", decidedAt: "2026-09-07T00:00:00Z", evidence: "page 1 row 16 prints TEXAS INSTRS INC; Texas Instruments Inc, Nasdaq TXN" }]]) };
    const a = resolveAsset({ description: "TEXAS INSTRS INC", ticker: null }, withDict);
    expect([a.tier, a.resolvedTicker, a.rule]).toEqual(["T1", "TXN", "R2 dictionary"]);
    expect(resolveAsset({ description: "TEXAS PACIFIC LAND CORPORATION", ticker: null }, withDict).resolvedTicker).not.toBe("TXN");
  });
  it("R0: an exception blocks every later rule", () => {
    const withEx: ResolutionContext = { ...ctx, exceptions: new Map([["APPLE", { nameKey: "APPLE", reason: "test", decidedBy: "trevor", decidedAt: "2026-09-07T00:00:00Z" }]]) };
    expect(resolveAsset({ description: "Apple Inc", ticker: null }, withEx).resolvedTicker).toBeNull();
  });
  it("class shares resolve only when the class is printed", () => {
    const b = r("Berkshire Hathaway Inc Del Cl B New Solicited Order Discretion Exercised");
    expect([b.tier, b.resolvedTicker]).toEqual(["T1", "BRK.B"]);
    const none = r("BERKSHIRE HATHAWAY INC");
    expect(none.resolvedTicker).toBeNull();
    expect(none.rule).toMatch(/ambiguous/);
    const goog = r("Alphabet Inc Cl A");
    expect([goog.tier, goog.resolvedTicker]).toEqual(["T1", "GOOGL"]);
  });
  it("preferreds, notes, munis, private holdings and options never get a stock ticker", () => {
    for (const d of ["KEYCORP DP SH PFD H DTD 08/24/22 RT 6.200%", "WELLS FARGO & CO PERP A BB N 3.9000% 12/31/49", "BLOCK FINL LLC SENIOR UNSECURED NOTE DUE 08/15/2030 03.875%", "LIBERTY HILL TX RFDG B/E 4.00 % Due Sep 1, 2026", "THSDFS LLC - Series 31", "Coinbase Global Inc. (COIN) call option exercise 5", "AT&T INC 5 DEP RP PFD A - T.PR.A."]) {
      const x = r(d);
      expect(x.resolvedTicker, d).toBeNull();
      expect(x.tier, d).toBeNull();
    }
  });
  it("a symbol that names a non-stock listing is refused even when printed", () => {
    const x = r("KEYCORP DP SH PFD H (KEY)", "KEY");
    expect(x.resolvedTicker).toBeNull();
  });
  it("COGNIZANT TECHNOLOGY SOL never becomes SOL, and an ETN never becomes its bank", () => {
    expect(r("COGNIZANT TECHNOLOGY SOL CLASS A").resolvedTicker).not.toBe("SOL");
    const jpm = r("JPMORGAN CHASE & CO");
    expect(jpm.resolvedTicker === null || jpm.resolvedTicker === "JPM").toBe(true);
    expect(jpm.candidates).not.toContain("AMJB");
  });
  it("a truncated broker name is a T2 candidate, never T1", () => {
    const x = r("FIDELITY NATL INFORMATIO");
    expect(x.tier).not.toBe("T1");
    expect(x.resolvedTicker).toBeNull();
  });
  it("a printed symbol no list confirms is T2 and shows no ticker", () => {
    const x = r("Zyxwv Widgets Inc (ZZZZQ)", "ZZZZQ");
    expect([x.tier, x.resolvedTicker]).toEqual(["T2", null]);
  });
  it("never resolves below T1 through any field a page could print", () => {
    const ref = loadAssetReference();
    expect(ref.listed.length).toBeGreaterThan(10000);
    for (const d of ["AH REALTY REIT", "ACM RESH INC CLASS A", "AMERICAN MUN PWR OH", "IBM", "DISNEY WALT"]) {
      const x = r(d);
      if (x.tier !== "T1") expect(x.resolvedTicker, d).toBeNull();
    }
  });
});

describe("sharesDistinctiveWord", () => {
  it("ignores legal and generic words", () => {
    expect(sharesDistinctiveWord("Apple Inc", "Apple Inc. - Common Stock")).toBe("APPLE");
    expect(sharesDistinctiveWord("American Tower Corp", "American Airlines Group Inc")).toBeNull();
  });
});
