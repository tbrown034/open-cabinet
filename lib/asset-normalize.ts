/**
 * Turn a printed asset description into a name that can be compared
 * against a reference list.
 *
 * Brokers print the same security many ways: "Apple Inc Com Solicited
 * Order Discretion Exercised Average Unit Price Transaction Your Broker
 * Acted As Agent", "APPLE INC", "Apple, Inc. (AAPL)". The trade text
 * after the name (order type, confirmation numbers, share-class markers,
 * ISIN fragments) is stripped here; the name itself is never altered
 * beyond case and punctuation, and nothing that could be a symbol is
 * removed. What is stripped and why is the surveyed junk list from
 * Sep 6, 2026 (docs: the "names" survey).
 *
 * This is one deterministic function. No lookups, no model.
 */

/** Phrases brokers append after the asset name. Longest first. */
const TRAILING_PHRASES: RegExp[] = [
  /\bAVERAGE UNIT PRICE TRANSACTION YOUR BROKER ACTED AS AGENT\b/,
  /\bYOUR BROKER ACTED AS AGENT\b/,
  /\bAVERAGE UNIT PRICE TRANSACTION\b/,
  /\bSOLICITED ORDER DISCRETION (?:EXERCISED|BASED)\b/,
  /\bDISCRETIONARY ORDER(?: YIELD[^A-Z]*)?\b/,
  /\bALLOCATED ORDER\b/,
  /\bUNSOLICITED\b/,
  /\bSOLICITED\b/,
  /\bREQUIRED SALE PURSUANT TO CD\b.*$/,
  /\bIF THIS CONFIRMAT\w*\b.*$/,
  /\bSEE ENDNOTE\b/,
  /\bCONFIRM NBR\b.*$/,
  /\bACCRUED INT(?:EREST)?(?: PAID)?\b/,
  /\bCALL@MW\+?\d*BP\b/,
  /\bYTM\s*=?\s*[\d.]+\b/,
  /\bYIELD\b.*$/,
  /\bOID\s*@\s*[\d.]+\b/,
  /\bDTD\s*\d+\b/,
  /\bFC\s*\d+\b/,
  /\bMS\s+\d{2}\b|\bJD\s+\d{2}\b|\bFA\s+\d{2}\b|\bMN\s+\d{2}\b|\bJJ\s+\d{2}\b|\bAO\s+\d{2}\b/,
  /\bVS\*?\s*0+\b/,
  /\bISIN\s*#?\s*[A-Z0-9]{8,12}\b/i,
  /\bSEDOL\s*#?\s*[A-Z0-9]{6,7}\b/i,
  /\bCUSIP\s*#?\s*[A-Z0-9]{6,9}\b/i,
  /\bE\d{10,14}-\d{3,6}\b/,
  /\b[A-Z]?\d{6,}-\d{3,}\b/,
  /\*{2,}/,
];

/** Share-class and security-form markers that are not part of the name. */
const CLASS_MARKERS: RegExp[] = [
  /\bCLASS\s+[A-C]\b/,
  /\bCL\s+[A-C]\b/,
  /\bCOMMON STOCK\b/,
  /\bCOM\b/,
  /\bSHS\b/,
  /\bSHARES\b/,
  /\bORD(?:INARY)?\b/,
  /\bNEW\b/,
  /\bDEL\b/,
  /\bREG\s*S\b/,
];

/** Legal suffixes that vary between printings of one issuer. */
const LEGAL_SUFFIXES = /\b(?:INC|INCORPORATED|CORP|CORPORATION|CO|COS|COMPANY|COMPANIES|LTD|LIMITED|PLC|LLC|L\.?P\.?|SA|S\.A\.|NV|N\.V\.|AG|SE|HOLDINGS?|HLDGS?|GROUP|GRP|THE)\b/g;

