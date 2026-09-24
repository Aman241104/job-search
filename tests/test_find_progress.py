"""find_jobs(progress=...) must report every stage the dashboard's live
progress panel draws — without touching the network or an LLM."""
import agents.job_finder as jf
from agents.job_finder import JobFinderAgent


def test_find_jobs_emits_live_progress(monkeypatch):
    finder = JobFinderAgent(profile={"enabled_sources": ["weworkremotely", "arbeitnow"]})
    finder.existing_urls, finder.existing_title_company = set(), set()

    fake = lambda n: [{"title": f"React Developer {n}{i}", "company": f"Co{n}{i}", "url": f"https://x/{n}{i}",
                       "location": "Remote", "source": n, "description": "react"} for i in range(2)]
    monkeypatch.setattr(finder, "_fetch_weworkremotely", lambda: fake("wwr"))
    monkeypatch.setattr(finder, "_fetch_arbeitnow", lambda: fake("arb"))
    monkeypatch.setattr(finder, "_save_jobs", lambda jobs: len(jobs))
    # Force every job into the "uncertain" band so the per-job AI events fire
    monkeypatch.setattr(finder, "keyword_score", lambda job: (50, "kw"))
    monkeypatch.setattr(jf, "score_job_single", lambda job, *a, **k: {"score": 88, "reason": "ai"})
    monkeypatch.setattr(jf.time, "sleep", lambda s: None)

    events = []
    jobs = finder.find_jobs(progress=events.append)
    types = [e["type"] for e in events]

    assert types.count("source_start") == 2 and types.count("source_done") == 2
    assert events[types.index("source_done")]["count"] == 2
    assert {"type": "filtered", "raw": 4, "unique": 4} in events
    kw = next(e for e in events if e["type"] == "keyword_scored")
    assert kw["total"] == 4 and kw["uncertain"] == 4
    ai = [e for e in events if e["type"] == "ai_scored"]
    assert [e["index"] for e in ai] == [1, 2, 3, 4] and ai[-1]["total"] == 4
    assert ai[0]["job"]["score"] == 88
    assert types.index("filtered") < types.index("keyword_scored") < types.index("ai_start")
    assert all(j["score"] == 88 for j in jobs)


def test_find_stream_forwards_progress_events(monkeypatch, test_user):
    """The SSE endpoint must relay the finder's worker-thread events to the
    browser live, then finish with 'done'."""
    import json
    from fastapi.testclient import TestClient
    import app as app_module
    from auth import get_current_user

    def fake_find_jobs(self, keywords=None, limit=500, progress=None):
        progress({"type": "source_start", "label": "Fake: react"})
        progress({"type": "source_done", "label": "Fake: react", "count": 1, "total": 1})
        progress({"type": "filtered", "raw": 1, "unique": 1})
        return [{"id": "fake-1", "title": "React Dev", "company": "Fake", "url": "https://fake/1", "score": 90}]

    monkeypatch.setattr(app_module.JobFinderAgent, "find_jobs", fake_find_jobs)
    monkeypatch.setattr(app_module.TrackerAgent, "add_job", lambda self, uid, job: False)
    monkeypatch.setattr(app_module.TelegramNotifierAgent, "__init__", lambda self: setattr(self, "enabled", False))
    app_module.app.dependency_overrides[get_current_user] = lambda: test_user
    try:
        with TestClient(app_module.app) as client:
            body = client.get("/api/find").text
    finally:
        app_module.app.dependency_overrides.clear()

    events = [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]
    types = [e["type"] for e in events]
    assert types[0] == "start"
    assert types.index("source_start") < types.index("source_done") < types.index("filtered") < types.index("done")
    assert events[-1]["type"] == "done"
