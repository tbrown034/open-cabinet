/**
 * What kind of thing a row is, from the printed description alone.
 *
 * Runs first on every row, before any ticker work, with no lookups and no
 * model. First match wins, in an order that puts the unmistakable forms
 * (an option exercise, a coupon and maturity) ahead of the ones that need
 * the whole line (a fund, a plain stock). A row typed as a bond, note,
 * treasury, preferred, private holding or option never gets a stock
 * ticker, whatever its name says; that rule lives in lib/asset-resolution.
 *
 * Bonds and notes also get a short issuer label ("Municipal bond, Dallas
 * County TX") built from the leading words of the printed line. The full
 * printed string is always kept on the row; the label is for scanning.
 *
 * Trevor, Sep 6, 2026: public companies matter most; bonds should be
 * labeled for what they are and otherwise left alone.
 */
import { foldAssetText } from "./asset-normalize";

export type InstrumentType =
  | "common_stock"
  | "etf"
  | "mutual_fund"
  | "preferred"
  | "corporate_note"
  | "municipal_bond"
  | "treasury"
  | "crypto"
  | "private"
  | "option"
  | "unknown";

export const INSTRUMENT_LABEL: Record<InstrumentType, string> = {
  common_stock: "Stock",
  etf: "ETF",
  mutual_fund: "Mutual fund",
  preferred: "Preferred stock",
  corporate_note: "Corporate note",
  municipal_bond: "Municipal bond",
  treasury: "U.S. Treasury",
  crypto: "Crypto",
  private: "Private holding",
  option: "Option",
  unknown: "Unclassified",
};

export interface InstrumentCall {
  type: InstrumentType;
  /** Short label for bonds and notes, e.g. "Municipal bond, Harris County TX". Null elsewhere. */
  issuerLabel: string | null;
  /** Which rule fired, for the admin view and tests. */
  rule: string;
}

const STATE_ABBR = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|PR";
const STATE_NAMES = "ALABAMA|ALA|ALASKA|ARIZONA|ARIZ|ARKANSAS|ARK|CALIFORNIA|CALIF|COLORADO|COLO|CONNECTICUT|CONN|DELAWARE|FLORIDA|FLA|GEORGIA|HAWAII|IDAHO|ILLINOIS|ILL|INDIANA|IOWA|KANSAS|KANS|KENTUCKY|LOUISIANA|MAINE|MARYLAND|MASSACHUSETTS|MASS|MICHIGAN|MICH|MINNESOTA|MINN|MISSISSIPPI|MISS|MISSOURI|MONTANA|MONT|NEBRASKA|NEB|NEVADA|NEV|NEW HAMPSHIRE|NEW JERSEY|NEW MEXICO|NEW YORK|N Y|NORTH CAROLINA|NORTH DAKOTA|OHIO|OKLAHOMA|OKLA|OREGON|ORE|PENNSYLVANIA|PENN|RHODE ISLAND|SOUTH CAROLINA|SOUTH DAKOTA|TENNESSEE|TENN|TEXAS|TEX|UTAH|VERMONT|VIRGINIA|WASHINGTON|WASH|WEST VIRGINIA|WISCONSIN|WIS|WYOMING|WYO|PUERTO RICO";
const STATE_TO_ABBR: Record<string, string> = {
  ALABAMA: "AL", ALA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARIZ: "AZ", ARKANSAS: "AR", ARK: "AR", CALIFORNIA: "CA", CALIF: "CA", COLORADO: "CO", COLO: "CO", CONNECTICUT: "CT", CONN: "CT", FLA: "FL", KANS: "KS", MASS: "MA", MICH: "MI", MINN: "MN", MISS: "MS", MONT: "MT", NEB: "NE", NEV: "NV", "N Y": "NY", OKLA: "OK", ORE: "OR", WASH: "WA", WIS: "WI", WYO: "WY", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", ILL: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", PENN: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TENN: "TN", TEXAS: "TX", TEX: "TX", UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY", "PUERTO RICO": "PR",
};

