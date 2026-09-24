"""
Keeps the tracker's top matches honest. A job's score is computed once, at
scrape time, from whatever snippet the source returned — so a listing that
has since closed, or whose full page asks for 3+ years, kept its 98 forever.

check_listings():
  1. archives never-touched 'found' jobs older than max_age_days, then
  2. re-opens the live page of the top-scored unchecked jobs and
     - archives the ones that no longer take applications, and
     - lowers the score when the full page states 2+ years of experience.

Runs daily from the auto-find cron, from `main.py check`, and from the
dashboard's "Re-check listings" button.
"""
import re
import time

import requests
from bs4 import BeautifulSoup

from agents.job_quality import EXPERIENCE_POINTS, listing_is_closed, required_years
from agents.tracker import TrackerAgent

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36"}

# Job boards append other postings ("Similar jobs", "People also viewed")
# below the listing — their experience lines and "closed" badges must not be
# read as this job's. Everything from the first of these markers is dropped.
_OTHER_LISTINGS = re.compile(
    r"similar jobs|similar internships|people also viewed|more jobs like this|jobs you may be interested|"
    r"recommended jobs|other jobs at|you might also like|similar searches",
    re.I,
)

# LinkedIn's public job page is login-walled for scripts; its guest API
# serves the same listing (including the "No longer accepting" banner).
_LINKEDIN_ID = re.compile(r"linkedin\.com/jobs/view/(?:[^/?]*-)?(\d{6,})")


def _download(url: str) -> tuple[int, str]:
    m = _LINKEDIN_ID.search(url)
    if m:
        url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{m.group(1)}"
    r = requests.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
    return r.status_code, r.text


def _fetch_listing_text(url: str) -> tuple[int, str]:
    """(status, visible text of this listing only)."""
    status, html = _download(url)
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    cut = _OTHER_LISTINGS.search(text)
    return status, text[: cut.start()] if cut else text


def check_listings(user_id: str, limit: int = 30, max_age_days: int = 30, progress=None) -> dict:
    tracker = TrackerAgent()
    emit = progress or (lambda event: None)
    summary = {"archived_old": tracker.archive_stale_jobs(user_id, max_age_days),
               "checked": 0, "closed": 0, "downgraded": 0, "errors": 0, "changes": []}

    for job in tracker.get_jobs_to_check(user_id, limit=limit):
        summary["checked"] += 1
        try:
            status, text = _fetch_listing_text(job["url"])
        except Exception:
            summary["errors"] += 1
            continue
        # Pages that failed to render (bot walls, 5xx) prove nothing either way
        # — don't mark them checked, so the next run tries again.
        if status >= 500 or status in (401, 403, 429) or (len(text) < 200 and status not in (404, 410)):
            summary["errors"] += 1
            continue

        closed = listing_is_closed(text, status)
        new_score, note = None, ""
        if not closed:
            years = required_years(text)
            if years is not None and years >= 2:
                penalty = EXPERIENCE_POINTS.get(min(years, 5), -35)
                new_score = max(0, (job["score"] or 0) + penalty)
                note = f"live listing asks for {years}+ yrs"
        tracker.record_listing_check(user_id, job["id"], closed, new_score, note)

        if closed or new_score is not None:
            change = {"id": job["id"], "title": job["title"], "company": job["company"],
                      "closed": closed, "old_score": job["score"], "new_score": new_score, "note": note}
            summary["changes"].append(change)
            summary["closed" if closed else "downgraded"] += 1
            emit({"type": "listing_change", **change})
        time.sleep(1)  # be polite to the boards

    return summary
