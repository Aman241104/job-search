"""Integration tests run against the real Postgres DB (DATABASE_URL) — this
project has no test-DB/mocking setup, matching its existing "no SQLite
fallback" architecture decision. Every fixture creates a synthetic user with
a randomized google_sub/email and tears it down via delete_account(), never
touching a real account."""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from agents.tracker import TrackerAgent


@pytest.fixture
def tracker():
    return TrackerAgent()


@pytest.fixture
def test_user(tracker):
    suffix = uuid.uuid4().hex[:12]
    user_id = tracker.get_or_create_user(
        google_sub=f"pytest-{suffix}",
        email=f"pytest-{suffix}@example.com",
        name="Pytest User",
        avatar_url="",
    )
    yield user_id
    tracker.delete_account(user_id)