const COUPON = /\b\d{1,2}(?:\.\d{1,4})?\s*%|\b\d\.\d{3,4}\s+(?:\d{2}\s\d{2}\s\d{2,4}|\d{6})\b/;
const FUND_FAMILY = /\b(?:NUVEEN|FRANKLIN|PIMCO|VANGUARD|FIDELITY|BLACKROCK|INVESCO|AMERICAN FUNDS|AMER FUNDS|T ROWE|DODGE AND COX|DODGE COX|SCHWAB|JANUS|LORD ABBETT|MFS|PUTNAM|OPPENHEIMER|EATON VANCE|COLUMBIA|DIMENSIONAL|DFA|THORNBURG|WESTWOOD|ALLSPRING|BRANDYWINE|NEUBERGER|BARON|MAINSTAY|GOLDMAN SACHS FUNDS|JPMORGAN FUNDS|ISHARES|SPDR)\b/;
const MATURITY = /\bDUE\b|\bMATUR/;
// Public-issuer words. "B/E" (book entry) is deliberately absent: corporate
// notes print it too ("MICROSOFT B/E 03.300% 020627", Grok, Sep 7).
const MUNI_WORDS = new RegExp(`\\b(?:CNTY|COUNTY|CITY|TOWN|TWP|TOWNSHIP|VLG|VILLAGE|SCH DIST|SCHOOL DIST|SCH BRD|SCHS|ISD|INDPT SCH|IND SCH|UNI SCH|MUN\\b|MUNI\\b|MUNICIPAL|PUB PWR|PWR DIST|WTR|WATER|SWR|SEWER|UTIL|UTILS|HSG|HOUSING|HLTH|HEALTH|HOSP|FACS|AUTH|AUTHORITY|MUD\\b|DIST\\b|DISTRICT|RFDG|REFUNDING|REV\\b|REVENUE|GO BDS|G O BDS|GEN OBLIG|BDS\\b|BONDS|PSF GTD|ST INTRCPT|CR ENH|TRANSN|TRANSIT|AIRPORT|TPK|TURNPIKE|TOLL|PORT AUTH|UNIV\\b|UNIVERSITY|COLLEGE|CLLGS|COMMWLTH|COMMONWEALTH|STATE OF|BRD ED|CTFS|ELEC SYS|IMPT|INDL DEV|ECON DEV|ECONOM)`);
const CORP_WORDS = /\b(?:INC|CORP|CORPORATION|CO\b|COMPANY|LLC|PLC|LTD|HLDGS|HOLDINGS|GROUP|BANCORP|BANK|FINL|FINANCIAL|TRUST|NTS?|NOTES?|SR|SENIOR)\b/;
const STATE_IN_LINE = new RegExp(`\\b(?:${STATE_ABBR}|${STATE_NAMES})\\b`);

