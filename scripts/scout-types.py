"""
Diagnostic: What document types is the OGE API actually returning,
and how does our is278T matcher classify them?
"""
import json
import re
import urllib.request
from collections import Counter

API_BASE = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest"


def fetch_all():
    out = []
    start = 0
    while True:
        url = f"{API_BASE}?start={start}&length=1000"
        with urllib.request.urlopen(url) as r:
            data = json.loads(r.read())
        recs = data.get("data", [])
        if not recs:
            break
        out.extend(recs)
        start += 1000
        if start >= data.get("recordsTotal", 0):
            break
    return out


def current_matcher(t):
    return ("278 Transaction" in t) or ("278T" in t) or ("278-T" in t)


def strict_matcher(t):
    return ("278 Periodic Transaction" in t) or ("278-T" in t) or (
        re.search(r"\b278T\b", t) is not None
    )


def main():
    print("Fetching all OGE records...")
    records = fetch_all()
    print(f"  {len(records)} records\n")

    # Strip HTML, get clean type-text variants for distinct values
    type_variants = Counter()
    pdf_url_keywords = Counter()
    for r in records:
        t = r.get("type", "")
        # Pull out the visible link text (not the URL)
        text_after_pdf = re.sub(r"<[^>]+>", "|", t)
        type_variants[text_after_pdf.strip()[:120]] += 1
        # PDF naming pattern
        m = re.search(r"-(\d{4}-)?([A-Z][\w-]+)\.pdf", t)
        if m:
            pdf_url_keywords[m.group(2)] += 1

    print("=== Top 15 distinct type-field values ===")
    for v, c in type_variants.most_common(15):
        print(f"  {c:5d}  {v!r}")
    print()
    print("=== Top 10 PDF naming suffix keywords ===")
    for v, c in pdf_url_keywords.most_common(10):
        print(f"  {c:5d}  {v}")
    print()

    # Now compare matchers
    cur_match = sum(1 for r in records if current_matcher(r.get("type", "")))
    strict_match = sum(1 for r in records if strict_matcher(r.get("type", "")))
    print("=== Matcher comparison (full corpus) ===")
    print(f"  Current  is278T() matches: {cur_match}")
    print(f"  Stricter matcher matches: {strict_match}")
    print(f"  Difference (false positives in current): {cur_match - strict_match}")
    print()

    # Show what the difference contains
    extras = [r for r in records if current_matcher(r.get("type", "")) and not strict_matcher(r.get("type", ""))]
    print("=== Sample false positives (first 5) ===")
    for r in extras[:5]:
        print(f"  Name: {r.get('name')}")
        print(f"  Type: {r.get('type', '')[:200]}")
        print()

    print(f"  Total false positives: {len(extras)}")
    name_counts = Counter(r.get("name", "") for r in extras)
    print(f"\n  False-positive officials (top 15):")
    for n, c in name_counts.most_common(15):
        print(f"    {c:3d}  {n}")


if __name__ == "__main__":
    main()
