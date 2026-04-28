"""
Scout: How clean is natural-pdf's raw table extraction on Biden cabinet 278-Ts?

Pulls 3 Biden 278-T PDFs from OGE, runs natural-pdf table extraction,
prints the raw structured output. Goal: decide whether natural-pdf alone
can be Lane A in a free pipeline, or whether every PDF needs LLM cleanup.

Zero LLM cost. Just OGE downloads + local table extraction.

Usage:
    python3 scripts/scout-naturalpdf.py
"""
import json
import urllib.request
from pathlib import Path
from natural_pdf import PDF

PDF_CACHE = Path("/tmp/biden-scout-pdfs")
PDF_CACHE.mkdir(exist_ok=True)

API_BASE = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest"

# Officials we want to scout (Biden cabinet, varied trade volume)
TARGETS = {
    "Yellen, Janet L": "Treasury",
    "Buttigieg, Peter P": "Transportation",
    "Granholm, Jennifer": "Energy",
}


def fetch_oge_records():
    """Pull every OGE record (paginated)."""
    all_records = []
    start = 0
    page_size = 1000
    while True:
        url = f"{API_BASE}?start={start}&length={page_size}"
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read())
        records = data.get("data", [])
        if not records:
            break
        all_records.extend(records)
        total = data.get("recordsTotal", 0)
        start += page_size
        if start >= total:
            break
    return all_records


def extract_pdf_url(type_field: str) -> str | None:
    import re
    m = re.search(r"href='([^']+\.pdf)'", type_field)
    return m.group(1) if m else None


def is_278t(type_field: str) -> bool:
    return any(s in type_field for s in ("278 Transaction", "278T", "278-T"))


def main():
    print("Fetching OGE records...")
    records = fetch_oge_records()
    print(f"  {len(records)} total records\n")

    # Find one 278-T per target official
    chosen = {}
    for r in records:
        name = r.get("name", "")
        if name not in TARGETS or name in chosen:
            continue
        if not is_278t(r.get("type", "")):
            continue
        url = extract_pdf_url(r["type"])
        if not url:
            continue
        chosen[name] = {"url": url, "docDate": r.get("docDate", ""), "agency": r.get("agency", "")}

    if not chosen:
        print("No matching PDFs found.")
        return

    print(f"Found {len(chosen)} target PDFs:")
    for name, info in chosen.items():
        print(f"  {name} ({info['docDate']}) — {info['url']}")
    print()

    # Download and extract
    for name, info in chosen.items():
        print("=" * 78)
        print(f"OFFICIAL: {name}")
        print(f"FILING DATE: {info['docDate']}")
        print(f"URL: {info['url']}")
        print("=" * 78)

        slug = name.lower().replace(", ", "-").replace(" ", "-").replace(".", "")
        pdf_path = PDF_CACHE / f"{slug}.pdf"
        if not pdf_path.exists() or pdf_path.stat().st_size < 1000:
            print(f"Downloading...")
            urllib.request.urlretrieve(info["url"], str(pdf_path))
        print(f"PDF size: {pdf_path.stat().st_size:,} bytes\n")

        pdf = PDF(str(pdf_path))
        print(f"Pages: {len(pdf.pages)}\n")

        for i, page in enumerate(pdf.pages):
            print(f"--- Page {i + 1} ---")

            # Try table extraction
            try:
                tables = page.extract_tables()
                print(f"natural-pdf detected {len(tables)} table(s) on this page")
                for ti, table in enumerate(tables):
                    rows = list(table)
                    print(f"\n  Table {ti + 1}: {len(rows)} rows")
                    for ri, row in enumerate(rows[:8]):  # first 8 rows
                        print(f"    Row {ri}: {row}")
                    if len(rows) > 8:
                        print(f"    ... ({len(rows) - 8} more rows)")
            except Exception as e:
                print(f"  Table extraction error: {e}")

            # Also raw text length for comparison
            text = page.extract_text() or ""
            print(f"\n  Raw text length: {len(text)} chars")
            print(f"  First 200 chars: {text[:200]!r}")
            print()


if __name__ == "__main__":
    main()
