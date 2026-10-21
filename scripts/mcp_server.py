"""MCP server: drive Job Search from Claude Code / Claude Desktop.

    claude mcp add job-search -e JOBSEARCH_EMAIL=you@gmail.com -- \\
        /path/to/job-serach/.venv/bin/python /path/to/job-serach/scripts/mcp_server.py

Acts as the one account whose email is in JOBSEARCH_EMAIL, using the same
.env / DATABASE_URL as the app. Speaks MCP over stdio (newline-delimited
JSON-RPC) with the stdlib only; stdout is reserved for protocol messages, so
everything else is redirected to stderr.
"""
import contextlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

PROTOCOL = "2025-06-18"
_out = sys.stdout
sys.stdout = sys.stderr          # stray prints from the app must not corrupt the protocol


def _user_id() -> str:
    from agents.tracker import TrackerAgent
    email = os.environ.get("JOBSEARCH_EMAIL", "")
    user = TrackerAgent().get_user_by_email(email) if email else None
    if not user:
        raise RuntimeError(f"No Job Search account for JOBSEARCH_EMAIL={email!r}")
    return user["id"]


def _job(tracker, user_id: str, job_id: str) -> dict:
    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    if not row:
        raise ValueError(f"No job {job_id}")
    return row


def _resume(tracker, user_id: str) -> dict:
    resume = tracker.get_resume(user_id)
    if isinstance(resume, str):
        resume = json.loads(resume)
    if not resume:
        from agents.cv_customizer import CVCustomizerAgent
        resume = CVCustomizerAgent().master_resume
    return resume


def top_jobs(limit: int = 10, min_score: int = 60) -> list:
    from agents.tracker import TrackerAgent
    tracker, uid = TrackerAgent(), _user_id()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        rows = conn.execute("""
            SELECT j.id, j.title, j.company, j.location, j.salary, j.score, j.score_reason, j.url, a.status
            FROM jobs j JOIN applications a ON a.job_id = j.id AND a.user_id = j.user_id
            WHERE j.user_id = ? AND a.status = 'found' AND j.score >= ?
            ORDER BY j.score DESC LIMIT ?""", (uid, min_score, min(int(limit), 50))).fetchall()
    return rows


def add_job(url: str = "", text: str = "") -> dict:
    from agents.job_finder import JobFinderAgent
    from agents.job_import import import_job
    from agents.tracker import TrackerAgent
    tracker, uid = TrackerAgent(), _user_id()
    job = import_job(url=url, text=text)
    scorer = JobFinderAgent.__new__(JobFinderAgent)
    scorer.profile = tracker.get_profile(uid) or {}
    job["score"], job["score_reason"] = scorer.keyword_score(job)
    tracker.add_job(uid, job)
    return {k: job[k] for k in ("id", "title", "company", "location", "score", "score_reason", "url")}


def job_match(job_id: str) -> dict:
    from agents.cv_validator import resume_match
    from agents.tracker import TrackerAgent
    tracker, uid = TrackerAgent(), _user_id()
    job = _job(tracker, uid, job_id)
    return resume_match(f"{job['title']} {job['description']}", _resume(tracker, uid))


def apply_kit(job_id: str) -> dict:
    """Ready-to-paste application form answers (cached once generated)."""
    from agents.application_kit import form_answers
    from agents.cv_customizer import CVCustomizerAgent
    from agents.tracker import TrackerAgent
    tracker, uid = TrackerAgent(), _user_id()
    cached = tracker.get_application_extra(uid, job_id, "form_answers")
    if cached:
        return cached
    job, resume = _job(tracker, uid, job_id), _resume(tracker, uid)
    projects = CVCustomizerAgent()._select_relevant_projects(job, resume=resume, top_n=3)
    answers = form_answers(job, resume, projects, tracker.get_profile(uid))
    tracker.save_application_extra(uid, job_id, "form_answers", answers)
    return answers


def set_status(job_id: str, status: str, notes: str = "") -> dict:
    from agents.tracker import TrackerAgent
    tracker, uid = TrackerAgent(), _user_id()
    _job(tracker, uid, job_id)
    tracker.update_status(uid, job_id, status, notes=notes)
    return {"job_id": job_id, "status": status}


def streak() -> dict:
    from datetime import date
    from agents.review import DEFAULT_GOAL, streak as compute
    from agents.tracker import TrackerAgent
    tracker, uid = TrackerAgent(), _user_id()
    goal = int(tracker.get_setting(uid, "daily_goal", str(DEFAULT_GOAL)) or DEFAULT_GOAL)
    return compute(tracker.activity_by_day(uid, days=366), goal, date.today())


def _schema(props: dict, required: list = ()) -> dict:
    return {"type": "object", "properties": props, "required": list(required)}


S, I = {"type": "string"}, {"type": "integer"}
TOOLS = {
    "top_jobs": (top_jobs, "Best-scoring jobs you haven't acted on yet.",
                 _schema({"limit": I, "min_score": I})),
    "add_job": (add_job, "Save a job from a link, or from pasted text (WhatsApp post, referral message).",
                _schema({"url": S, "text": S})),
    "job_match": (job_match, "Resume match % for a job, missing skills, and which bullets to lead with.",
                  _schema({"job_id": S}, ["job_id"])),
    "apply_kit": (apply_kit, "Ready-to-paste answers for a job's application form.",
                  _schema({"job_id": S}, ["job_id"])),
    "set_status": (set_status, "Update a job's status after you act on it.",
                   _schema({"job_id": S, "notes": S,
                            "status": {"type": "string", "enum": ["found", "applied", "interviewing", "offer",
                                                                  "rejected", "ghosted", "skipped"]}},
                           ["job_id", "status"])),
    "streak": (streak, "Today's goal progress and the current daily streak.", _schema({})),
}


def handle(msg: dict) -> dict | None:
    method, mid = msg.get("method"), msg.get("id")
    if mid is None:                      # notification (e.g. notifications/initialized)
        return None
    if method == "initialize":
        result = {"protocolVersion": msg.get("params", {}).get("protocolVersion", PROTOCOL),
                  "capabilities": {"tools": {}},
                  "serverInfo": {"name": "job-search", "version": "1.0.0"}}
    elif method == "tools/list":
        result = {"tools": [{"name": n, "description": d, "inputSchema": s} for n, (_, d, s) in TOOLS.items()]}
    elif method == "tools/call":
        name = msg["params"]["name"]
        if name not in TOOLS:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32602, "message": f"Unknown tool {name}"}}
        try:
            out = TOOLS[name][0](**(msg["params"].get("arguments") or {}))
            result = {"content": [{"type": "text", "text": json.dumps(out, indent=1, default=str)}]}
        except Exception as e:  # tool errors go back to the model, not the transport
            result = {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True}
    elif method == "ping":
        result = {}
    else:
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"Method not found: {method}"}}
    return {"jsonrpc": "2.0", "id": mid, "result": result}


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            reply = handle(json.loads(line))
        except ValueError:
            reply = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
        if reply:
            _out.write(json.dumps(reply, default=str) + "\n")
            _out.flush()


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        main()
