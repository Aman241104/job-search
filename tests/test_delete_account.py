import uuid
from datetime import datetime


def _seed_rows(tracker, user_id):
    """Touches a representative table from each dependency layer
    delete_account() has to clear in order — the ones most likely to
    surface an FK-violation if a future edit reorders the DELETEs."""
    tracker.save_profile(user_id, {"name": "Pytest"})
    job_id = str(uuid.uuid4())
    tracker.add_job(user_id, {
        "id": job_id, "title": "Pytest Job", "company": "Pytest Co",
        "description": "", "url": f"https://example.com/{uuid.uuid4()}", "source": "test",
        "location": "", "salary": "", "date_found": datetime.now().isoformat(),
        "tags": "", "score": 50,
    })
    batch_id = tracker.create_batch(user_id, mode="review", channel="email")
    tracker.add_batch_item(batch_id, job_id, status="staged")

    playlist_id = str(uuid.uuid4())
    with tracker._get_conn() as conn:
        conn.execute(
            "INSERT INTO learning_playlists (id, user_id, url, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (playlist_id, user_id, "https://youtube.com/x", "Pytest Playlist", "ready", datetime.now().isoformat()),
        )
        video_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO learning_videos (id, playlist_id, video_id, title, url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (video_id, playlist_id, "vid123", "Pytest Video", "https://youtube.com/x/v", "done", datetime.now().isoformat()),
        )
        conn.execute(
            "INSERT INTO learning_video_chunks (id, video_id, playlist_id, chunk_index, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), video_id, playlist_id, 0, "chunk text", datetime.now().isoformat()),
        )
        conn.commit()
    return batch_id, playlist_id


def test_delete_account_removes_every_layer_with_no_fk_violation(tracker, test_user):
    batch_id, playlist_id = _seed_rows(tracker, test_user)

    # Sanity check the seed actually landed before deleting it.
    assert tracker.get_profile(test_user) is not None
    with tracker._get_conn() as conn:
        conn.row_factory = True
        assert conn.execute("SELECT COUNT(*) AS c FROM jobs WHERE user_id = ?", (test_user,)).fetchone()["c"] == 1
        assert conn.execute("SELECT COUNT(*) AS c FROM learning_video_chunks WHERE playlist_id = ?", (playlist_id,)).fetchone()["c"] == 1

    tracker.delete_account(test_user)  # must not raise (FK order correctness)

    assert tracker.get_user(test_user) is None
    assert tracker.get_profile(test_user) is None
    with tracker._get_conn() as conn:
        conn.row_factory = True
        assert conn.execute("SELECT COUNT(*) AS c FROM jobs WHERE user_id = ?", (test_user,)).fetchone()["c"] == 0
        assert conn.execute("SELECT COUNT(*) AS c FROM batches WHERE id = ?", (batch_id,)).fetchone()["c"] == 0
        assert conn.execute("SELECT COUNT(*) AS c FROM learning_playlists WHERE id = ?", (playlist_id,)).fetchone()["c"] == 0
        assert conn.execute("SELECT COUNT(*) AS c FROM learning_video_chunks WHERE playlist_id = ?", (playlist_id,)).fetchone()["c"] == 0


def test_delete_account_on_user_with_no_data_is_a_noop_not_an_error(tracker):
    bare_user = tracker.get_or_create_user(
        google_sub="pytest-bare-user", email="pytest-bare@example.com", name="Bare", avatar_url=""
    )
    tracker.delete_account(bare_user)  # must not raise even with zero rows anywhere
    assert tracker.get_user(bare_user) is None
