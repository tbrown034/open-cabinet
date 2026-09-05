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
  "NV",
  "SA",
  "AG",
  "CD",
  "JR",
  "SR",
  "NEW",
  "OLD",
  "COM",
  "CL",
  "SER",
  "PFD",
]);

/**
 * Real symbols that also appear as ordinary suffixes. Kept only when the
 * description names the issuer. Small on purpose; grows by review.
 */
export const SHORT_SYMBOL_ISSUERS: Record<string, RegExp> = {
  DE: /\bdeere\b/i,
  CO: /\bglobal cord\b/i,
  A: /\bagilent\b/i,
  F: /\bford\b/i,
  T: /\bat&t\b|\bat & t\b/i,
  C: /\bcitigroup\b/i,
  K: /\bkellanova\b|\bkellogg\b/i,
  V: /\bvisa\b/i,
  X: /\bunited states steel\b|\bu\.?s\.? steel\b/i,
  B: /\bbarrick\b/i,
  M: /\bmacy/i,
  O: /\brealty income\b/i,
  S: /\bsentinelone\b/i,
  D: /\bdominion\b/i,
  L: /\bloews\b/i,
  R: /\bryder\b/i,
  Z: /\bzillow\b/i,
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
    return { ok: false, why: `single letter "${sym}" is a share-class marker unless reviewed` };
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
  if (ranked[0]) return ranked[0][0];
  // Inverted form "GAJPX (Goldman Sachs Dynamic Municipal Income Fund)":
  // the parenthetical is the name.
  for (const d of descriptions) {
    const m = d.match(/^\s*[A-Z.]{1,7}\s*\(([^)]{4,})\)\s*$/);
    if (m) return m[1].trim();
  }
  return ticker.toUpperCase();
}
