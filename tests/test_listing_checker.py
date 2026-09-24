"""check_listings against a real (synthetic) user's rows, with the network stubbed."""
import uuid
from datetime import datetime, timedelta

import agents.listing_checker as lc


def _add(tracker, user_id, title, score, days_old=1):
    job = {"id": str(uuid.uuid4()), "title": title, "company": "Co", "url": f"https://jobs.example/{uuid.uuid4()}",
           "source": "Test", "location": "Remote", "salary": "", "description": "", "score": score,
           "date_found": (datetime.now() - timedelta(days=days_old)).isoformat()}
    assert tracker.add_job(user_id, job)
    return job


def test_check_listings_archives_and_rescored(tracker, test_user, monkeypatch):
    closed = _add(tracker, test_user, "Closed role", 95)
    senior = _add(tracker, test_user, "Needs 3 years", 90)
    fine = _add(tracker, test_user, "Fresher role", 85)
    old = _add(tracker, test_user, "Ancient role", 80, days_old=45)

    pages = {
        closed["url"]: (200, "React developer " * 20 + " No longer accepting applications"),
        senior["url"]: (200, "React developer " * 20 + " Requirements: 3+ years of experience in React."),
        fine["url"]: (200, "React developer " * 20 + " Freshers welcome. Similar jobs: Senior dev, 5+ years experience"),
    }
    monkeypatch.setattr(lc, "_download", lambda url: (pages[url][0], f"<html><body><main>{pages[url][1]}</main></body></html>"))
    monkeypatch.setattr(lc.time, "sleep", lambda s: None)

    res = lc.check_listings(test_user, limit=10, max_age_days=30)

    assert res["archived_old"] == 1 and res["closed"] == 1 and res["downgraded"] == 1
    with tracker._get_conn() as conn:
        rows = dict(conn.execute(
            "SELECT j.id, a.status FROM jobs j JOIN applications a ON a.job_id = j.id WHERE j.user_id = ?", (test_user,)
        ).fetchall())
        score = conn.execute("SELECT score FROM jobs WHERE id = ?", (senior["id"],)).fetchone()[0]
    assert rows[closed["id"]] == "skipped" and rows[old["id"]] == "skipped"
    assert rows[senior["id"]] == "found" and score == 90 - 25
    assert rows[fine["id"]] == "found"   # "5+ years" was in the similar-jobs section, not this listing

    # Checked jobs aren't re-opened on the next run
    assert lc.check_listings(test_user, limit=10)["checked"] == 0
