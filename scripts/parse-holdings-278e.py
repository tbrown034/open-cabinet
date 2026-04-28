"""
Parse OGE 278e holdings sections (Part 2, 5, 6) from natural-pdf text dump.

Input: per-section .txt files (output of section-pdf.py)
Output: JSON list of Holding objects matching the schema in docs/holdings-plan.md

Approach: line-by-line state machine. An item-number line ("N", "N.M", "N.M.K"
optionally followed by ".n" for deeply nested) starts a new holding. Subsequent
lines without an item number are continuation text for the most recently opened
holding (description wrap, multi-line value bucket like "$25,000,001 -\n$50,000,000",
etc.). Page-header lines and decoration are skipped.

Usage:
    python3 scripts/parse-holdings-278e.py <staging-dir> <output-json>
        e.g. data/holdings-staging/lutnick-howard data/holdings-staging/lutnick-howard/holdings.json
"""
import json
import re
import sys
from pathlib import Path

# Item-number regex: matches "1", "1.2", "1.2.3", "1.2.3.4" etc. at line start.
# Captures the full number and the rest of the line.
ITEM_RE = re.compile(r"^(\d+(?:\.\d+){0,4})\s+(.*)$")

# Lines to skip outright (page headers, decorations)
SKIP_PATTERNS = [
    re.compile(r"^# DESCRIPTION"),
    re.compile(r"^AMOUNT\s*$"),
    re.compile(r"^[A-Z][a-z]+, [A-Z][a-z]+ - Page \d+"),  # "Lutnick, Howard - Page 67"
    re.compile(r"^TYPE HELD\s*$"),
    re.compile(r"^# ORGANIZATION NAME"),
    re.compile(r"^TYPE\s+TO\s*$"),
    re.compile(r"^FROM\s+TO\s*$"),
]

# OGE asset value buckets we recognise (Part 2/5/6 column "Value")
VALUE_BUCKETS = [
    "None (or less than $1,001)",
    "$1,001 - $15,000",
    "$15,001 - $50,000",
    "$50,001 - $100,000",
    "$100,001 - $250,000",
    "$250,001 - $500,000",
    "$500,001 - $1,000,000",
    "$1,000,001 - $5,000,000",
    "$5,000,001 - $25,000,000",
    "$25,000,001 - $50,000,000",
    "Over $50,000,000",
]

# Build a single regex that matches any value bucket, possibly with a line break
# inside (e.g. "$25,000,001 -\n$50,000,000").
def value_bucket_regex():
    parts = [re.escape(b).replace(r"\ ", r"\s+") for b in VALUE_BUCKETS]
    return re.compile("(" + "|".join(parts) + ")")

VALUE_RE = value_bucket_regex()

# OGE income amount buckets (slightly different scale: caps lower)
INCOME_BUCKETS = [
    "None (or less than $201)",
    "$1 - $200",
    "$201 - $1,000",
    "$1,001 - $2,500",
    "$2,501 - $5,000",
    "$5,001 - $15,000",
    "$15,001 - $50,000",
    "$50,001 - $100,000",
    "$100,001 - $1,000,000",
    "$1,000,001 - $5,000,000",
    "Over $5,000,000",
]
def income_bucket_regex():
    parts = [re.escape(b).replace(r"\ ", r"\s+") for b in INCOME_BUCKETS]
    return re.compile("(" + "|".join(parts) + ")")
INCOME_RE = income_bucket_regex()

# Exact-dollar income (when the filing reports a specific number rather than a range)
EXACT_DOLLAR_RE = re.compile(r"\$[\d,]+(?:\.\d+)?")

# EIF flag column: "N/A", "No", "Yes", "See Endnote"
EIF_RE = re.compile(r"\b(N/A|No|Yes|See Endnote)\b")

# Ticker: parenthetical 1-6 uppercase letters with optional class suffix
TICKER_RE = re.compile(r"\(([A-Z]{1,6}(?:\.[A-Z])?)\)")


def is_skip(line: str) -> bool:
    return any(p.search(line) for p in SKIP_PATTERNS)