/** Uppercase, collapse punctuation to spaces, single spaces. */
export function foldAssetText(s: string): string {
  return s
    .toUpperCase()
    // Apostrophes and periods inside a word are spelling, not separators:
    // "McDonald's" is MCDONALDS, "U.S." is US, "N.V." is NV.
    .replace(/(?<=[A-Z])['\u2019](?=[A-Z])/g, "")
    .replace(/'/g, "")
    // A period inside a word is a separator in reference lists ("AMAZON
    // COM INC", "U S") and brokers agree often enough; treat it as one.
    .replace(/\.(?=[A-Z])/g, " ")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9.$%/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The name a broker printed, with trade boilerplate and class markers
 * removed, uppercased, punctuation folded. Legal suffixes are kept here
 * (a second key without them is produced by assetNameKey).
 */
export function normalizeAssetName(description: string): string {
  // Work on the raw text first for anything that folding would destroy:
  // parenthetical symbols "(AAPL)" (the symbol is resolveTicker's job, not
  // part of the name), confirmation codes with hyphens, ISIN/SEDOL/CUSIP
  // fragments, and share-class parentheticals like "(DE)".
  let raw = description
    .toUpperCase()
    .replace(/\(\s*[A-Z][A-Z.]{0,6}\s*\)/g, " ")
    .replace(/\(\s*(?:REIT|ADR|ADS|DE|NEW|OPTION[^)]*|CUSIP[^)]*)\s*\)/g, " ")
    .replace(/\b[A-Z]?\d{10,14}-\d{3,6}\b/g, " ")
    .replace(/\bISIN\s*#?\s*[A-Z0-9]{8,12}\b/g, " ")
    .replace(/\bSEDOL\s*#?\s*[A-Z0-9]{6,7}\b/g, " ")
    .replace(/\bCUSIP\s*#?\s*[A-Z0-9]{6,9}\b/g, " ");
  let s = foldAssetText(raw);
  for (const re of TRAILING_PHRASES) s = s.replace(re, " ");
  for (const re of CLASS_MARKERS) s = s.replace(re, " ");
  return s.replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, "").trim();
}

/**
 * The comparison key: the normalized name with legal suffixes removed
 * and "AND" folded, so "APPLE INC", "Apple, Inc." and "APPLE INC." meet.
 * Used for exact matches only; it is never a fuzzy key.
 */
export function assetNameKey(nameOrDescription: string): string {
  // SEC conformed names carry the state of incorporation as "/DE" or
  // "/OH/"; brokers print it as a trailing "OH". Neither is part of the
  // name.
  const base = normalizeAssetName(nameOrDescription.replace(/\/[A-Z]{2}\/?(?=\s|$)/g, " "));
  let key = base
    // Spelled-out legal forms with periods removed: "N V", "S A", "L P".
    .replace(/\b(?:N V|S A|L P|P L C|A G|S E|S P A|N A)\b/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\bAND\b/g, " ")
    .replace(/[.$%/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  key = key.split(" ").map((w) => ABBREVIATIONS[w] ?? w).join(" ");
  let words = key.split(" ");
  if (words.length >= 2 && TRAILING_STATE.has(words[words.length - 1])) words = words.slice(0, -1);
  // A trailing "F" marks a foreign ordinary share on a US broker
  // statement ("LINDE PLC F"); it is not part of the name.
  if (words.length >= 2 && words[words.length - 1] === "F") words = words.slice(0, -1);
  return words.join(" ");
}

/**
 * Both sides of a comparison are folded to the same short forms. Brokers
 * abbreviate; reference lists spell out. Folding the long form to the
 * short form is deterministic and cannot create a match that the words
 * themselves do not support.
 */
const ABBREVIATIONS: Record<string, string> = {
  INTERNATIONAL: "INTL", LABORATORIES: "LABS", COMPANIES: "COS", SERVICES: "SVCS", SVC: "SVCS", FINANCIAL: "FINL", PAYMENTS: "PMTS",
  ASSOCIATES: "ASSOC", TECHNOLOGIES: "TECH", TECHNOLOGY: "TECH", COMMUNICATIONS: "COMM", COMMUNICATION: "COMM", ENTERTAINMENT: "ENTMT",
  INDUSTRIES: "INDS", MANUFACTURING: "MFG", RESOURCES: "RES", CORPORATION: "CORP", INCORPORATED: "INC", PRODUCTS: "PRODS", PRODUCT: "PROD",
  SYSTEMS: "SYS", SYSTEM: "SYS", ELECTRONICS: "ELECTRS", INSTRUMENTS: "INSTRS", PHARMACEUTICALS: "PHARMA", PHARMACEUTICAL: "PHARMA",
  NATIONAL: "NATL", AMERICAN: "AMER", ENERGY: "ENERGY", ENTERPRISES: "ENTERPRISES", SOLUTIONS: "SOL", MOTORS: "MTRS", MOTOR: "MTR",
  MANAGEMENT: "MGMT", DEVELOPMENT: "DEV", DISTRIBUTION: "DISTR", EXCHANGE: "EXCH", PROPERTIES: "PPTYS", PROPERTY: "PPTY", REALTY: "RLTY",
  MEDICAL: "MED", HEALTHCARE: "HLTHCARE", HEALTH: "HLTH", GENERAL: "GENL", NETWORKS: "NETWKS", NETWORK: "NETWK", SEMICONDUCTOR: "SEMICOND",
  AUTOMOTIVE: "AUTO", PETROLEUM: "PETE", INSURANCE: "INS", CAPITAL: "CAP", EQUIPMENT: "EQUIP", INTERACTIVE: "INTERACTV",
};

/** Two-letter state tokens brokers and the SEC hang on the end of an issuer name. */
const TRAILING_STATE = new Set(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "OHIO", "TEX", "TENN", "PENN", "ILL", "MD"]);

/** The share class a broker printed ("CL B", "CLASS A"), before it is stripped. */
export function printedShareClass(description: string): string | null {
  const m = description.toUpperCase().match(/\b(?:CL|CLASS)\s+([A-C])\b/);
  return m ? m[1] : null;
}

/** The same key for a reference-list security name ("Apple Inc. - Common Stock"). */
export function referenceNameKey(securityName: string): string {
  const s = securityName
    .replace(/\s+-\s+.*$/, "") // Nasdaq appends " - Common Stock", " - Class A Ordinary Shares"
    .replace(/\bCommon Stock\b.*$/i, "")
    .replace(/\bOrdinary Shares\b.*$/i, "")
    .replace(/\bDepositary Shares\b.*$/i, "")
    .replace(/\bAmerican Depositary Shares\b.*$/i, "");
  return assetNameKey(s);
}
