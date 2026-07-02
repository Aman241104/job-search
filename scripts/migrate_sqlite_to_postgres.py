"""
One-time data migration: copies every row from the existing SQLite file
(data/applications.db) into a Postgres database reachable via DATABASE_URL.

Run once, locally, after the Postgres schema has been created (TrackerAgent's
_init_db() creates the schema automatically — just instantiate a TrackerAgent
with DATABASE_URL set before running this script, or let this script do it).

Usage:
    DATABASE_URL="postgresql://...:6543/postgres" .venv/bin/python scripts/migrate_sqlite_to_postgres.py

This script is a throwaway — not imported by the app, not part of the ongoing
codebase, just a one-shot cutover tool.
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import config first — it calls load_dotenv(), which is what actually puts
# DATABASE_URL from .env into the process environment. Checking os.getenv()
# before this point always sees it as unset, even when it's in .env.
from config import DATA_DIR  # noqa: E402
import psycopg2  # noqa: E402
from pathlib import Path  # noqa: E402

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: set DATABASE_URL to the target Postgres connection string first.")
    sys.exit(1)

SQLITE_PATH = Path(DATA_DIR) / "applications.db"

TABLES = ["jobs", "applications", "training_sessions", "blacklisted_companies", "interview_rounds"]


def connect():
    return psycopg2.connect(DATABASE_URL)


def main():
    # Ensure the Postgres schema exists (same DDL the app runs on startup).
    from agents.tracker import TrackerAgent
    TrackerAgent()  # __init__ calls _init_db(), which is idempotent

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    pg_conn = connect()
    pg_cur = pg_conn.cursor()

    for table in TABLES:
        rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
        if not rows:
            print(f"{table}: 0 rows, skipping")
            continue
        cols = rows[0].keys()
        placeholders = ", ".join(["%s"] * len(cols))
        col_list = ", ".join(cols)
        sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
        count = 0
        skipped = 0
        i = 0
        while i < len(rows):
            row = rows[i]
            try:
                pg_cur.execute(sql, tuple(row[c] for c in cols))
                pg_conn.commit()  # per-row commit — a later row's rollback() must
                # not undo earlier successful inserts. A Postgres transaction is
                # poisoned in full by any error, so rollback() wipes everything
                # since the last commit, not just the failed statement.
                count += 1
                i += 1
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                # The pooled connection dropped mid-migration (observed in
                # practice against Supabase's transaction-mode pooler under
                # many sequential small transactions) — reconnect and retry
                # this same row rather than skipping or aborting.
                print(f"  connection dropped at row {i}/{len(rows)}, reconnecting...")
                try:
                    pg_cur.close()
                    pg_conn.close()
                except Exception:
                    pass
                pg_conn = connect()
                pg_cur = pg_conn.cursor()
                continue  # retry the same i
            except psycopg2.Error:
                # SQLite never enforced foreign keys, so a handful of rows here
                # can reference already-deleted parent rows (e.g. an application
                # whose job was removed). Postgres correctly rejects these —
                # skip them rather than aborting the whole migration.
                pg_conn.rollback()
                skipped += 1
                i += 1
        msg = f"{table}: migrated {count} rows"
        if skipped:
            msg += f" ({skipped} skipped — orphaned references not enforced under SQLite)"
        print(msg)

    sqlite_conn.close()
    pg_cur.close()
    pg_conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    main()
