"""
Scout: try several text-extraction strategies on Lutnick's Nominee 278 to see
which one preserves the OGE form's column structure (so value buckets like
"Over $50,000,000" don't fragment across lines).

Strategies attempted:
  1. natural-pdf extract_text() — current default, known to fragment
  2. natural-pdf extract_text(layout=True) if available
  3. pdfplumber direct with x_tolerance tuning
  4. pdfplumber extract_words with positional grouping into rows by y-coord
"""
import sys
from pathlib import Path

PDF_PATH = Path("data/pdfs/nominee/lutnick-howard-nominee-278.pdf")
TARGET_PAGE = 4  # 0-indexed, this is form page 5 with the Cantor Fitzgerald row

print(f"Probing {PDF_PATH} (page {TARGET_PAGE+1})...\n")

# Strategy 1 + 2: natural-pdf
print("=" * 70)
print("STRATEGY 1: natural-pdf extract_text() (default)")
print("=" * 70)
from natural_pdf import PDF
pdf = PDF(str(PDF_PATH))
page = pdf.pages[TARGET_PAGE]
text = page.extract_text() or ""
print(text[:1200])

print()
print("=" * 70)
print("STRATEGY 2: natural-pdf extract_text(layout=True)")
print("=" * 70)
try:
    text2 = page.extract_text(layout=True) or ""
    print(text2[:1500])
except TypeError as e:
    print(f"  unsupported: {e}")

# Strategy 3: pdfplumber direct
print()
print("=" * 70)
print("STRATEGY 3: pdfplumber extract_text(x_tolerance=2)")
print("=" * 70)
try:
    import pdfplumber
    with pdfplumber.open(str(PDF_PATH)) as pp:
        ppage = pp.pages[TARGET_PAGE]
        text3 = ppage.extract_text(x_tolerance=2)
        print((text3 or "")[:1500])
except ImportError:
    print("  pdfplumber not installed")

# Strategy 4: pdfplumber extract_words with row grouping by y
print()
print("=" * 70)
print("STRATEGY 4: pdfplumber extract_words grouped by y-position")
print("=" * 70)
try:
    import pdfplumber
    with pdfplumber.open(str(PDF_PATH)) as pp:
        ppage = pp.pages[TARGET_PAGE]
        words = ppage.extract_words(keep_blank_chars=False, use_text_flow=False)
        # Group by approximate y-position (within 3 pt)
        rows = {}
        for w in words:
            y_key = round(w["top"] / 3) * 3
            rows.setdefault(y_key, []).append(w)
        for y in sorted(rows.keys())[:30]:
            row_words = sorted(rows[y], key=lambda w: w["x0"])
            line = " | ".join(f"{w['text']}@{int(w['x0'])}" for w in row_words)
            print(f"  y={y:>4}: {line[:200]}")
except ImportError:
    print("  pdfplumber not installed")
