"""
Verification Script: natural-pdf + Claude Sonnet hybrid extraction.

Uses natural-pdf (by Jonathan Soma) to extract text page-by-page,
then sends each page's text to Claude Sonnet for structured parsing.
Compares results against existing JSON data.

This is the dual-lane verification approach:
- Lane 1: Existing AI-parsed data (data/officials/*.json)
- Lane 2: natural-pdf extraction + Claude per-page parsing (this script)

Usage:
    python3 scripts/verify-naturalpdf.py trump-donald-j
    python3 scripts/verify-naturalpdf.py --all
"""
import json
import os
import sys
import time
import urllib.request
import re
from pathlib import Path

# Setup
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "officials"
PDF_CACHE = Path("/tmp/cabinet-pdfs")
PDF_CACHE.mkdir(exist_ok=True)

# Load env
from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env.local")

import anthropic

EXTRACTION_PROMPT = """You are parsing a page of text extracted from a U.S. Office of Government Ethics Form 278-T.

The text below is OCR output and may contain errors (e.g., "purehase" for "Purchase", "Vos" for "Yes").

Extract every transaction from this text. For each transaction, return a JSON object:
- description: the full asset name
- ticker: stock ticker if present in parentheses, otherwise null
- type: "Sale", "Purchase", "Sale (Partial)", "Sale (Full)", or "Exchange"
- date: YYYY-MM-DD format
- amount: exact OGE range string from this list:
  "$1,001-$15,000", "$15,001-$50,000", "$50,001-$100,000",
  "$100,001-$250,000", "$250,001-$500,000", "$500,001-$1,000,000",
  "$1,000,001-$5,000,000", "$5,000,001-$25,000,000",
  "$25,000,001-$50,000,000", "Over $50,000,000"
- lateFilingFlag: true if notification was received over 30 days ago, false otherwise

Handle OCR errors: "purehase"/"ourchase"/"curchaso" = Purchase, "Vos"/"Yos" = Yes, etc.
If the amount is cut off or unclear, use your best guess from context and the standard ranges.
Two-digit years (e.g., 7/17/25) should be interpreted as 2025 or 2026 based on context.

Return ONLY a JSON array. If no transactions on this page, return [].
"""


def download_pdf(url: str, slug: str, label: str) -> Path:
    """Download PDF if not cached."""
    safe_name = f"{slug}-{label.replace(' ', '-').replace('/', '-')}.pdf"
    path = PDF_CACHE / safe_name
    if path.exists() and path.stat().st_size > 1000:
        return path
    print(f"  Downloading {label}...")
    urllib.request.urlretrieve(url, str(path))
    return path


def extract_pages_naturalpdf(pdf_path: Path) -> list[str]:
    """Extract text from each page using natural-pdf."""
    from natural_pdf import PDF
    pdf = PDF(str(pdf_path))
    pages = []
    for page in pdf.pages:
        text = page.extract_text() or ""
        pages.append(text)
    return pages


def parse_page_with_claude(text: str, client: anthropic.Anthropic) -> list[dict]:
    """Send page text to Claude Sonnet for structured extraction."""
    if len(text.strip()) < 50:
        return []

    # Skip pages that are ONLY cover/summary (no transaction data)
    has_transaction_keywords = any(kw in text for kw in ["Sale", "Purchase", "Exchange", "purehase", "ourchase", "Purehase"])
    if not has_transaction_keywords:
        return []

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        messages=[{
            "role": "user",
            "content": f"{EXTRACTION_PROMPT}\n\n---PAGE TEXT---\n{text}"
        }]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        print(f"    JSON parse failed")
        return []


