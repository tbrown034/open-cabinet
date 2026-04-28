"""
One-shot: find Lutnick's Nominee 278 in the OGE corpus, print URL.
"""
import json
import re
import urllib.request

API = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest"


UA = "Mozilla/5.0 (Open-Cabinet research; trevorbrown.web@gmail.com)"


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


def main():
    print("Fetching OGE corpus...")
    recs = fetch_all()
    print(f"  {len(recs)} records\n")

    lutnick = [r for r in recs if r.get("name", "") == "Lutnick, Howard"]
    print(f"Found {len(lutnick)} Lutnick records:")
    for r in lutnick:
        t = r.get("type", "")
        # extract pdf url if any
        m = re.search(r"href='([^']+\.pdf)'", t)
        pdf_url = m.group(1) if m else "(no PDF — Form 201 only)"
        # type label (text outside tags)
        label = re.sub(r"<[^>]+>", "", t).strip()[:60]
        print(f"  [{r.get('docDate', '')[:10]}] {label}")
        print(f"      {pdf_url}")
        print()


if __name__ == "__main__":
    main()