export function classifyInstrument(description: string, filedTicker: string | null | undefined): InstrumentCall {
  // A parenthetical symbol is not a word: "Eaton Corp. Plc (ETN)" is a
  // stock, not an exchange-traded note (Codex, Sep 7).
  const u = foldAssetText(description.replace(/\(\s*[A-Z][A-Z.]{0,6}\s*\)/g, " "));
  const t = (filedTicker ?? "").toUpperCase();

  if (/\b(?:CALL|PUT)\s+OPTIONS?\b|\bOPTION EXERCISE\b|\bOPTIONS? EXERCISE|\bVESTED (?:STOCK )?OPTIONS?\b|\bEXERCISE\b.*\bOPTION|\bOPTION\b.*\bEXERCISE|\bWARRANTS?\b|\bSTRIKE\b/.test(u)) {
    return { type: "option", issuerLabel: null, rule: "option words" };
  }
  if (/\b(?:BITCOIN|ETHEREUM|ETHER|CRYPTO|SOLANA|POLKADOT|CARDANO|LITECOIN|DOGECOIN|XRP|RIPPLE|POLYGON|AVALANCHE|CHAINLINK)\b/.test(u) || /^CRYPTO\b/.test(u) || /\b(?:BTC|ETH|SOL|DOT|ADA|QNT)\b/.test(u) && /\bCRYPTO\b|^(?:BTC|ETH|SOL|DOT|ADA|QNT)$/.test(u)) {
    return { type: "crypto", issuerLabel: null, rule: "crypto words" };
  }
  if (/\b(?:US|U S|UNITED STATES) TREAS(?:URY)?\b|\bTREASURY (?:BILL|NOTE|BOND|BILLS|NOTES|BONDS)\b|\bT-?BILL\b|\bUS GOVT\b/.test(u) && !/\bETF\b|\bFUND\b|\bFD\b/.test(u)) {
    return { type: "treasury", issuerLabel: "U.S. Treasury", rule: "treasury words" };
  }
  // A fund family's product is a fund even when the line says "municipal
  // bond" ("NUVEEN NJ MUNICIPAL BOND A" is a Nuveen fund share class).
  if (FUND_FAMILY.test(u) && !/\bETF\b/.test(u) && (/\b(?:BOND|BD|MUNI|MUNICIPAL|INCOME|GROWTH|VALUE|EQUITY|BALANCED|ALLOCATION|TAX)\b/.test(u) || /\b[A-C]$/.test(u) || /\bF[12]\b|\bADMIRAL\b|\bINSTL\b|\bINVESTOR\b/.test(u))) {
    return { type: "mutual_fund", issuerLabel: null, rule: "fund family product" };
  }
  const hasCoupon = COUPON.test(u);
  const hasMaturity = MATURITY.test(u);
  const muniWord = MUNI_WORDS.test(u);
  const stateWord = STATE_IN_LINE.test(u);
  const fundLike = /\bETF\b|\bFUND\b|\bFD\b|\bTR\b|\bTRUST\b/.test(u) || FUND_FAMILY.test(u);
  const corpWord = CORP_WORDS.test(u);
  // A municipal bond: a public-issuer word with a state (a school district,
  // county, authority), with or without a coupon; or a city and state with a
  // coupon or maturity and no corporate word ("BROWNSVILLE TEX 5% DUE
  // 02/15/39"); or a public-issuer word with the muni markers.
  if (!fundLike && muniWord && stateWord) {
    return { type: "municipal_bond", issuerLabel: issuerLabelFor("Municipal bond", u), rule: "public issuer + state" };
  }
  if (!fundLike && !corpWord && stateWord && (hasCoupon || hasMaturity)) {
    return { type: "municipal_bond", issuerLabel: issuerLabelFor("Municipal bond", u), rule: "place + state + coupon/maturity" };
  }
  if (!fundLike && muniWord && /\bBDS\b|\bRFDG\b|\bPSF GTD\b|\bCR ENH\b|\bGO BDS\b/.test(u) && (hasCoupon || hasMaturity || /\bB\/E\b|\bBDS\b/.test(u))) {
    return { type: "municipal_bond", issuerLabel: issuerLabelFor("Municipal bond", u), rule: "muni markers + coupon/maturity" };
  }
  if (!fundLike && !corpWord && muniWord && (hasCoupon || hasMaturity)) {
    return { type: "municipal_bond", issuerLabel: issuerLabelFor("Municipal bond", u), rule: "public issuer + coupon/maturity" };
  }
  // A line that simply says "bond" with a state or public issuer is a
  // municipal bond ("State of Connecticut, bond (Cusip 207758U84)").
  if (/\bBONDS?\b/.test(u) && !/\bETF\b|\bFUND\b|\bFD\b/.test(u)) {
    return stateWord || muniWord
      ? { type: "municipal_bond", issuerLabel: issuerLabelFor("Municipal bond", u), rule: "bond word + public issuer" }
      : { type: "corporate_note", issuerLabel: issuerLabelFor("Corporate note", u), rule: "bond word" };
  }
  // "American Depositary Shares" is an ADR of common stock, not a
  // preferred; only depositary shares of a preferred series count here.
  const adr = /\bAMERICAN DEP(?:OSITARY|OSITORY)? (?:SH|SHS|SHARES|RECEIPTS?)\b|\bADR\b|\bADS\b/.test(u);
  if (/\bPFD\b|\bPREFERRED\b|\bPERP\b|\bPERPETUAL\b|\bTIER I\b|\bTIER 1\b|\bALT TIER\b|\bTIER \d\b|\.PR\.|\bSER(?:IES)? [A-Z]{1,2}\b.*\bPFD\b|\b12\/31\/49\b|\b12\/31\/2049\b|\bPE \d\.\d{2,4}\b/.test(u) || (!adr && /\bDEP(?:OSITARY)? (?:RP|SH|SHS|SHARES|PFD)\b/.test(u))) {
    return { type: "preferred", issuerLabel: issuerLabelFor("Preferred stock", u), rule: "preferred words" };
  }
  // A coupon with a maturity, a dated ("DTD") issue, or a six-digit
  // maturity code is a note even without the word ("MICROSOFT B/E 03.300%
  // 020627 DTD020617", Grok, Sep 7).
  const datedNote = hasCoupon && (hasMaturity || /\bDTD\s*\d{6}\b|\b\d{6}\b/.test(u));
  if (/\bNTS?\b|\bNOTES?\b|\bSR (?:NT|NOTE|UNSECURED|SECURED)\b|\bSENIOR (?:NOTE|UNSECURED|SECURED)\b|\bDEBENTURE|\bFXD TO\b|\bTHRAFTR\b|\bSUBORDINATED\b|\bCONV\b.*\bDUE\b/.test(u) || (datedNote && !fundLike)) {
    return { type: "corporate_note", issuerLabel: issuerLabelFor("Corporate note", u), rule: "note words or coupon + maturity" };
  }
  if (/\bETF\b|\bETN\b|\bISHARES\b|\bSPDR\b|\bSELECT SECTOR\b|\bINDEX FD\b|\bINDEX FUND\b|\bVANGUARD\b.*\b(?:ETF|INDEX|FD|FUND)\b|\bINVESCO QQQ\b|\bARK\b.*\bETF\b/.test(u)) {
    return { type: "etf", issuerLabel: null, rule: "etf words" };
  }
  if (/\bFUND\b|\bFD\b|\bPORTFOLIO\b.*\b(?:CL|CLASS)\b|\bCLASS [A-Z]\b.*\bFUND\b|\bMUTUAL\b|\bTAX FREE\b|\bMONEY MARKET\b|\bF[12]\b|\bADMIRAL\b|\bINVESTOR (?:CL|CLASS|SHARES)\b/.test(u) || /^[A-Z]{4}X$/.test(t)) {
    return { type: "mutual_fund", issuerLabel: null, rule: "fund words or five-letter X symbol" };
  }
  if (/\bLLC\b|\bL L C\b|\bLP\b|\bL P\b|\bLIMITED PARTNERSHIP\b|\bPARTNERS\b|\bSERIES \d+\b|\bVENTURES?\b|\bCAPITAL PARTNERS\b|\bPRIVATE\b|\bSHARES IN RETIREMENT\b|\bRETIREMENT ACCOUNT\b|\b401K\b|\bIRA\b/.test(u)) {
    return { type: "private", issuerLabel: null, rule: "private entity words" };
  }
  if (u.length === 0) return { type: "unknown", issuerLabel: null, rule: "empty" };
  return { type: "common_stock", issuerLabel: null, rule: "default: nothing else matched" };
}

