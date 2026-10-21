"""Build data/ats_directory.json: the company boards worth scanning daily.

    .venv/bin/python scripts/build_ats_directory.py

Starts from JobSync's seed directory (MIT, github.com/Gsync/jobsync: ~1,800
Greenhouse/Lever/Ashby boards), probes every board once with the same
fetchers and filters find_jobs uses (tech title, open to India, posted in the
last 45 days), and keeps only boards that have such a role today. Re-run every
few weeks: the daily scan reads the file, it never probes all 3,500 boards.
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agents.job_finder import JobFinderAgent, TRACKED_ATS_COMPANIES  # noqa: E402

SEED = "https://raw.githubusercontent.com/Gsync/jobsync/main/src/lib/scraper/{}/companies.json"
OUT = ROOT / "data" / "ats_directory.json"


def main() -> None:
    finder = JobFinderAgent.__new__(JobFinderAgent)
    fetch = {"greenhouse": finder._fetch_greenhouse, "lever": finder._fetch_lever, "ashby": finder._fetch_ashby}
    boards = []
    for provider in fetch:
        seed = requests.get(SEED.format(provider), timeout=60).json()
        for c in seed:
            slug = f"eu:{c['token']}" if c.get("host") == "eu" else c["token"]
            if slug not in TRACKED_ATS_COMPANIES[provider]:
                boards.append((provider, slug))
    print(f"probing {len(boards)} boards...", flush=True)

    def probe(board):
        provider, slug = board
        jobs = [j for j in fetch[provider](slug)
                if finder._ats_keep(j)]
        return provider, slug, len(jobs)

    with ThreadPoolExecutor(24) as ex:
        hits = [h for h in ex.map(probe, boards) if h[2]]

    directory = {p: sorted(s for pp, s, _ in hits if pp == p) for p in fetch}
    OUT.write_text(json.dumps(directory, indent=1) + "\n")
    for provider, slug, n in sorted(hits, key=lambda h: -h[2]):
        print(f"  {provider:10} {slug:28} {n} India-eligible tech roles")
    print(f"\nwrote {sum(map(len, directory.values()))} boards to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
