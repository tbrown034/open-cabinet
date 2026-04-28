"""
Fetch OGE records + download PDFs for a list of officials.
Outputs a metadata JSON we can use to write source-docs files.

Usage: python3 scripts/fetch-source-docs.py <slug> "<OGE name>"
       e.g. python3 scripts/fetch-source-docs.py noem-kristi "Noem, Kristi"
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

API = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest"
UA = "Mozilla/5.0 (Open-Cabinet research; trevorbrown.web@gmail.com)"
MIN_DATE = "2024-12-01"

def fetch_all():
    out, start = [], 0
    while True:
        req = urllib.request.Request(
            f"{API}?start={start}&length=1000",
            headers={"User-Agent": UA},
        )
        with urllib.request.urlopen(req) as r:
            d = json.loads(r.read())
        recs = d.get("data", [])
        if not recs:
            break
        out += recs
        start += 1000
        if start >= d.get("recordsTotal", 0):
            break
    return out


def classify(type_field: str) -> str:
    if "Certificate of Divestiture" in type_field:
        return "certificate_of_divestiture"
    if "Conflict of Interest Waiver" in type_field:
        return "conflict_waiver"
    if "Certification of Ethics Agreement Compliance" in type_field:
        return "compliance_cert"
    if "Ethics Agreement" in type_field:
        return "ethics_agreement"
    if "Nominee 278" in type_field:
        return "nominee_278"
    if "278 Transaction" in type_field or re.search(r"\b278T\b", type_field):
        return "transaction_278t"
    if "Termination" in type_field:
        return "other"
    if "Annual" in type_field:
        return "other"
    return "other"


def public_pdf_url(type_field: str):
    m = re.search(r"href='([^']+\.pdf)'", type_field)
    return m.group(1) if m else None


def download_pdf(url: str, dest: Path):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r:
        dest.write_bytes(r.read())


def main():
    if len(sys.argv) < 3:
        print("Usage: fetch-source-docs.py <slug> '<OGE name>'")
        sys.exit(1)
    slug = sys.argv[1]
    name = sys.argv[2]

    print(f"Fetching for {slug} ({name})...", file=sys.stderr)
    records = fetch_all()
    matched = [
        r for r in records
        if r.get("name", "").strip() == name and r.get("docDate", "")[:10] >= MIN_DATE
    ]
    print(f"  {len(matched)} matching records", file=sys.stderr)

    pdf_dir = Path("public/data/source-docs")
    pdf_dir.mkdir(parents=True, exist_ok=True)

    documents = []
    for r in matched:
        date_iso = r.get("docDate", "")[:10]
        kind = classify(r.get("type", ""))
        pdf_url = public_pdf_url(r.get("type", ""))
        # Strip HTML for OGE record URL
        oge_url = pdf_url or "https://extapps2.oge.gov/201/Presiden.nsf/"
        publicly = bool(pdf_url)
        pdf_path = None

        if publicly:
            fname = f"{slug}-{kind}-{date_iso.replace('-', '')}.pdf"
            local = pdf_dir / fname
            if not local.exists() or local.stat().st_size < 500:
                try:
                    download_pdf(pdf_url, local)
                    print(f"  downloaded {fname}", file=sys.stderr)
                except Exception as e:
                    print(f"  ERR {fname}: {e}", file=sys.stderr)
                    publicly = False
            if local.exists() and local.stat().st_size >= 500:
                pdf_path = f"/data/source-docs/{fname}"

        title_label = re.sub(r"<[^>]+>", "", r.get("type", "")).strip()
        # Strip "(Request this Document)"
        title_label = re.sub(r"\s*\(.*\)\s*$", "", title_label).strip() or "Disclosure"

        documents.append({
            "kind": kind,
            "title": title_label,
            "filedDate": date_iso,
            "publiclyDownloadable": publicly,
            "pdfPath": pdf_path,
            "ogeUrl": oge_url,
            "_pdfUrl": pdf_url,  # internal
        })

    print(json.dumps({"slug": slug, "name": name, "documents": documents}, indent=2))


if __name__ == "__main__":
    main()