def parse_section(text: str, section_label: str) -> list[dict]:
    """Walk lines, group into holdings keyed by item number."""
    lines = text.split("\n")
    holdings: list[dict] = []
    current: dict | None = None

    def flush():
        nonlocal current
        if current is not None:
            holdings.append(current)
            current = None

    for raw in lines:
        line = raw.rstrip()
        if not line:
            continue
        if is_skip(line):
            continue

        # Drop section header line ("2. Filer's Employment Assets...")
        if re.match(r"^\d+\.?\s*(Filer'?s|Spouse'?s|Other)", line):
            continue

        m = ITEM_RE.match(line)
        if m:
            # New holding
            flush()
            item_no = m.group(1)
            rest = m.group(2)
            current = {
                "section": section_label,
                "itemNumber": item_no,
                "parentItemNumber": ".".join(item_no.split(".")[:-1]) or None,
                "_raw_lines": [rest],
            }
        else:
            # Continuation of current holding
            if current is not None:
                current["_raw_lines"].append(line)
            # else: stray text outside any item, ignore

    flush()

    # Now interpret each holding's raw lines
    for h in holdings:
        full = " ".join(h.pop("_raw_lines"))
        h.update(interpret_row(full))

    return holdings


def interpret_row(text: str) -> dict:
    """Pull description, ticker, EIF, value, income type, income amount from
    a flattened holding-row string."""
    out: dict = {
        "description": "",
        "ticker": None,
        "isEIF": False,
        "eifFlag": None,
        "value": None,
        "incomeType": None,
        "incomeAmount": None,
        "incomeAmountExact": None,
        "notes": None,
    }

    # Find a value bucket if present
    vmatch = VALUE_RE.search(text)
    if vmatch:
        out["value"] = re.sub(r"\s+", " ", vmatch.group(1)).strip()
        # Remove value from text so it doesn't pollute description
        text = text[:vmatch.start()] + " " + text[vmatch.end():]

    # Find an income bucket
    imatch = INCOME_RE.search(text)
    if imatch:
        out["incomeAmount"] = re.sub(r"\s+", " ", imatch.group(1)).strip()
        text = text[:imatch.start()] + " " + text[imatch.end():]

    # Exact-dollar income (e.g. "$198,984,693")
    dmatch = EXACT_DOLLAR_RE.search(text)
    if dmatch and out["incomeAmount"] is None:
        out["incomeAmountExact"] = dmatch.group(0)
        text = text[:dmatch.start()] + " " + text[dmatch.end():]

    # EIF flag
    eifm = EIF_RE.search(text)
    if eifm:
        out["eifFlag"] = eifm.group(1)
        out["isEIF"] = (eifm.group(1) == "Yes")
        text = text[:eifm.start()] + " " + text[eifm.end():]

    # Ticker. Require length >= 2 (single-letter "K" matches "401(K)", etc.)
    # and exclude known retirement-account decorations and column noise.
    tmatch = TICKER_RE.search(text)
    if tmatch:
        cand = tmatch.group(1)
        excluded = {"DRS", "L", "K", "IRA", "LP", "LLC", "LLP", "INC", "P"}
        if 2 <= len(cand) <= 6 and cand not in excluded:
            out["ticker"] = cand

    # The leftover text is the description + maybe income type
    # Common income types appearing as bare phrases:
    income_types = [
        "Partnership / Distributions", "Partnership/Distributions",
        "Salary/Bonus", "Salary",
        "Equity Bonus", "Bonus",
        "Dividends", "Interest", "Capital Gains",
        "Rent or Royalties", "Rent", "Royalties",
        "Distributions", "Distribution",
        "Annuity payable to Howard Lutnick per year",
        "BGC Partners - Partnership Distribution (prior to July 2023)",
        "BGCP DRS Distribution",
        "NMRK DRS Distribution",
        "2023 BGC Unit Redemption",
        "Net Income",
    ]
    leftover = re.sub(r"\s+", " ", text).strip()
    for it in sorted(income_types, key=len, reverse=True):
        if it in leftover:
            out["incomeType"] = it
            leftover = leftover.replace(it, " ").strip()
            break

    # Whatever remains is the description
    out["description"] = re.sub(r"\s+", " ", leftover).strip(" -,")

    return out


def main():
    if len(sys.argv) < 3:
        print("Usage: parse-holdings-278e.py <staging-dir> <output-json>")
        sys.exit(1)
    staging = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    sections_to_parse = [
        ("part-2.txt", "Part 2"),
        ("part-5.txt", "Part 5"),
        ("part-6.txt", "Part 6"),
    ]

    all_holdings = []
    for fname, label in sections_to_parse:
        fp = staging / fname
        if not fp.exists():
            continue
        text = fp.read_text()
        if not text.strip():
            continue
        section_holdings = parse_section(text, label)
        all_holdings.extend(section_holdings)
        print(f"  {label}: {len(section_holdings)} rows from {fname}")

    out_path.write_text(json.dumps(all_holdings, indent=2))
    print(f"\nWrote {len(all_holdings)} total rows to {out_path}")


if __name__ == "__main__":
    main()
