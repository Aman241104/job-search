import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATA_DIR, OUTPUT_DIR
from rich.console import Console
from rich.table import Table

console = Console()

# ── Postgres support (DATABASE_URL-gated) ───────────────────────────────────
# Local dev (no DATABASE_URL) keeps using the existing zero-setup SQLite file.
# A real deployment sets DATABASE_URL to a Postgres connection string (e.g. the
# Supabase pooled/pgbouncer URL). _PgConnWrapper below is a drop-in stand-in for
# a sqlite3.Connection so every existing method in this file (and every direct
# `tracker._get_conn()` caller in app.py) keeps working completely unchanged —
# it emulates `.execute()` with `?`-style placeholders (auto-translated to
# Postgres's `%s`) and `.row_factory = sqlite3.Row` (auto-translated to
# dict-returning rows via cursor.description, since psycopg2.extras.RealDictRow
# doesn't support the positional row[0] access some methods also rely on).
DATABASE_URL = os.getenv("DATABASE_URL", "")
_pg_pool = None
if DATABASE_URL:
    import psycopg2
    import psycopg2.pool
    _pg_pool = psycopg2.pool.ThreadedConnectionPool(1, 10, DATABASE_URL)


class _DictCursorProxy:
    """Wraps a plain psycopg2 cursor so fetchone()/fetchall() return dicts,
    emulating sqlite3's `row_factory = sqlite3.Row` + `dict(row)` pattern."""

    def __init__(self, cursor):
        self._cursor = cursor

    def _cols(self):
        return [c[0] for c in self._cursor.description]

    def fetchone(self):
        row = self._cursor.fetchone()
        return dict(zip(self._cols(), row)) if row is not None else None

    def fetchall(self):
        cols = self._cols()
        return [dict(zip(cols, row)) for row in self._cursor.fetchall()]

    @property
    def description(self):
        return self._cursor.description


class _PgConnWrapper:
    """Pooled-Postgres stand-in for a sqlite3.Connection. Returns the connection
    to the pool on __exit__ instead of closing it (connections are reused)."""

    def __init__(self, pool):
        self._pool = pool
        self._conn = pool.getconn()
        self.row_factory = None  # settable, mirrors sqlite3.Connection.row_factory

    def execute(self, sql, params=()):
        cursor = self._conn.cursor()
        cursor.execute(sql.replace("?", "%s"), params)
        return _DictCursorProxy(cursor) if self.row_factory else cursor

    def commit(self):
        self._conn.commit()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._pool.putconn(self._conn)

STATUS_COLORS = {
    "found": "D3D3D3",        # gray
    "applied": "ADD8E6",      # light blue
    "interviewing": "FFFF99", # yellow
    "offer": "90EE90",        # green
    "rejected": "FFB6C1",     # red/pink
    "ghosted": "E8E8E8",      # light gray
}


