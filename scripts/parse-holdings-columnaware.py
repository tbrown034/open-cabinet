"""
Column-aware OGE 278e holdings parser (v2).

Replaces the regex-based parse-holdings-278e.py for Parts 2/5/6 holdings
extraction. Uses pdfplumber word positions + y-grouping + x-column
classification, which preserves value-bucket integrity even when buckets
like "Over $50,000,000" wrap across PDF lines.

Column layout for OGE 278e holdings tables (Parts 2, 5, 6):
    #            x ~ 25-60
    DESCRIPTION  x ~ 60-380
    EIF          x ~ 380-460
    VALUE        x ~ 460-555
    INCOME TYPE  x ~ 555-640
    INCOME AMT   x ~ 640+

Algorithm:
    1. For each page, extract words with positions.
    2. Detect Part-2/5/6 region by scanning for header lines.
    3. Group words into visual rows by y-coordinate (within 3 pt).
    4. Each row is a dict { column_name: "joined text" } via x-bucketing.
    5. A row whose # column matches \\d+(\\.\\d+)* starts a new holding;
       a row with empty # column is a continuation — merge each column
       into the previous holding.
    6. Skip page-header rows ("# DESCRIPTION EIF VALUE..."), page footers
       ("Lutnick, Howard - Page 67"), and section labels.

Usage:
    python3 scripts/parse-holdings-columnaware.py <pdf> <output-json>
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

# Column thresholds. Words whose x0 falls within a range are assigned to
# that column. The thresholds were determined empirically from Lutnick's
# Nominee 278; the OGE form layout is consistent across filings.
COLUMNS = [
    ("item",        25,  60),
    ("description", 60,  380),
    ("eif",         380, 460),
    ("value",       460, 555),
    ("incomeType",  555, 640),
    ("incomeAmt",   640, 800),
]

ITEM_RE = re.compile(r"^\d+(?:\.\d+){0,4}\.?$")
PART_HEADER_RE = re.compile(
    r"^(\d+)\.?\s*(Filer'?s\s+Employment|Spouse'?s\s+Employment|Other\s+Assets)"
)
SKIP_LINE_PATTERNS = [
    re.compile(r"^# DESCRIPTION\b"),
    re.compile(r"^DESCRIPTION\s+EIF\b"),
    re.compile(r"^AMOUNT$"),
    re.compile(r"^[A-Z][a-z]+,\s+[A-Z][a-z]+\s+-\s+Page\s+\d+$"),
    re.compile(r"^Lutnick,\s+Howard\s+-\s+Page\s+\d+$"),
    re.compile(r"^TYPE\s+HELD$"),
    re.compile(r"^# ORGANIZATION"),
]
def is_skip(line: str) -> bool:
    return any(p.match(line.strip()) for p in SKIP_LINE_PATTERNS)


def column_for_x(x: float) -> str | None:
    for name, lo, hi in COLUMNS:
        if lo <= x < hi:
            return name
    return None


def extract_rows(page) -> list[dict]:
    """Group page words into y-aligned rows, then bucket by column."""
    words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
    by_y: dict[int, list[dict]] = {}
    for w in words:
        y = round(w["top"] / 3) * 3
        by_y.setdefault(y, []).append(w)

    rows = []
    for y in sorted(by_y.keys()):
        cols = {name: [] for name, _, _ in COLUMNS}
        for w in sorted(by_y[y], key=lambda d: d["x0"]):
            col = column_for_x(w["x0"])
            if col is not None:
                cols[col].append(w["text"])
        joined = {k: " ".join(v).strip() for k, v in cols.items()}
        if not any(joined.values()):
            continue
        joined["_y"] = y
        rows.append(joined)
    return rows


def is_part_holdings_page(page) -> str | None:
    """Return the Part label if this page contains Part 2, 5, or 6 holdings."""
    text = page.extract_text() or ""
    # Either header appears on this page, or we're in a continuation page
    # (subsequent pages of a long Part). Continuations have rows starting
    # with item numbers but no Part header.
    for label in ("Part 2", "Part 5", "Part 6"):
        anchor = label.split()[1]  # "2", "5", "6"
        if re.search(rf"^{anchor}\.?\s+(Filer'?s|Spouse'?s|Other)", text, re.MULTILINE):
            return label
    return None


def find_part_pages(pdf) -> dict[str, tuple[int, int]]:
    """Return {label: (start_page, end_page_exclusive)} mapping."""
    starts: dict[str, int] = {}
    parts = ["Part 1", "Part 2", "Part 3", "Part 4", "Part 5",
             "Part 6", "Part 7", "Part 8", "Part 9"]
    anchors = {
        "Part 1": r"^1\.?\s+Filer'?s\s+Positions",
        "Part 2": r"^2\.?\s+Filer'?s\s+Employment\s+Assets",
        "Part 3": r"^3\.?\s+Filer'?s\s+Employment\s+Agreements",
        "Part 4": r"^4\.?\s+Filer'?s\s+Sources\s+of\s+Compensation",
        "Part 5": r"^5\.?\s+Spouse'?s\s+Employment\s+Assets",
        "Part 6": r"^6\.?\s+Other\s+Assets\s+and\s+Income",
        "Part 7": r"^7\.?\s+Transactions",
        "Part 8": r"^8\.?\s+Liabilities",
        "Part 9": r"^9\.?\s+Gifts",
    }
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        for label, pat in anchors.items():
            if re.search(pat, text, re.MULTILINE) and label not in starts:
                starts[label] = i
    sorted_marks = sorted(starts.items(), key=lambda kv: kv[1])
    spans = {}
    for i, (label, p) in enumerate(sorted_marks):
        end = sorted_marks[i + 1][1] if i + 1 < len(sorted_marks) else len(pdf.pages)
        # When two Parts share a starting page (e.g. Part 5 and Part 6 both
        # begin on page 70), the span (p, p) is empty. Bump end to p+1 so we
        # at least scan that shared page; the seen_section_start guard
        # prevents us from grabbing rows that belong to the next Part.
        if end <= p:
            end = p + 1
        spans[label] = (p, end)
    return spans


TICKER_RE = re.compile(r"\(([A-Z]{2,6}(?:\.[A-Z])?)\)")
EXCLUDED_TICKERS = {"DRS", "IRA", "LP", "LLC", "LLP", "INC"}


def extract_ticker(desc: str) -> str | None:
    m = TICKER_RE.search(desc)
    if not m:
        return None
    cand = m.group(1)
    if cand in EXCLUDED_TICKERS:
        return None
    return cand


def parse_section(pdf, label: str, page_range: tuple[int, int]) -> list[dict]:
    holdings = []
    current = None
    # The page span may include the tail of the prior Part (e.g. Part 1's
    # final rows on the same page where Part 2 begins). Until we see this
    # section's own item "1", all rows are leakage from the previous Part.
    seen_section_start = False

    def flush():
        nonlocal current
        if current is not None:
            holdings.append(current)
            current = None

    for page_idx in range(page_range[0], page_range[1]):
        page = pdf.pages[page_idx]
        rows = extract_rows(page)
        # Skip rows that are obviously page decoration
        for row in rows:
            line_blob = " ".join(row.get(c, "") for c in ("item", "description", "eif", "value", "incomeType", "incomeAmt"))
            if is_skip(line_blob):
                continue
            # Section header line (e.g. "2. Filer's Employment Assets")
            if PART_HEADER_RE.search(line_blob):
                continue

            item = row.get("item", "").strip().rstrip(".")
            if item and ITEM_RE.match(item):
                # First item must be "1" or "1.x" to mark this section's start.
                # Anything before that is leakage from the previous Part.
                if not seen_section_start:
                    if item == "1" or item.startswith("1."):
                        seen_section_start = True
                    else:
                        continue  # still in prior-Part leakage; ignore
                # New holding
                flush()
                current = {
                    "section": label,
                    "itemNumber": item,
                    "parentItemNumber": ".".join(item.split(".")[:-1]) or None,
                    "_descParts":     [row.get("description", "")],
                    "_eifParts":      [row.get("eif", "")],
                    "_valueParts":    [row.get("value", "")],
                    "_incomeTypeParts": [row.get("incomeType", "")],
                    "_incomeAmtParts":  [row.get("incomeAmt", "")],
                }
            else:
                if current is not None:
                    if row.get("description"): current["_descParts"].append(row["description"])
                    if row.get("eif"):         current["_eifParts"].append(row["eif"])
                    if row.get("value"):       current["_valueParts"].append(row["value"])
                    if row.get("incomeType"):  current["_incomeTypeParts"].append(row["incomeType"])
                    if row.get("incomeAmt"):   current["_incomeAmtParts"].append(row["incomeAmt"])
    flush()

    # Post-process: merge column parts and clean up
    for h in holdings:
        h["description"] = " ".join(p for p in h.pop("_descParts") if p).strip()
        h["eif"]         = " ".join(p for p in h.pop("_eifParts") if p).strip() or None
        h["value"]       = clean_value_bucket(" ".join(p for p in h.pop("_valueParts") if p))
        h["incomeType"]  = " ".join(p for p in h.pop("_incomeTypeParts") if p).strip() or None
        h["incomeAmt"]   = clean_income(" ".join(p for p in h.pop("_incomeAmtParts") if p))
        h["ticker"]      = extract_ticker(h["description"])
        h["isEIF"]       = (h["eif"] == "Yes")
    return holdings


VALID_BUCKETS = {
    "None (or less than $1,001)": "None (or less than $1,001)",
    "$1,001 - $15,000": "$1,001 - $15,000",
    "$15,001 - $50,000": "$15,001 - $50,000",
    "$50,001 - $100,000": "$50,001 - $100,000",
    "$100,001 - $250,000": "$100,001 - $250,000",
    "$250,001 - $500,000": "$250,001 - $500,000",
    "$500,001 - $1,000,000": "$500,001 - $1,000,000",
    "$1,000,001 - $5,000,000": "$1,000,001 - $5,000,000",
    "$5,000,001 - $25,000,000": "$5,000,001 - $25,000,000",
    "$25,000,001 - $50,000,000": "$25,000,001 - $50,000,000",
    "Over $50,000,000": "Over $50,000,000",
}

def clean_value_bucket(raw: str) -> str | None:
    s = re.sub(r"\s+", " ", raw).strip()
    if not s:
        return None
    # Direct match
    if s in VALID_BUCKETS:
        return s
    # "Over $50,000,000"
    if re.search(r"^Over\s+\$50,000,000$", s):
        return "Over $50,000,000"
    # Range buckets — text might be "X - Y" with extra spaces
    m = re.search(r"\$([\d,]+)\s*-\s*\$([\d,]+)", s)
    if m:
        candidate = f"${m.group(1)} - ${m.group(2)}"
        if candidate in VALID_BUCKETS:
            return candidate
    # "Over" plus a $ amount (in case of OCR drift)
    if "Over" in s and "$50" in s:
        return "Over $50,000,000"
    # "None" forms
    if "None" in s and "1,001" in s:
        return "None (or less than $1,001)"
    return s  # return raw — caller can decide whether to flag


INCOME_BUCKETS = {
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
}

def clean_income(raw: str) -> dict | None:
    s = re.sub(r"\s+", " ", raw).strip()
    if not s:
        return None
    # Range bucket
    m = re.search(r"\$([\d,]+)\s*-\s*\$([\d,]+)", s)
    if m:
        candidate = f"${m.group(1)} - ${m.group(2)}"
        if candidate in INCOME_BUCKETS:
            return {"bucket": candidate, "exact": None}
    # None
    if "None" in s and "201" in s:
        return {"bucket": "None (or less than $201)", "exact": None}
    if "Over" in s and "$5,000,000" in s:
        return {"bucket": "Over $5,000,000", "exact": None}
    # Exact dollar (single value)
    em = re.search(r"\$[\d,]+(?:\.\d+)?", s)
    if em:
        return {"bucket": None, "exact": em.group(0)}
    return {"bucket": None, "exact": s}


def main():
    if len(sys.argv) < 3:
        print("Usage: parse-holdings-columnaware.py <pdf> <output-json>")
        sys.exit(1)
    pdf_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    with pdfplumber.open(str(pdf_path)) as pdf:
        spans = find_part_pages(pdf)
        print("Detected Part page spans:", {k: f"pp.{v[0]}-{v[1]-1}" for k, v in spans.items()})

        all_holdings = []
        for label in ("Part 2", "Part 5", "Part 6"):
            if label not in spans:
                continue
            section = parse_section(pdf, label, spans[label])
            print(f"  {label}: {len(section)} rows from pages {spans[label][0]}-{spans[label][1]-1}")
            all_holdings.extend(section)

    out_path.write_text(json.dumps(all_holdings, indent=2))
    print(f"\nWrote {len(all_holdings)} rows to {out_path}")


if __name__ == "__main__":
    main()
