"""
Section a single OGE 278e PDF into Parts 1-9 by header anchors.
Output: per-Part raw text dumps + a manifest JSON.

Usage:
    python3 scripts/section-pdf.py <path-to-pdf> <output-dir>
"""
import json
import re
import sys
from pathlib import Path

from natural_pdf import PDF

# OGE 278e Part headers we want to split on. Order matters — we walk through the
# document in order and each anchor closes the previous section.
PART_HEADERS = [
    ("Part 1", r"^\s*1\.?\s*Filer'?s\s+Positions\s+Held"),
    ("Part 2", r"^\s*2\.?\s*Filer'?s\s+Employment\s+Assets"),
    ("Part 3", r"^\s*3\.?\s*Filer'?s\s+Employment\s+Agreements"),
    ("Part 4", r"^\s*4\.?\s*Filer'?s\s+Sources\s+of\s+Compensation"),
    ("Part 5", r"^\s*5\.?\s*Spouse'?s\s+Employment\s+Assets"),
    ("Part 6", r"^\s*6\.?\s*Other\s+Assets\s+and\s+Income"),
    ("Part 7", r"^\s*7\.?\s*Transactions"),
    ("Part 8", r"^\s*8\.?\s*Liabilities"),
    ("Part 9", r"^\s*9\.?\s*Gifts"),
    ("End",    r"^\s*Endnotes\b|^\s*Summary\s+of\s+Contents"),
]


def main():
    if len(sys.argv) < 3:
        print("Usage: section-pdf.py <pdf> <out-dir>")
        sys.exit(1)
    pdf_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf = PDF(str(pdf_path))
    full_lines = []
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        for line in text.split("\n"):
            full_lines.append({"page": i + 1, "line": line})

    # Walk through lines, find first match for each Part header
    starts = {}
    for name, pat in PART_HEADERS:
        rx = re.compile(pat)
        for idx, row in enumerate(full_lines):
            if rx.match(row["line"].strip()):
                if name not in starts:
                    starts[name] = idx
                    break

    sorted_marks = sorted(starts.items(), key=lambda kv: kv[1])
    sections = {}
    for i, (name, start_idx) in enumerate(sorted_marks):
        end_idx = sorted_marks[i + 1][1] if i + 1 < len(sorted_marks) else len(full_lines)
        body_lines = [r["line"] for r in full_lines[start_idx:end_idx]]
        sections[name] = "\n".join(body_lines)

    # Write per-section text + manifest
    manifest = {
        "pdf": str(pdf_path),
        "page_count": len(pdf.pages),
        "section_starts_line": starts,
        "section_lengths": {k: len(v) for k, v in sections.items()},
    }
    for name, body in sections.items():
        slug = name.lower().replace(" ", "-")
        (out_dir / f"{slug}.txt").write_text(body)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    print(f"Wrote {len(sections)} sections to {out_dir}/")
    for name, body in sections.items():
        print(f"  {name:<10} {len(body):>6} chars  (line {starts[name]})")


if __name__ == "__main__":
    main()