/**
 * "Municipal bond, Harris County TX": the leading issuer words of the
 * printed line, cut before the first coupon, maturity, series or
 * book-entry token, with a state spelled as its abbreviation. Bounded to
 * six words so a label never becomes the whole string.
 */
export function issuerLabelFor(kind: string, folded: string): string {
  let s = folded
    .replace(/\b(?:DUE|MATUR\w*|DTD|SER(?:IES)?|B\/E|BDS?|BONDS?|RFDG|REV|PTC|CAB|OID|CUSIP|FXD TO|VAR THRAFTR|RATE|NTS?|NOTES?|SR|SENIOR|UNSECURED|SECURED|SUBORDINATED|PFD|PERP|DEP|TIER)\b.*$/, "")
    .replace(/\b\d{1,2}(?:\.\d{1,4})?\s*%.*$/, "")
    .replace(/\b\d{6,}\b.*$/, "")
    .trim();
  s = s.replace(new RegExp(`\\b(${STATE_NAMES})\\b`, "g"), (m) => STATE_TO_ABBR[m] ?? m);
  const words = s.split(" ").filter(Boolean).slice(0, 6);
  const name = words
    .map((w) => (/^[A-Z]{2}$/.test(w) && new RegExp(`^(?:${STATE_ABBR})$`).test(w) ? w : titleCase(w)))
    .join(" ")
    .replace(/\bCnty\b/g, "County")
    .replace(/\bSch Dist\b/g, "School District")
    .replace(/\bIndpt\b/g, "Independent")
    .replace(/\bAuth\b/g, "Authority")
    .replace(/\bMun\b/g, "Municipal")
    .replace(/\bPwr\b/g, "Power")
    .replace(/\bWtr\b/g, "Water")
    .replace(/\bHlth\b/g, "Health")
    .replace(/\bHosp\b/g, "Hospital")
    .replace(/\bFacs\b/g, "Facilities")
    .replace(/\bHsg\b/g, "Housing")
    .replace(/\bUniv\b/g, "University")
    .replace(/\bFinl\b/g, "Financial")
    .replace(/\bCorp\b/g, "Corp");
  return name ? `${kind}, ${name}` : kind;
}

function titleCase(w: string): string {
  if (/^[A-Z]&[A-Z]$/.test(w) || /^\d/.test(w)) return w;
  return w.charAt(0) + w.slice(1).toLowerCase();
}
