/**
 * Asset identity, first slice: which string may be called a ticker, and
 * what a company group is named.
 *
 * Why this exists. Ninety percent of rows carry no ticker, and the ones
 * that do got it either from the model reading a parenthetical or from a
 * regex that took any trailing capitals in parentheses. "KROGER CO (THE)"
 * became ticker THE, and /companies/the merged five companies. Two
 * hand-written fund names were wrong and overrode the filing's own text.
 *
 * The rules here are deliberately narrow and context-sensitive:
 *   - A short list of tokens is never a symbol ("(THE)" after an inverted
 *     name, "(REIT)", "(DEL)"). Those are withheld, with a warning.
 *   - A short list of real symbols that collide with common suffixes (DE is
 *     Deere and also Delaware) is kept only when the description names the
 *     issuer. Otherwise withheld, with a warning.
 *   - Everything else keeps the filed symbol. Nothing is invented: a
 *     withheld symbol is null and the description is untouched.
 *   - A company group is named from a description that reads as the
 *     company, never from a swap, bond, option, preferred or account line.
 *
 * Raw values are never rewritten. Resolution happens when rows are read.
 * The full registry (instrument versus issuer, share classes, validity
 * dates, reviewer) is Gate 2 work and lives in a data file, not here.
 */

/** Tokens that appear in a parenthetical after a name and are never a symbol. */
export const NEVER_A_SYMBOL = new Set([
  // Each of these was checked against listed symbols: none is a ticker.
  // A token that IS a ticker somewhere (CL, AG, SA, DE, CO) is never here;
  // it goes in SHORT_SYMBOL_ISSUERS with the issuer that owns it.
  "THE",
  "REIT",
  "ETF",
  "ADR",
  "ADS",
  "DEL",
  "ROTH",
  "IRA",
  "CUSIP",
  "ESOP",
  "LLC",
  "LLP",
  "LP",
  "INC",
  "CORP",
  "PLC",
  "JR",
  "NEW",
  "OLD",
  "COM",
  "SER",
  "PFD",
]);

/**
 * Real symbols that also appear as ordinary suffixes. Kept only when the
 * description names the issuer. Small on purpose; grows by review.
 */
export const SHORT_SYMBOL_ISSUERS: Record<string, RegExp> = {
  // Every single-letter NYSE symbol, with the issuer that owns it. A
  // single letter in a parenthetical is far more often a share class, so a
  // single letter is a ticker only when the description names its issuer.
  A: /\bagilent\b/i,
  B: /\bbarrick\b|\bbarnes group\b/i,
  C: /\bcitigroup\b/i,
  D: /\bdominion\b/i,
  E: /\beni\b/i,
  F: /\bford\b/i,
  G: /\bgenpact\b/i,
  H: /\bhyatt\b/i,
  J: /\bjacobs\b/i,
  K: /\bkellanova\b|\bkellogg\b/i,
  L: /\bloews\b/i,
  M: /\bmacy/i,
  O: /\brealty income\b/i,
  R: /\bryder\b/i,
  S: /\bsentinelone\b/i,
  T: /\bat&t\b|\bat & t\b/i,
  U: /\bunity software\b/i,
  V: /\bvisa\b/i,
  W: /\bwayfair\b/i,
  X: /\bunited states steel\b|\bu\.?s\.? steel\b/i,
  Y: /\balleghany\b/i,
  Z: /\bzillow\b/i,
  // Two-letter symbols that collide with legal forms, state codes or suffixes.
  DE: /\bdeere\b/i,
  CO: /\bglobal cord\b/i,
  AG: /\bfirst majestic\b/i,
  SA: /\bseabridge\b/i,
  CL: /\bcolgate\b/i,
  NV: /\bnovonix\b/i,
  CD: /\bchindata\b/i,
  SR: /\bspire\b/i,
  US: /\bu\.?s\.? bancorp\b/i,
  NA: /\bnano-x\b/i,
};

export const SYMBOL_SHAPE = /^[A-Z]{1,5}(?:\.[A-Z]{1,2})?$/;

export interface TickerResolution {
  ticker: string | null;
  /** Where the symbol came from, or why it was withheld. */
  source: "filed" | "parenthetical" | "withheld" | "none";
  warning?: string;
}