def verify_official(slug: str):
    """Run dual-lane verification for one official."""
    json_path = DATA_DIR / f"{slug}.json"
    if not json_path.exists():
        print(f"No data file for {slug}")
        return

    with open(json_path) as f:
        data = json.load(f)

    source_filings = data.get("sourceFilings", [])
    if not source_filings:
        print(f"{slug}: No source filings — skipping")
        return

    existing_tx = data["transactions"]
    print(f"\n{'='*60}")
    print(f"VERIFYING: {data['name']} ({slug})")
    print(f"Existing transactions: {len(existing_tx)}")
    print(f"Source filings: {len(source_filings)}")
    print(f"{'='*60}")

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    all_extracted = []
    total_cost = 0

    for filing in source_filings:
        pdf_path = download_pdf(filing["url"], slug, filing["label"])
        print(f"\n  {filing['label']} ({filing['date']}) — {pdf_path.stat().st_size // 1024}KB")

        pages = extract_pages_naturalpdf(pdf_path)
        print(f"    Pages: {len(pages)}")

        filing_tx = []
        for i, page_text in enumerate(pages):
            if len(page_text.strip()) < 100:
                continue

            tx = parse_page_with_claude(page_text, client)
            if tx:
                filing_tx.extend(tx)
                print(f"    Page {i}: {len(tx)} transactions")

            time.sleep(1)  # Rate limit

        print(f"    Filing total: {len(filing_tx)} transactions")
        all_extracted.extend(filing_tx)

    # Deduplicate by (description, date, type) — keep last occurrence
    seen = {}
    for tx in all_extracted:
        key = (tx.get("description", ""), tx.get("date", ""), tx.get("type", ""))
        seen[key] = tx

    deduped = list(seen.values())

    # Compare
    existing_keys = set()
    for tx in existing_tx:
        key = (tx["description"], tx["date"], tx["type"])
        existing_keys.add(key)

    new_keys = set()
    for tx in deduped:
        key = (tx.get("description", ""), tx.get("date", ""), tx.get("type", ""))
        new_keys.add(key)

    matches = existing_keys & new_keys
    missing_from_json = new_keys - existing_keys
    extra_in_json = existing_keys - new_keys

    print(f"\n--- RESULTS ---")
    print(f"natural-pdf + Claude extracted: {len(deduped)}")
    print(f"Existing JSON: {len(existing_tx)}")
    print(f"Matches: {len(matches)}")
    print(f"Missing from JSON (new to add): {len(missing_from_json)}")
    print(f"Extra in JSON (not in new extraction): {len(extra_in_json)}")

    if len(missing_from_json) > 0:
        print(f"\n  NEW TRANSACTIONS TO ADD: {len(missing_from_json)}")
        # Merge: keep existing + add missing
        new_tx_to_add = [tx for tx in deduped
                         if (tx.get("description",""), tx.get("date",""), tx.get("type","")) in missing_from_json]

        merged = existing_tx + new_tx_to_add
        merged.sort(key=lambda t: t.get("date", ""), reverse=True)

        data["transactions"] = merged

        # Update summary
        sales = sum(1 for t in merged if t.get("type") in ("Sale", "Sale (Partial)", "Sale (Full)"))
        purchases = sum(1 for t in merged if t.get("type") == "Purchase")
        late = sum(1 for t in merged if t.get("lateFilingFlag"))
        data["summary"] = f"Verified extraction: {sales} sales and {purchases} purchases across {len(merged)} transactions. {late} were filed late."

        with open(json_path, "w") as f:
            json.dump(data, f, indent=2)

        print(f"  UPDATED: {slug} now has {len(merged)} transactions")
    else:
        print(f"  Data is complete — no missing transactions")

    return {
        "slug": slug,
        "existing": len(existing_tx),
        "extracted": len(deduped),
        "matches": len(matches),
        "missing": len(missing_from_json),
        "extra": len(extra_in_json),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/verify-naturalpdf.py <slug>")
        print("       python3 scripts/verify-naturalpdf.py --all")
        sys.exit(1)

    if sys.argv[1] == "--all":
        results = []
        for f in sorted(DATA_DIR.glob("*.json")):
            slug = f.stem
            result = verify_official(slug)
            if result:
                results.append(result)

        print(f"\n{'='*60}")
        print("SUMMARY")
        for r in results:
            status = "COMPLETE" if r["missing"] == 0 else f"ADDED {r['missing']}"
            print(f"  {r['slug']:30} {r['existing']:>5} → {r['extracted']:>5} ({status})")
    else:
        verify_official(sys.argv[1])
