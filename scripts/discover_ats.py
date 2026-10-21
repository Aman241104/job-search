"""Find which companies publish a Greenhouse / Lever / Ashby job board.

    .venv/bin/python scripts/discover_ats.py Razorpay CRED "Zeta Suite" ...

Tries slug spellings of each name against the three public board APIs (the
same probe career-ops' discover-ats.mjs does) and prints the hits as a
TRACKED_ATS_COMPANIES snippet for agents/job_finder.py, with open-role counts.
Check a hit's job links before adding it: short names collide (greenhouse
"pine" is a Canadian company, not Pine Labs).
"""
import re
import sys
from concurrent.futures import ThreadPoolExecutor

import requests

API = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{}/jobs",
    "lever":      "https://api.lever.co/v0/postings/{}",
    "ashby":      "https://api.ashbyhq.com/posting-api/job-board/{}",
}
HEADERS = {"User-Agent": "Mozilla/5.0"}


def slugs(name: str) -> list:
    words = re.findall(r"[a-z0-9]+", name.lower())
    out = ["".join(words), "-".join(words), words[0] if words else ""]
    return [s for s in dict.fromkeys(out) if s]


def open_roles(provider: str, slug: str) -> int | None:
    """Role count for a live board, None when the slug isn't a board."""
    try:
        r = requests.get(API[provider].format(slug), headers=HEADERS, timeout=20)
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    jobs = data if isinstance(data, list) else data.get("jobs", [])
    return len(jobs)


def discover(name: str) -> list:
    hits = []
    for provider in API:
        for slug in slugs(name):
            n = open_roles(provider, slug)
            if n is not None:
                hits.append((name, provider, slug, n))
                break
    return hits


def main(names: list) -> None:
    with ThreadPoolExecutor(8) as ex:
        found = [h for hits in ex.map(discover, names) for h in hits]
    missing = sorted(set(names) - {h[0] for h in found})
    for name, provider, slug, n in sorted(found, key=lambda h: (h[1], h[2])):
        print(f"{provider:10} {slug:22} {n:4} open roles   ({name})")
    print("\nNo board found:", ", ".join(missing) or "-")
    print("\nTRACKED_ATS_COMPANIES additions (boards with open roles):")
    for provider in API:
        live = [h[2] for h in found if h[1] == provider and h[3] > 0]
        if live:
            print(f'    "{provider}": {live},')


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