class TrackerAgent:
    def __init__(self):
        self.db_path = Path(DATA_DIR) / "applications.db"
        self.excel_path = Path(OUTPUT_DIR) / "job_tracker.xlsx"
        self._init_db()

    def _get_conn(self):
        if _pg_pool:
            return _PgConnWrapper(_pg_pool)
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    company TEXT,
                    description TEXT,
                    url TEXT UNIQUE,
                    source TEXT,
                    location TEXT,
                    salary TEXT,
                    date_found TEXT,
                    tags TEXT,
                    score INTEGER DEFAULT 0,
                    score_reason TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS applications (
                    id TEXT PRIMARY KEY,
                    job_id TEXT UNIQUE,
                    date_applied TEXT,
                    status TEXT DEFAULT 'found',
                    cv_path TEXT,
                    cover_letter_path TEXT,
                    notes TEXT,
                    last_updated TEXT,
                    FOREIGN KEY (job_id) REFERENCES jobs(id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS training_sessions (
                    id TEXT PRIMARY KEY,
                    topic_key TEXT,
                    topic_name TEXT,
                    messages TEXT,
                    avg_score REAL DEFAULT 0,
                    created_at TEXT,
                    last_updated TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS blacklisted_companies (
                    company TEXT PRIMARY KEY,
                    blacklisted_at TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS interview_rounds (
                    id TEXT PRIMARY KEY,
                    job_id TEXT,
                    round_num INTEGER,
                    round_type TEXT,
                    scheduled_at TEXT,
                    result TEXT,
                    notes TEXT,
                    created_at TEXT,
                    FOREIGN KEY (job_id) REFERENCES jobs(id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS learning_items (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    item_type TEXT,
                    phase INTEGER,
                    order_index INTEGER,
                    status TEXT DEFAULT 'not_started',
                    notes TEXT,
                    updated_at TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS telegram_alerts (
                    message_id TEXT PRIMARY KEY,
                    job_id TEXT,
                    sent_at TEXT,
                    FOREIGN KEY (job_id) REFERENCES jobs(id)
                )
            """)
            if _pg_pool:
                # Postgres supports IF NOT EXISTS on ADD COLUMN directly — no need
                # for the try/except dance, and a failed statement would otherwise
                # poison the rest of this transaction (unlike SQLite).
                conn.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS starred INTEGER DEFAULT 0")
            else:
                try:
                    conn.execute("ALTER TABLE jobs ADD COLUMN starred INTEGER DEFAULT 0")
                except Exception:
                    pass
            # Indexes for performance
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_date ON jobs(date_found DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_starred ON jobs(starred)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_apps_job_id ON applications(job_id)")
            conn.commit()

    def add_job(self, job: dict) -> bool:
        # "INSERT OR IGNORE" is SQLite-only syntax — Postgres's equivalent is
        # "ON CONFLICT DO NOTHING". A bare ON CONFLICT (no target column) matches
        # SQLite's "ignore on any conflict" semantics exactly, since each table
        # here only has one relevant uniqueness constraint (jobs: PRIMARY KEY id
        # / UNIQUE url; applications: UNIQUE job_id).
        ignore_clause = "ON CONFLICT DO NOTHING" if _pg_pool else ""
        insert_or = "INSERT" if _pg_pool else "INSERT OR IGNORE"
        try:
            with self._get_conn() as conn:
                # RETURNING id gives us the row actually written — nothing comes
                # back when ON CONFLICT DO NOTHING / INSERT OR IGNORE skipped the
                # insert (same URL already scraped under a different generated
                # UUID by another source/run). Using job["id"] unconditionally
                # here used to violate applications_job_id_fkey for every such
                # duplicate, since that UUID was never actually in `jobs`.
                cursor = conn.execute(f"""
                    {insert_or} INTO jobs
                    (id, title, company, description, url, source, location, salary, date_found, tags, score, score_reason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    {ignore_clause}
                    RETURNING id
                """, (
                    job["id"], job["title"], job["company"], job.get("description", ""),
                    job["url"], job.get("source", ""), job.get("location", ""),
                    job.get("salary", ""), job.get("date_found", datetime.now().isoformat()),
                    json.dumps(job.get("tags", [])), job.get("score", 0), job.get("score_reason", "")
                ))
                row = cursor.fetchone()
                job_id = row[0] if row else None

                if job_id is None:
                    existing = conn.execute("SELECT id FROM jobs WHERE url = ?", (job["url"],)).fetchone()
                    if not existing:
                        return False
                    job_id = existing[0]

                conn.execute(f"""
                    {insert_or} INTO applications (id, job_id, status, last_updated)
                    VALUES (?, ?, 'found', ?)
                    {ignore_clause}
                """, (str(uuid.uuid4()), job_id, datetime.now().isoformat()))
                conn.commit()
            return True
        except Exception as e:
            console.print(f"[red]DB error adding job: {e}[/red]")
            return False

    def update_status(self, job_id: str, status: str, notes: str = "", cv_path: str = "", cover_path: str = ""):
        valid = {"found", "applied", "interviewing", "offer", "rejected", "ghosted", "skipped"}
        if status not in valid:
            console.print(f"[red]Invalid status. Choose from: {valid}[/red]")
            return
        with self._get_conn() as conn:
            now = datetime.now().isoformat()
            date_applied = now if status == "applied" else None
            conn.execute("""
                UPDATE applications SET status=?, notes=?, last_updated=?,
                cv_path=COALESCE(NULLIF(?, ''), cv_path),
                cover_letter_path=COALESCE(NULLIF(?, ''), cover_letter_path),
                date_applied=COALESCE(NULLIF(?, ''), date_applied)
                WHERE job_id=?
            """, (status, notes, now, cv_path, cover_path, date_applied or '', job_id))
            conn.commit()
        console.print(f"[green]Status updated to '{status}'[/green]")

    def toggle_star(self, job_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE jobs SET starred = 1 - COALESCE(starred, 0) WHERE id = ?",
                (job_id,)
            )
            conn.commit()
            row = conn.execute("SELECT starred FROM jobs WHERE id = ?", (job_id,)).fetchone()
            return bool(row[0]) if row else False

    # ── Training Sessions ──────────────────────────────────────────────────────

    def save_training_session(self, session_id: str, topic_key: str, topic_name: str,
                               messages: list, avg_score: float):
        now = datetime.now().isoformat()
        messages_json = json.dumps(messages)
        with self._get_conn() as conn:
            existing = conn.execute(
                "SELECT id FROM training_sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if existing:
                conn.execute("""
                    UPDATE training_sessions
                    SET topic_key=?, topic_name=?, messages=?, avg_score=?, last_updated=?
                    WHERE id=?
                """, (topic_key, topic_name, messages_json, avg_score, now, session_id))
            else:
                conn.execute("""
                    INSERT INTO training_sessions
                    (id, topic_key, topic_name, messages, avg_score, created_at, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (session_id, topic_key, topic_name, messages_json, avg_score, now, now))
            conn.commit()

    def get_training_session(self, session_id: str) -> dict | None:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM training_sessions WHERE id = ?", (session_id,)
            ).fetchone()
        if not row:
            return None
        result = dict(row)
        try:
            result['messages'] = json.loads(result['messages'] or '[]')
        except Exception:
            result['messages'] = []
        return result

    def get_training_progress(self) -> dict:
        with self._get_conn() as conn:
            count_row = conn.execute(
                "SELECT COUNT(DISTINCT id) FROM training_sessions"
            ).fetchone()
            sessions_completed = count_row[0] if count_row else 0

            if sessions_completed == 0:
                return {
                    'sessions_completed': 0,
                    'avg_score': 0,
                    'topics_covered': [],
                    'total_messages': 0,
                }

            avg_row = conn.execute(
                "SELECT AVG(avg_score) FROM training_sessions"
            ).fetchone()
            avg_score = round(avg_row[0], 1) if avg_row and avg_row[0] is not None else 0

            topic_rows = conn.execute(
                "SELECT DISTINCT topic_key FROM training_sessions WHERE topic_key IS NOT NULL"
            ).fetchall()
            topics_covered = [r[0] for r in topic_rows]

            msg_rows = conn.execute("SELECT messages FROM training_sessions").fetchall()
            total_messages = 0
            for (msg_json,) in msg_rows:
                try:
                    total_messages += len(json.loads(msg_json or '[]'))
                except Exception:
                    pass

        return {
            'sessions_completed': sessions_completed,
            'avg_score': avg_score,
            'topics_covered': topics_covered,
            'total_messages': total_messages,
        }

    # ── Company Blacklist ──────────────────────────────────────────────────────

    def toggle_blacklist(self, company: str) -> bool:
        """Adds company if not present, removes if present. Returns True if now blacklisted."""
        with self._get_conn() as conn:
            existing = conn.execute(
                "SELECT company FROM blacklisted_companies WHERE company = ?", (company,)
            ).fetchone()
            if existing:
                conn.execute(
                    "DELETE FROM blacklisted_companies WHERE company = ?", (company,)
                )
                conn.commit()
                return False
            else:
                conn.execute(
                    "INSERT INTO blacklisted_companies (company, blacklisted_at) VALUES (?, ?)",
                    (company, datetime.now().isoformat())
                )
                conn.commit()
                return True

    def get_blacklisted(self) -> list:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT company FROM blacklisted_companies ORDER BY company"
            ).fetchall()
        return [r[0] for r in rows]

    def is_blacklisted(self, company: str) -> bool:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT company FROM blacklisted_companies WHERE company = ?", (company,)
            ).fetchone()
        return row is not None

    # ── Interview Rounds ───────────────────────────────────────────────────────

    def add_interview_round(self, job_id: str, round_type: str,
                             scheduled_at: str = None, notes: str = None) -> dict:
        with self._get_conn() as conn:
            existing = conn.execute(
                "SELECT COUNT(*) FROM interview_rounds WHERE job_id = ?", (job_id,)
            ).fetchone()
            round_num = (existing[0] or 0) + 1
            round_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            conn.execute("""
                INSERT INTO interview_rounds
                (id, job_id, round_num, round_type, scheduled_at, result, notes, created_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
            """, (round_id, job_id, round_num, round_type, scheduled_at, notes, now))
            conn.commit()
        return {
            'id': round_id,
            'job_id': job_id,
            'round_num': round_num,
            'round_type': round_type,
            'scheduled_at': scheduled_at,
            'result': 'pending',
            'notes': notes,
            'created_at': now,
        }

    def update_interview_round(self, round_id: str, result: str = None,
                                notes: str = None, scheduled_at: str = None) -> dict:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM interview_rounds WHERE id = ?", (round_id,)
            ).fetchone()
            if not row:
                return {}
            current = dict(row)
            new_result = result if result is not None else current.get('result')
            new_notes = notes if notes is not None else current.get('notes')
            new_scheduled = scheduled_at if scheduled_at is not None else current.get('scheduled_at')
            conn.execute("""
                UPDATE interview_rounds
                SET result=?, notes=?, scheduled_at=?
                WHERE id=?
            """, (new_result, new_notes, new_scheduled, round_id))
            conn.commit()
            conn.row_factory = sqlite3.Row
            updated = conn.execute(
                "SELECT * FROM interview_rounds WHERE id = ?", (round_id,)
            ).fetchone()
        return dict(updated) if updated else {}

    def get_interview_rounds(self, job_id: str) -> list:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM interview_rounds WHERE job_id = ? ORDER BY round_num ASC",
                (job_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_interview_round(self, round_id: str):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM interview_rounds WHERE id = ?", (round_id,))
            conn.commit()

    def get_all_applications(self) -> list:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT j.id, j.title, j.company, j.url, j.source, j.location, j.salary,
                       j.date_found, j.score, j.score_reason, j.starred,
                       a.status, a.date_applied, a.notes, a.last_updated, a.cv_path, a.cover_letter_path
                FROM jobs j
                LEFT JOIN applications a ON j.id = a.job_id
                ORDER BY j.score DESC, a.last_updated DESC
            """).fetchall()
        return [dict(r) for r in rows]

    def get_unapplied_top_jobs(self, min_score: int = 60, limit: int = 10) -> list:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT j.*, a.status FROM jobs j
                LEFT JOIN applications a ON j.id = a.job_id
                WHERE (a.status = 'found' OR a.status IS NULL) AND j.score >= ?
                ORDER BY j.score DESC LIMIT ?
            """, (min_score, limit)).fetchall()
        return [dict(r) for r in rows]

    def get_stats(self) -> dict:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT status, COUNT(*) as count FROM applications GROUP BY status").fetchall()
            total = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        stats = {"total": total}
        for row in rows:
            stats[row[0]] = row[1]
        return stats

    def export_to_excel(self):
        apps = self.get_all_applications()
        stats = self.get_stats()

        wb = openpyxl.Workbook()

        # Sheet 1: Applications
        ws1 = wb.active
        ws1.title = "Applications"

        headers = ["#", "Title", "Company", "Status", "Score", "Source", "Location",
                   "Salary", "Date Found", "Date Applied", "Notes", "URL", "Score Reason"]
        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill("solid", fgColor="2E4057")

        for col, h in enumerate(headers, 1):
            cell = ws1.cell(row=1, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", wrap_text=True)

        for row_idx, app in enumerate(apps, 2):
            status = app.get("status", "found")
            fill_color = STATUS_COLORS.get(status, "FFFFFF")
            row_fill = PatternFill("solid", fgColor=fill_color)

            values = [
                row_idx - 1,
                app.get("title", ""),
                app.get("company", ""),
                status.upper(),
                app.get("score", 0),
                app.get("source", ""),
                app.get("location", ""),
                app.get("salary", ""),
                app.get("date_found", "")[:10] if app.get("date_found") else "",
                app.get("date_applied", "")[:10] if app.get("date_applied") else "",
                app.get("notes", ""),
                app.get("url", ""),
                app.get("score_reason", ""),
            ]
            for col, val in enumerate(values, 1):
                cell = ws1.cell(row=row_idx, column=col, value=val)
                cell.fill = row_fill
                cell.alignment = Alignment(wrap_text=True, vertical="top")

        # Auto-width
        col_widths = [5, 30, 20, 12, 8, 12, 15, 15, 12, 12, 25, 40, 30]
        for i, w in enumerate(col_widths, 1):
            ws1.column_dimensions[get_column_letter(i)].width = w

        ws1.freeze_panes = "A2"

        # Sheet 2: Stats
        ws2 = wb.create_sheet("Stats")
        ws2.append(["Metric", "Count"])
        ws2["A1"].font = Font(bold=True)
        ws2["B1"].font = Font(bold=True)
        ws2.append(["Total Jobs Found", stats.get("total", 0)])
        ws2.append(["Applied", stats.get("applied", 0)])
        ws2.append(["Interviewing", stats.get("interviewing", 0)])
        ws2.append(["Offers", stats.get("offer", 0)])
        ws2.append(["Rejected", stats.get("rejected", 0)])
        ws2.append(["Ghosted", stats.get("ghosted", 0)])
        ws2.append(["Not Yet Applied (found)", stats.get("found", 0)])
        ws2.column_dimensions["A"].width = 25
        ws2.column_dimensions["B"].width = 10

        # Sheet 3: High Priority
        ws3 = wb.create_sheet("High Priority")
        priority_headers = ["Title", "Company", "Score", "Location", "URL", "Reason"]
        for col, h in enumerate(priority_headers, 1):
            cell = ws3.cell(row=1, column=col, value=h)
            cell.font = Font(bold=True)

        priority_jobs = [a for a in apps if a.get("score", 0) >= 75 and a.get("status") == "found"]
        for row_idx, j in enumerate(priority_jobs, 2):
            ws3.cell(row=row_idx, column=1, value=j.get("title", ""))
            ws3.cell(row=row_idx, column=2, value=j.get("company", ""))
            ws3.cell(row=row_idx, column=3, value=j.get("score", 0))
            ws3.cell(row=row_idx, column=4, value=j.get("location", ""))
            ws3.cell(row=row_idx, column=5, value=j.get("url", ""))
            ws3.cell(row=row_idx, column=6, value=j.get("score_reason", ""))

        for col_dims in [("A", 30), ("B", 20), ("C", 8), ("D", 15), ("E", 40), ("F", 35)]:
            ws3.column_dimensions[col_dims[0]].width = col_dims[1]

        wb.save(self.excel_path)
        console.print(f"[green]Excel exported to: {self.excel_path}[/green]")
        return str(self.excel_path)

    def print_dashboard(self):
        stats = self.get_stats()
        top_jobs = self.get_unapplied_top_jobs(limit=10)

        # Stats table
        t = Table(title="[bold]Application Stats[/bold]", show_header=True)
        t.add_column("Status", style="bold")
        t.add_column("Count", justify="right")
        t.add_row("Total Found", str(stats.get("total", 0)))
        t.add_row("[blue]Applied[/blue]", str(stats.get("applied", 0)))
        t.add_row("[yellow]Interviewing[/yellow]", str(stats.get("interviewing", 0)))
        t.add_row("[green]Offers[/green]", str(stats.get("offer", 0)))
        t.add_row("[red]Rejected[/red]", str(stats.get("rejected", 0)))
        console.print(t)

        # Top unapplied jobs
        if top_jobs:
            t2 = Table(title="[bold]Top Jobs to Apply[/bold]", show_header=True)
            t2.add_column("Score", justify="right", style="green")
            t2.add_column("Title")
            t2.add_column("Company")
            t2.add_column("Location")
            t2.add_column("ID", style="dim")
            for j in top_jobs[:8]:
                t2.add_row(
                    str(j.get("score", 0)),
                    j.get("title", ""),
                    j.get("company", ""),
                    j.get("location", ""),
                    j.get("id", "")[:8] + "..."
                )
            console.print(t2)

    # ── Learning track (ROADMAP.md Learning Core Track — no new scope beyond
    # tracking status + an AI tutor chat per item; no PDF/book upload) ─────────

    def seed_learning_items(self, items: list):
        """Insert each seed item if it doesn't already exist — never overwrites
        a status the user has already set, safe to call on every startup."""
        now = datetime.now().isoformat()
        with self._get_conn() as conn:
            for item in items:
                if _pg_pool:
                    conn.execute("""
                        INSERT INTO learning_items (id, title, item_type, phase, order_index, status, updated_at)
                        VALUES (?, ?, ?, ?, ?, 'not_started', ?)
                        ON CONFLICT (id) DO NOTHING
                    """, (item["id"], item["title"], item["type"], item["phase"], item["order"], now))
                else:
                    conn.execute("""
                        INSERT OR IGNORE INTO learning_items (id, title, item_type, phase, order_index, status, updated_at)
                        VALUES (?, ?, ?, ?, ?, 'not_started', ?)
                    """, (item["id"], item["title"], item["type"], item["phase"], item["order"], now))
            conn.commit()

    def get_learning_items(self) -> list:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM learning_items ORDER BY phase ASC, order_index ASC"
            ).fetchall()
        return [dict(r) for r in rows]

    def update_learning_status(self, item_id: str, status: str, notes: str = "") -> bool:
        now = datetime.now().isoformat()
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE learning_items SET status=?, notes=?, updated_at=? WHERE id=?",
                (status, notes, now, item_id),
            )
            conn.commit()
        return True

    # ── Telegram inbound (message_id -> job_id, so a reply to a job alert can
    # be matched back to the job it's about) ──────────────────────────────────

    def record_telegram_alert(self, message_id: str, job_id: str):
        now = datetime.now().isoformat()
        with self._get_conn() as conn:
            if _pg_pool:
                conn.execute("""
                    INSERT INTO telegram_alerts (message_id, job_id, sent_at) VALUES (?, ?, ?)
                    ON CONFLICT (message_id) DO UPDATE SET job_id = EXCLUDED.job_id
                """, (str(message_id), job_id, now))
            else:
                conn.execute(
                    "INSERT OR REPLACE INTO telegram_alerts (message_id, job_id, sent_at) VALUES (?, ?, ?)",
                    (str(message_id), job_id, now),
                )
            conn.commit()

    def get_job_id_by_telegram_message(self, message_id: str) -> str | None:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT job_id FROM telegram_alerts WHERE message_id = ?", (str(message_id),)
            ).fetchone()
        if not row:
            return None
        return row[0] if not isinstance(row, dict) else row["job_id"]