function acceptSymbol(candidate: string, description: string): { ok: boolean; why?: string } {
  // Brokerage shorthand marks preferred series with a lowercase letter
  // ("KEYpI", "BACpL"). A real symbol is all capitals, so the case is the tell.
  if (candidate !== candidate.toUpperCase()) {
    return { ok: false, why: `"${candidate}" is mixed case, brokerage shorthand rather than a symbol` };
  }
  const sym = candidate;
  if (!SYMBOL_SHAPE.test(sym)) return { ok: false, why: `"${candidate}" is not symbol-shaped` };
  if (NEVER_A_SYMBOL.has(sym)) return { ok: false, why: `"${sym}" is a name suffix, not a symbol` };
  const issuer = SHORT_SYMBOL_ISSUERS[sym];
  if (issuer && !issuer.test(description)) {
    return { ok: false, why: `"${sym}" is ambiguous and the description does not name its issuer` };
  }
  if (!issuer && sym.length === 1) {
    // Every real single-letter symbol is listed above, so an unlisted one
    // is a share-class marker, not a ticker.
    return { ok: false, why: `single letter "${sym}" is not a listed symbol; read as a share-class marker` };
  }
  return { ok: true };
}

/**
 * Decide the ticker for one row from the filed ticker and the description.
 * Never invents. Withholds with a reason.
 */
export function resolveTicker(
  description: string,
  filedTicker: string | null | undefined,
  options: {
    /** Fill an empty ticker from a parenthetical symbol. On at parse time,
     * where the model was asked to do the same. Off at read time: a stored
     * null stays null until a reviewed mapping says otherwise. */
    fillFromParenthetical?: boolean;
  } = {}
): TickerResolution {
  if (filedTicker) {
    const check = acceptSymbol(filedTicker, description);
    if (check.ok) return { ticker: filedTicker.toUpperCase(), source: "filed" };
    return { ticker: null, source: "withheld", warning: `filed ticker withheld: ${check.why}` };
  }
  if (!options.fillFromParenthetical) return { ticker: null, source: "none" };
  // Scan every parenthetical, right to left, so "Ovintiv Inc. (DE) (OVV)"
  // finds OVV and "American Tower Corporation (REIT)" finds nothing.
  const parens = [...description.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim()).reverse();
  let lastWhy: string | undefined;
  for (const p of parens) {
    if (!/^[A-Za-z.]{1,7}$/.test(p)) continue;
    const check = acceptSymbol(p, description);
    if (check.ok) return { ticker: p.toUpperCase(), source: "parenthetical" };
    lastWhy = check.why;
  }
  if (lastWhy) return { ticker: null, source: "withheld", warning: `parenthetical withheld: ${lastWhy}` };
  return { ticker: null, source: "none" };
}

/** Description lines that describe an instrument on the company, not the company. */
export const INSTRUMENT_LINE =
  /\bswap\b|\boption\b|\bput\b|\bcall\b|\bwarrant\b|\bdue\s+20\d\d\b|\d+(?:\.\d+)?\s*%|\bpfd\b|\bpreferred\b|\bdepositary\b|\bshares in retirement\b|\bnote(?:s)?\b|\bbond(?:s)?\b|\bdebenture|\bconv\b|\bexercise\b|\bstrike\b/i;

/** Strip a trailing parenthetical and legal boilerplate for display. */
export function cleanCompanyName(description: string): string {
  return description
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+(?:com|common stock|class [a-c])\s*$/i, "")
    .trim();
}

/**
 * Name a company group from the descriptions filed under its ticker.
 * Prefers the most frequent description that reads as the company itself.
 * Falls back to the most frequent line of any kind, so a group is never
 * nameless, but a swap or a bond wins only when nothing else exists.
 */
export function companyGroupName(descriptions: string[], ticker: string): string {
  const counts = new Map<string, number>();
  for (const d of descriptions) {
    const name = cleanCompanyName(d);
    if (!name || name.toUpperCase() === ticker.toUpperCase()) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
  const plain = ranked.find(([name]) => !INSTRUMENT_LINE.test(name));
  if (plain) return plain[0];
  // Only instrument lines (a preferred series, a bond, a swap) were filed
  // under this symbol. None of them is the company's name, so the group is
  // titled by its symbol until a reviewed mapping supplies the issuer.
  // Inverted form "GAJPX (Goldman Sachs Dynamic Municipal Income Fund)":
  // the parenthetical is the name.
  for (const d of descriptions) {
    const m = d.match(/^\s*[A-Z.]{1,7}\s*\(([^)]{4,})\)\s*$/);
    if (m) return m[1].trim();
  }
  return ticker.toUpperCase();
}
