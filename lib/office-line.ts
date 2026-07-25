/**
 * Composing an official's one-line office description.
 *
 * Naively joining role and agency produces "Secretary of Energy · Department
 * of Energy" for roughly half the roster. These helpers collapse the agency
 * when the role already names it, and abbreviate the handful of agency names
 * long enough to wrap a table row onto two lines.
 */

/**
 * Words carrying no distinguishing signal when comparing a role against an
 * agency. Structural nouns ("department", "office"), the generic titles that
 * appear in nearly every role ("secretary", "director"), and connectives.
 *
 * "administration" earns its place through McMaster and Bedford: without it,
 * "Administrator, Federal Highway Administration" would match "Department of
 * Transportation" on no shared token, but "Federal Aviation Administration"
 * against an agency ending in "Administration" would collapse wrongly. Note
 * it does NOT guard the Isaacman case some readings assume — "administrator"
 * and "administration" are different tokens under exact matching, so NASA is
 * never hidden behind the bare role "Administrator".
 */
const STOPWORDS = new Set([
  "department",
  "office",
  "of",
  "the",
  "and",
  "administration",
  "commission",
  "agency",
  "bureau",
  "us",
  "united",
  "states",
  "executive",
  "national",
  "federal",
  "council",
  "secretary",
  "director",
]);

/** Lowercase words of 3+ characters that are not stopwords. */
function significantTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of value.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

export interface OfficeLineParts {
  role: string;
  /** null when the agency is already implied by the role. */
  agency: string | null;
}

/**
 * Decides whether the agency adds anything the role has not already said.
 *
 * Any overlap at all collapses it: "Secretary of the Navy" against
 * "Department of Defense – Department of the Navy" shares "navy", so
 * "Defense" disappears. That is the intended trade — Navy implies DoD, and
 * the alternative is a line too long for the row.
 */
export function officeLineParts(role: string, agency: string): OfficeLineParts {
  if (!agency) return { role, agency: null };
  if (!role) return { role: agency, agency: null };

  const roleTokens = significantTokens(role);
  const agencyTokens = significantTokens(agency);

  // An agency reduced entirely to stopwords carries no signal of its own.
  if (agencyTokens.size === 0) return { role, agency: null };

  for (const token of agencyTokens) {
    if (roleTokens.has(token)) return { role, agency: null };
  }

  return { role, agency };
}

/** The composed line, using full agency names. */
export function officeLine(role: string, agency: string): string {
  const parts = officeLineParts(role, agency);
  return parts.agency ? `${parts.role} · ${parts.agency}` : parts.role;
}

/**
 * Render-time abbreviations for agency names long enough to wrap a directory
 * row onto a second line. Applied only for display — the underlying data is
 * never rewritten, and the full name goes in a title attribute.
 *
 * Extend this as officials are added; anything not listed renders in full.
 */
export const AGENCY_SHORT_NAMES: Record<string, string> = {
  "Office of Science and Technology Policy": "OSTP",
  "Social Security Administration": "SSA",
  "Department of Transportation": "DOT",
  "National Aeronautics and Space Administration": "NASA",
  "Council of Economic Advisers": "CEA",
  "Office of Personnel Management": "OPM",
  // Added after checking every row against the 296px name column: the lines
  // below still ran 43-51 characters after dedup and wrapped onto a second
  // line. All are abbreviations a general reader already knows, and the full
  // name stays in the row's title attribute.
  "Department of Homeland Security": "DHS",
  "Department of Health and Human Services": "HHS",
  "Department of Veterans Affairs": "VA",
  "Department of Justice": "DOJ",
  "Environmental Protection Agency": "EPA",
  "Office of National Drug Control Policy": "ONDCP",
  "Department of the Interior": "Interior",
  "Department of Agriculture": "USDA",
  "Department of the Treasury": "Treasury",
  // Sub-agencies named inside a role. Bedford's title is already stored as
  // "FAA Administrator", so abbreviating its two siblings keeps the three
  // modal-agency rows reading the same way.
  "Federal Highway Administration": "FHWA",
  "Federal Transit Administration": "FTA",
};

export function shortAgency(agency: string): string {
  return AGENCY_SHORT_NAMES[agency] ?? agency;
}

// Longest key first, so a shorter entry can never consume part of a longer
// one before it has had its turn.
const ABBREVIATION_ENTRIES = Object.entries(AGENCY_SHORT_NAMES).toSorted(
  (a, b) => b[0].length - a[0].length
);

/**
 * The line as rendered: agency collapsed when redundant, then abbreviated.
 *
 * Abbreviation runs over the whole composed line rather than the agency
 * field alone, because the names that wrap a row most often live inside the
 * *role* — "Director, Office of Science and Technology Policy" survives the
 * dedup intact and is still too long. Pair with `officeLine()` for the title
 * attribute so the full name stays reachable.
 */
export function officeLineShort(role: string, agency: string): string {
  let line = officeLine(role, agency);
  for (const [full, short] of ABBREVIATION_ENTRIES) {
    line = line.split(full).join(short);
  }
  return line;
}
