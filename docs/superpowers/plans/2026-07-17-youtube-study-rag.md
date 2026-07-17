# YouTube Study RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a YouTube playlist link into the dashboard, get per-video transcripts + AI-generated notes, and ask questions answered by real RAG (FAISS + NVIDIA bge-m3 embeddings) over the indexed content.

**Architecture:** `yt-dlp` lists playlist videos (no download) → `youtube-transcript-api` gets captions, falling back to local Whisper only when captions are unavailable → each transcript is summarized into notes via the existing `ask_ai()` and chunked/embedded into a combined FAISS index → questions are embedded, matched against the index, and answered by `ask_ai()` grounded in the retrieved chunks. Storage extends the existing `TrackerAgent` SQLite DB; the FAISS index is a sidecar file with a parallel JSON file recording chunk-id order (row position = FAISS row).

**Tech Stack:** FastAPI + `TrackerAgent` (SQLite) already in the repo; new: `youtube-transcript-api`, `yt-dlp`, `faiss-cpu`, `openai-whisper` (Python); Next.js/Tailwind frontend already in `web/`.

## Global Constraints

- Reuse `claude_client.ask_ai()` for all text generation (notes + Q&A) — do not add a second LLM call path.
- NVIDIA embeddings only — no new provider, no local embedding model.
- One combined FAISS index across all playlists (per project decision), not one index per playlist.
- Per-video ingest failures must never abort the rest of the playlist.
- No new env vars required — `NVIDIA_API_KEY` already exists in `.env`.
- Follow existing code style: lazy imports inside functions for heavy/optional dependencies (matches `agents/cloudinary_storage`, `pypdf`, `pytesseract` usage in `app.py`).

---

### Task 1: Dependencies

**Files:**
- Modify: `requirements.txt`
- Modify: `config.py`

**Interfaces:**
- Produces: `config.NVIDIA_EMBED_MODEL` (str) — used by Task 2.

- [ ] **Step 1: Add new dependencies to requirements.txt**

Append to the end of `requirements.txt`:

```
youtube-transcript-api>=0.6,<1.0
yt-dlp>=2024.1
faiss-cpu>=1.7
openai-whisper>=20231117
```

- [ ] **Step 2: Add the embedding model constant to config.py**

Add directly below the existing `NVIDIA_MODEL` line (config.py:31):

```python
NVIDIA_EMBED_MODEL = os.getenv("NVIDIA_EMBED_MODEL", "baai/bge-m3")
```

- [ ] **Step 3: Install and verify**

Run:
```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python -c "import youtube_transcript_api, yt_dlp, faiss, whisper; print('imports ok')"
ffmpeg -version
```
Expected: `imports ok` printed, and `ffmpeg -version` prints a version (needed for the Whisper fallback path — if missing, install it via the OS package manager before continuing; e.g. `sudo pacman -S ffmpeg` on Arch).

If `faiss-cpu` fails to install (no prebuilt wheel for this Python version), stop here and report the exact pip error before continuing — every later task depends on FAISS being importable.

- [ ] **Step 4: Commit**

```bash
git add requirements.txt config.py
git commit -m "Add deps for YouTube study RAG: yt-dlp, youtube-transcript-api, faiss-cpu, whisper"
```

---

### Task 2: NVIDIA embeddings client

**Files:**
- Modify: `claude_client.py`

**Interfaces:**
- Consumes: `config.NVIDIA_API_KEY` (str), `config.NVIDIA_EMBED_MODEL` (str) — from Task 1.
- Produces: `ask_nvidia_embedding(texts: list[str], input_type: str = "passage", retries: int = 2) -> list[list[float]]` — used by Task 6 and Task 7.

- [ ] **Step 1: Add the embedding function**

Add after the existing `_nvidia_cfg()` function (claude_client.py, right after line 25/26):

```python
def _nvidia_embed_cfg():
    from config import NVIDIA_API_KEY, NVIDIA_EMBED_MODEL
    return NVIDIA_API_KEY, NVIDIA_EMBED_MODEL


NVIDIA_EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings"


def ask_nvidia_embedding(texts: list, input_type: str = "passage", retries: int = 2) -> list:
    """
    Batch-embed a list of strings via NVIDIA NIM's bge-m3 embedding endpoint
    (OpenAI-compatible /v1/embeddings). bge-m3 is an asymmetric model — NIM
    requires input_type: "passage" when embedding content to index, "query"
    when embedding a search question. Returns [] on any failure (no key,
    network error, non-200) so callers can skip the batch rather than crash
    the whole ingest — same fail-open contract as ask_nvidia.
    """
    api_key, model = _nvidia_embed_cfg()
    if not api_key or not texts:
        return []

    body = {
        "input": texts,
        "model": model,
        "input_type": input_type,
        "encoding_format": "float",
        "truncate": "END",
    }

    for attempt in range(retries):
        try:
            resp = _requests.post(
                NVIDIA_EMBED_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=body,
                timeout=60,
            )
            if resp.status_code == 200:
                data = resp.json()
                return [item["embedding"] for item in data["data"]]
            if resp.status_code == 429 and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            break
        except Exception:
            if attempt < retries - 1:
                time.sleep(3)
            continue
    return []
```

- [ ] **Step 2: Live smoke check**

Run:
```bash
.venv/bin/python -c "
from claude_client import ask_nvidia_embedding
vecs = ask_nvidia_embedding(['hello world'], input_type='passage')
assert vecs and len(vecs[0]) > 0, 'embedding call failed or returned empty'
print('embedding dim:', len(vecs[0]))
"
```
Expected: `embedding dim: 1024`.

If this errors or returns `[]`, print the actual HTTP response (temporarily add `print(resp.status_code, resp.text)` before the `break` in the function) to see what NVIDIA's API actually rejected — field names for embedding NIMs have changed between model versions before (see the model-selection comment in `config.py:23-29`) — adjust `body` to match, then re-run this check before moving on. Every later task depends on this working.

- [ ] **Step 3: Commit**

```bash
git add claude_client.py
git commit -m "Add NVIDIA NIM embeddings client for study RAG"
```

---

### Task 3: Tracker schema and CRUD

**Files:**
- Modify: `agents/tracker.py`

**Interfaces:**
- Produces (all on `TrackerAgent`):
  - `add_playlist(url: str, title: str) -> str` (playlist_id)
  - `update_playlist_status(playlist_id: str, status: str) -> None`
  - `get_playlists() -> list[dict]`
  - `get_playlist(playlist_id: str) -> dict | None`
  - `add_video(playlist_id: str, video_id: str, title: str, url: str) -> str` (row id)
  - `update_video(row_id: str, **fields) -> None`
  - `get_videos_for_playlist(playlist_id: str) -> list[dict]`
  - `add_chunks(video_row_id: str, playlist_id: str, chunks: list[str]) -> list[str]` (chunk ids, same order as input)
  - `get_chunks_by_ids(chunk_ids: list[str]) -> dict[str, dict]` (each dict has `text`, `video_id`, `playlist_id`, `video_title`)

- [ ] **Step 1: Add the three tables to `_init_db`**

Insert right after the `batch_items` table block (agents/tracker.py, immediately before the closing of `_init_db`'s `with` block — find the line after the last `conn.execute(...)` for `batch_items` and insert here):

```python
            conn.execute("""
                CREATE TABLE IF NOT EXISTS learning_playlists (
                    id TEXT PRIMARY KEY,
                    url TEXT,
                    title TEXT,
                    status TEXT DEFAULT 'ingesting',
                    created_at TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS learning_videos (
                    id TEXT PRIMARY KEY,
                    playlist_id TEXT,
                    video_id TEXT,
                    title TEXT,
                    url TEXT,
                    transcript TEXT,
                    notes_md TEXT,
                    source TEXT,
                    status TEXT DEFAULT 'pending',
                    error TEXT,
                    created_at TEXT,
                    FOREIGN KEY (playlist_id) REFERENCES learning_playlists(id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS learning_video_chunks (
                    id TEXT PRIMARY KEY,
                    video_id TEXT,
                    playlist_id TEXT,
                    chunk_index INTEGER,
                    text TEXT,
                    created_at TEXT,
                    FOREIGN KEY (video_id) REFERENCES learning_videos(id)
                )
            """)
```

- [ ] **Step 2: Add the CRUD methods**

Add after `update_book_current_page` (agents/tracker.py, right before the `# ── Telegram inbound` comment at line 1012):

```python
    # ── YouTube playlist study RAG ──────────────────────────────────────────

    def add_playlist(self, url: str, title: str) -> str:
        playlist_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO learning_playlists (id, url, title, status, created_at) VALUES (?, ?, ?, 'ingesting', ?)",
                (playlist_id, url, title, now),
            )
            conn.commit()
        return playlist_id

    def update_playlist_status(self, playlist_id: str, status: str) -> None:
        with self._get_conn() as conn:
            conn.execute("UPDATE learning_playlists SET status = ? WHERE id = ?", (status, playlist_id))
            conn.commit()

    def get_playlists(self) -> list:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM learning_playlists ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]

    def get_playlist(self, playlist_id: str) -> dict | None:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM learning_playlists WHERE id = ?", (playlist_id,)).fetchone()
        return dict(row) if row else None

    def add_video(self, playlist_id: str, video_id: str, title: str, url: str) -> str:
        row_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO learning_videos (id, playlist_id, video_id, title, url, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, 'pending', ?)",
                (row_id, playlist_id, video_id, title, url, now),
            )
            conn.commit()
        return row_id

    def update_video(self, row_id: str, **fields) -> None:
        """fields: any of transcript, notes_md, source, status, error."""
        if not fields:
            return
        cols = ", ".join(f"{k} = ?" for k in fields)
        with self._get_conn() as conn:
            conn.execute(f"UPDATE learning_videos SET {cols} WHERE id = ?", (*fields.values(), row_id))
            conn.commit()

    def get_videos_for_playlist(self, playlist_id: str) -> list:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM learning_videos WHERE playlist_id = ? ORDER BY created_at", (playlist_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    def add_chunks(self, video_row_id: str, playlist_id: str, chunks: list) -> list:
        """chunks: list of chunk text strings. Returns the generated chunk ids,
        in the same order — callers need this order to line up with FAISS rows."""
        ids = [str(uuid.uuid4()) for _ in chunks]
        now = datetime.now().isoformat()
        with self._get_conn() as conn:
            for i, (chunk_id, text) in enumerate(zip(ids, chunks)):
                conn.execute(
                    "INSERT INTO learning_video_chunks (id, video_id, playlist_id, chunk_index, text, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (chunk_id, video_row_id, playlist_id, i, text, now),
                )
            conn.commit()
        return ids

    def get_chunks_by_ids(self, chunk_ids: list) -> dict:
        """Returns {chunk_id: {"text":..., "video_id":..., "playlist_id":..., "video_title":...}}."""
        if not chunk_ids:
            return {}
        placeholders = ",".join("?" for _ in chunk_ids)
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                f"""SELECT c.id, c.text, c.video_id, c.playlist_id, v.title AS video_title
                    FROM learning_video_chunks c
                    JOIN learning_videos v ON v.id = c.video_id
                    WHERE c.id IN ({placeholders})""",
                chunk_ids,
            ).fetchall()
        return {r["id"]: dict(r) for r in rows}
```

- [ ] **Step 3: Runnable check**

Run:
```bash
.venv/bin/python -c "
from agents.tracker import TrackerAgent
t = TrackerAgent()
pid = t.add_playlist('https://youtube.com/test', 'Test Playlist')
vid = t.add_video(pid, 'yt123', 'Test Video', 'https://youtube.com/watch?v=yt123')
t.update_video(vid, transcript='hello world', notes_md='# notes', status='done', source='captions')
chunk_ids = t.add_chunks(vid, pid, ['chunk one text', 'chunk two text'])
assert len(chunk_ids) == 2
fetched = t.get_chunks_by_ids(chunk_ids)
assert fetched[chunk_ids[0]]['text'] == 'chunk one text'
assert fetched[chunk_ids[0]]['video_title'] == 'Test Video'
assert any(p['id'] == pid for p in t.get_playlists())
videos = t.get_videos_for_playlist(pid)
assert len(videos) == 1 and videos[0]['status'] == 'done'
with t._get_conn() as conn:
    conn.execute('DELETE FROM learning_video_chunks WHERE playlist_id = ?', (pid,))
    conn.execute('DELETE FROM learning_videos WHERE playlist_id = ?', (pid,))
    conn.execute('DELETE FROM learning_playlists WHERE id = ?', (pid,))
    conn.commit()
print('tracker check passed')
"
```
Expected: `tracker check passed` (the script cleans up its own test rows — no leftover data).

- [ ] **Step 4: Commit**

```bash
git add agents/tracker.py
git commit -m "Add playlist/video/chunk schema and CRUD to TrackerAgent"
```

---

### Task 4: Chunking and FAISS index helpers

**Files:**
- Create: `agents/study_agent.py`

**Interfaces:**
- Produces: `_chunk_text(text: str, chunk_words=500, overlap_words=50) -> list[str]`, `_add_to_index(chunk_ids: list[str], vectors: list[list[float]]) -> None`, `_search_index(query_vector: list[float], k: int = 5) -> list[tuple[str, float]]` — all used by Task 6/7.

- [ ] **Step 1: Write the module with chunking, index helpers, and an offline self-check**

```python
import os
import sys
import json

import numpy as np
import faiss

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATA_DIR

INDEX_PATH = os.path.join(DATA_DIR, "study_index.faiss")
ORDER_PATH = os.path.join(DATA_DIR, "study_index_order.json")
EMBED_DIM = 1024  # bge-m3 dense embedding size


def _chunk_text(text: str, chunk_words: int = 500, overlap_words: int = 50) -> list:
    """Word-based chunking with overlap. Returns [] for blank/whitespace-only text."""
    words = text.split()
    if not words:
        return []
    step = chunk_words - overlap_words
    chunks = []
    for start in range(0, len(words), step):
        chunk = " ".join(words[start:start + chunk_words])
        if chunk.strip():
            chunks.append(chunk)
        if start + chunk_words >= len(words):
            break
    return chunks


def _normalize(vecs: np.ndarray) -> np.ndarray:
    """L2-normalize rows so inner product == cosine similarity."""
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return vecs / norms


def _load_index():
    """Returns (faiss.Index, order: list[str] of chunk_id per row)."""
    if os.path.exists(INDEX_PATH) and os.path.exists(ORDER_PATH):
        index = faiss.read_index(INDEX_PATH)
        with open(ORDER_PATH) as f:
            order = json.load(f)
        return index, order
    return faiss.IndexFlatIP(EMBED_DIM), []


def _save_index(index, order: list) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    faiss.write_index(index, INDEX_PATH)
    with open(ORDER_PATH, "w") as f:
        json.dump(order, f)


def _add_to_index(chunk_ids: list, vectors: list) -> None:
    """Appends new chunk vectors to the on-disk index and saves it."""
    if not chunk_ids or not vectors:
        return
    index, order = _load_index()
    arr = _normalize(np.array(vectors, dtype="float32"))
    index.add(arr)
    order.extend(chunk_ids)
    _save_index(index, order)


def _search_index(query_vector: list, k: int = 5) -> list:
    """Returns [(chunk_id, score), ...] for the k nearest chunks, best first."""
    index, order = _load_index()
    if index.ntotal == 0:
        return []
    q = _normalize(np.array([query_vector], dtype="float32"))
    scores, positions = index.search(q, min(k, index.ntotal))
    results = []
    for pos, score in zip(positions[0], scores[0]):
        if pos == -1:
            continue
        results.append((order[pos], float(score)))
    return results


if __name__ == "__main__":
    # Offline self-check: no network, deterministic vectors — verifies
    # chunking + index add/search wiring independent of YouTube/NVIDIA.
    assert _chunk_text("") == []
    words = " ".join(f"w{i}" for i in range(1200))
    chunks = _chunk_text(words, chunk_words=500, overlap_words=50)
    assert len(chunks) == 3, f"expected 3 chunks, got {len(chunks)}"
    assert chunks[0].split()[0] == "w0"
    assert chunks[1].split()[0] == "w450"  # step = 500 - 50 = 450

    import tempfile
    tmp_dir = tempfile.mkdtemp()
    INDEX_PATH = os.path.join(tmp_dir, "test.faiss")
    ORDER_PATH = os.path.join(tmp_dir, "test_order.json")

    vecs = [
        [1.0] + [0.0] * (EMBED_DIM - 1),
        [0.0, 1.0] + [0.0] * (EMBED_DIM - 2),
        [0.0, 0.0, 1.0] + [0.0] * (EMBED_DIM - 3),
    ]
    _add_to_index(["chunk-a", "chunk-b", "chunk-c"], vecs)
    query = [0.0, 0.99] + [0.0] * (EMBED_DIM - 2)
    results = _search_index(query, k=1)
    assert results[0][0] == "chunk-b", f"expected chunk-b nearest, got {results}"
    print("study_agent self-check passed")
```

- [ ] **Step 2: Run the self-check**

```bash
.venv/bin/python agents/study_agent.py
```
Expected: `study_agent self-check passed`

- [ ] **Step 3: Commit**

```bash
git add agents/study_agent.py
git commit -m "Add chunking and FAISS index helpers for study RAG"
```

---

### Task 5: Transcript fetching (captions + Whisper fallback)

**Files:**
- Modify: `agents/study_agent.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `_get_transcript(video_id: str) -> tuple[str, str, str]` (text, source, error) — used by Task 6.

- [ ] **Step 1: Add the transcript functions**

Insert into `agents/study_agent.py`, directly before the `if __name__ == "__main__":` line:

```python
def _get_transcript(video_id: str) -> tuple:
    """Returns (text, source, error). source is 'captions' or 'whisper';
    text is '' and error is set if both methods fail."""
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

    try:
        segments = YouTubeTranscriptApi().fetch(video_id)
        text = " ".join(s.text for s in segments)
        if text.strip():
            return text, "captions", ""
    except (TranscriptsDisabled, NoTranscriptFound):
        pass
    except Exception:
        pass  # any other captions-fetch error also falls through to Whisper

    try:
        return _whisper_transcribe(video_id)
    except Exception as e:
        return "", "", f"captions unavailable and Whisper fallback failed: {e}"


def _whisper_transcribe(video_id: str) -> tuple:
    import tempfile
    import whisper
    import yt_dlp

    with tempfile.TemporaryDirectory() as tmp:
        audio_path = os.path.join(tmp, f"{video_id}.mp3")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(tmp, video_id),
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}],
            "quiet": True,
            "noplaylist": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
        model = whisper.load_model("base")
        result = model.transcribe(audio_path)
        return result["text"], "whisper", ""
```

- [ ] **Step 2: Verify against a real video with captions**

```bash
.venv/bin/python -c "
from agents.study_agent import _get_transcript
text, source, error = _get_transcript('dQw4w9WgXcQ')
print('source:', source, '| chars:', len(text), '| error:', error)
"
```
Expected: `source: captions | chars: <a positive number> | error: `

If this errors out (e.g. `AttributeError` on `.text`, or `YouTubeTranscriptApi()` doesn't accept no-arg construction), the installed `youtube-transcript-api` version's API differs from what's assumed here — run `.venv/bin/pip show youtube-transcript-api` to check the version and adjust the `_get_transcript` call to match that version's actual interface (older versions use the classmethod `YouTubeTranscriptApi.get_transcript(video_id)` returning `list[dict]` with `["text"]` keys instead of objects with `.text`). Re-run this check until it passes before continuing — Task 6 depends on this working.

- [ ] **Step 3: Commit**

```bash
git add agents/study_agent.py
git commit -m "Add YouTube transcript fetching with captions-first, Whisper-fallback"
```

---

### Task 6: Playlist listing, notes generation, and ingest orchestration

**Files:**
- Modify: `agents/study_agent.py`

**Interfaces:**
- Consumes: `TrackerAgent` (Task 3), `_chunk_text`/`_add_to_index` (Task 4), `_get_transcript` (Task 5), `claude_client.ask_ai`, `claude_client.ask_nvidia_embedding` (Task 2).
- Produces: `_list_playlist_videos(playlist_url: str) -> tuple[list[dict], str]`, `StudyAgent.start_playlist(url: str) -> str` (playlist_id), `StudyAgent.process_playlist(playlist_id: str) -> None` — used by Task 8 (routes) and Task 7 (ask, same class).

- [ ] **Step 1: Add playlist listing and the StudyAgent ingest methods**

Insert into `agents/study_agent.py`, directly before the `if __name__ == "__main__":` line:

```python
def _list_playlist_videos(playlist_url: str) -> tuple:
    """Returns ([{"video_id":..., "title":..., "url":...}, ...], playlist_title).
    Uses yt-dlp's flat extraction — lists videos without downloading anything."""
    import yt_dlp

    ydl_opts = {"extract_flat": True, "quiet": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(playlist_url, download=False)
    entries = info.get("entries") or [info]  # a single-video URL falls back to itself
    videos = []
    for e in entries:
        if not e:
            continue
        vid = e.get("id")
        videos.append({
            "video_id": vid,
            "title": e.get("title") or vid,
            "url": f"https://www.youtube.com/watch?v={vid}",
        })
    return videos, info.get("title") or "Untitled playlist"


class StudyAgent:
    def __init__(self):
        from agents.tracker import TrackerAgent
        self.tracker = TrackerAgent()

    def start_playlist(self, url: str) -> str:
        """Fast step: list videos (no download), create the playlist + pending
        video rows, return immediately. Heavy work happens in process_playlist."""
        videos_meta, playlist_title = _list_playlist_videos(url)
        playlist_id = self.tracker.add_playlist(url, playlist_title)
        for v in videos_meta:
            self.tracker.add_video(playlist_id, v["video_id"], v["title"], v["url"])
        return playlist_id

    def process_playlist(self, playlist_id: str) -> None:
        """Slow step: transcribe, generate notes, chunk, and embed every
        pending video in this playlist. One video's failure never stops the
        rest of the playlist."""
        from claude_client import ask_ai, ask_nvidia_embedding

        for v in self.tracker.get_videos_for_playlist(playlist_id):
            if v["status"] != "pending":
                continue
            row_id = v["id"]
            try:
                self.tracker.update_video(row_id, status="transcribing")
                text, source, error = _get_transcript(v["video_id"])
                if not text:
                    self.tracker.update_video(row_id, status="failed", error=error or "empty transcript")
                    continue

                notes = ask_ai(
                    "Turn this video transcript into structured study notes (markdown, headings + "
                    f"bullet points, grounded only in the transcript, no invented facts):\n\n{text[:12000]}",
                    max_tokens=1200,
                )
                self.tracker.update_video(
                    row_id, transcript=text, notes_md=notes or "", source=source, status="embedding"
                )

                chunks = _chunk_text(text)
                if chunks:
                    chunk_ids = self.tracker.add_chunks(row_id, playlist_id, chunks)
                    vectors = ask_nvidia_embedding(chunks, input_type="passage")
                    if vectors and len(vectors) == len(chunk_ids):
                        _add_to_index(chunk_ids, vectors)

                self.tracker.update_video(row_id, status="done")
            except Exception as e:
                self.tracker.update_video(row_id, status="failed", error=str(e))

        self.tracker.update_playlist_status(playlist_id, "done")
```

- [ ] **Step 2: Verify end-to-end against a real, short playlist**

Substitute a real 2-3 video YouTube playlist URL you have access to:

```bash
.venv/bin/python -c "
from agents.study_agent import StudyAgent
agent = StudyAgent()
pid = agent.start_playlist('<a real 2-3 video playlist URL>')
agent.process_playlist(pid)
videos = agent.tracker.get_videos_for_playlist(pid)
for v in videos:
    print(v['title'], '|', v['status'], '|', v.get('source'), '|', (v.get('error') or '')[:80])
"
```
Expected: every video shows `status=done` (or `failed` with a readable `error` for a specific broken video, e.g. captions off + no ffmpeg installed) — not an unhandled traceback.

- [ ] **Step 3: Commit**

```bash
git add agents/study_agent.py
git commit -m "Add playlist ingest orchestration: notes generation + chunk/embed pipeline"
```

---

### Task 7: RAG query

**Files:**
- Modify: `agents/study_agent.py`

**Interfaces:**
- Consumes: `_search_index` (Task 4), `TrackerAgent.get_chunks_by_ids` (Task 3), `claude_client.ask_ai`/`ask_nvidia_embedding` (Task 2).
- Produces: `StudyAgent.ask(question: str, playlist_id: str = None, k: int = 5) -> dict` (`{"answer": str, "sources": list[str]}`) — used by Task 8.

- [ ] **Step 1: Add the `ask` method to `StudyAgent`**

Add as a method on the `StudyAgent` class (after `process_playlist`, still before `if __name__ == "__main__":`):

```python
    def ask(self, question: str, playlist_id: str = None, k: int = 5) -> dict:
        from claude_client import ask_ai, ask_nvidia_embedding

        vectors = ask_nvidia_embedding([question], input_type="query")
        if not vectors:
            return {"answer": "Embedding service unavailable — try again shortly.", "sources": []}

        raw_results = _search_index(vectors[0], k=k * 4 if playlist_id else k)
        chunk_ids = [cid for cid, _ in raw_results]
        chunk_map = self.tracker.get_chunks_by_ids(chunk_ids)

        if playlist_id:
            chunk_ids = [cid for cid in chunk_ids if chunk_map.get(cid, {}).get("playlist_id") == playlist_id][:k]

        if not chunk_ids:
            return {"answer": "No indexed content matches this question yet.", "sources": []}

        context_parts = []
        sources = []
        for cid in chunk_ids:
            c = chunk_map[cid]
            context_parts.append(f"[{c['video_title']}]: {c['text']}")
            if c["video_title"] not in sources:
                sources.append(c["video_title"])

        context = "\n\n".join(context_parts)
        prompt = (
            "Answer the question using ONLY the context below. If the answer isn't in the "
            f"context, say so.\n\nContext:\n{context}\n\nQuestion: {question}"
        )
        answer = ask_ai(prompt, max_tokens=600)
        return {"answer": answer or "No answer generated.", "sources": sources}
```

- [ ] **Step 2: Verify against the playlist ingested in Task 6**

```bash
.venv/bin/python -c "
from agents.study_agent import StudyAgent
agent = StudyAgent()
result = agent.ask('What is this video about?')
print(result)
"
```
Expected: a non-empty `answer` string, and `sources` containing one of the real video titles ingested in Task 6.

- [ ] **Step 3: Commit**

```bash
git add agents/study_agent.py
git commit -m "Add RAG question-answering to StudyAgent"
```

---

### Task 8: FastAPI routes

**Files:**
- Modify: `app.py`

**Interfaces:**
- Consumes: `StudyAgent.start_playlist`/`process_playlist`/`ask` (Tasks 6-7), `TrackerAgent.get_playlists`/`get_playlist`/`get_videos_for_playlist` (Task 3).
- Produces: `POST /api/learning/playlists/ingest`, `GET /api/learning/playlists`, `GET /api/learning/playlists/{playlist_id}`, `POST /api/learning/playlists/ask` — used by Task 9 (frontend).

- [ ] **Step 1: Add `BackgroundTasks` to the fastapi import**

Change app.py line 12 from:
```python
from fastapi import FastAPI, Query, Request, UploadFile, File
```
to:
```python
from fastapi import FastAPI, Query, Request, UploadFile, File, BackgroundTasks
```

- [ ] **Step 2: Add the routes**

Insert after the `book_chat` route (app.py, right after line 1129/1130, before the `# ── Interview Story Bank` comment):

```python
# ── YouTube playlist study RAG — paste a playlist link, get transcripts +
# AI notes per video, and ask questions answered by RAG over the indexed
# transcripts. Ingest is split into a fast synchronous step (list videos,
# create rows) so the request returns immediately, and a BackgroundTasks
# step that does the slow transcribe/embed work; the frontend polls
# GET .../{playlist_id} for per-video progress. ─────────────────────────────

@app.post('/api/learning/playlists/ingest')
async def ingest_playlist(background_tasks: BackgroundTasks, url: str = Query(...)):
    from agents.study_agent import StudyAgent
    agent = StudyAgent()
    loop = asyncio.get_event_loop()
    playlist_id = await loop.run_in_executor(None, lambda: agent.start_playlist(url))
    background_tasks.add_task(agent.process_playlist, playlist_id)
    return {'ok': True, 'playlist_id': playlist_id}


@app.get('/api/learning/playlists')
async def list_playlists():
    return TrackerAgent().get_playlists()


@app.get('/api/learning/playlists/{playlist_id}')
async def get_playlist_detail(playlist_id: str):
    tracker = TrackerAgent()
    playlist = tracker.get_playlist(playlist_id)
    if not playlist:
        return JSONResponse({'error': 'Playlist not found'}, status_code=404)
    playlist['videos'] = tracker.get_videos_for_playlist(playlist_id)
    return playlist


@app.post('/api/learning/playlists/ask')
async def ask_playlists(question: str = Query(...), playlist_id: str = Query(default=None)):
    if not question:
        return JSONResponse({'error': 'question is required'}, status_code=400)
    from agents.study_agent import StudyAgent
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: StudyAgent().ask(question, playlist_id))
    return result
```

- [ ] **Step 3: Verify with the dev server**

```bash
.venv/bin/python app.py &
sleep 2
curl -s -X POST "http://localhost:8000/api/learning/playlists/ingest?url=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "<a real playlist URL>")"
sleep 15
curl -s http://localhost:8000/api/learning/playlists
curl -s -X POST "http://localhost:8000/api/learning/playlists/ask?question=$(python3 -c "import urllib.parse;print(urllib.parse.quote('what is this about'))")"
kill %1
```
Expected: the ingest call returns `{"ok": true, "playlist_id": "..."}` immediately (not after waiting for transcription); the playlists list shows the new playlist; the ask call returns an `answer`/`sources` JSON body once ingestion has had time to finish.

- [ ] **Step 4: Commit**

```bash
git add app.py
git commit -m "Add playlist ingest/list/detail/ask routes for study RAG"
```

---

### Task 9: Frontend API client

**Files:**
- Modify: `web/lib/api.ts`

**Interfaces:**
- Produces: `StudyVideo`, `StudyPlaylist` types; `api.ingestPlaylist`, `api.listPlaylists`, `api.getPlaylist`, `api.askPlaylists` — used by Task 10.

- [ ] **Step 1: Add the types**

Add after the `Story` interface (web/lib/api.ts, after line 137):

```typescript
export interface StudyVideo {
  id: string;
  playlist_id: string;
  video_id: string;
  title: string;
  url: string;
  transcript?: string;
  notes_md?: string;
  source?: string;
  status: 'pending' | 'transcribing' | 'embedding' | 'done' | 'failed';
  error?: string;
  created_at: string;
}

export interface StudyPlaylist {
  id: string;
  url: string;
  title: string;
  status: string;
  created_at: string;
  videos?: StudyVideo[];
}
```

- [ ] **Step 2: Add the API calls**

Add after the `bookChat` entry (web/lib/api.ts, after line 357, still inside the `export const api = { ... }` object):

```typescript
  ingestPlaylist: (url: string): Promise<{ ok: boolean; playlist_id: string }> =>
    fetch(`${API}/api/learning/playlists/ingest?url=${encodeURIComponent(url)}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Playlist ingest failed: ${r.status}`);
      return r.json();
    }),

  listPlaylists: (): Promise<StudyPlaylist[]> =>
    fetch(`${API}/api/learning/playlists`).then((r) => {
      if (!r.ok) throw new Error(`List playlists failed: ${r.status}`);
      return r.json();
    }),

  getPlaylist: (id: string): Promise<StudyPlaylist> =>
    fetch(`${API}/api/learning/playlists/${id}`).then((r) => {
      if (!r.ok) throw new Error(`Get playlist failed: ${r.status}`);
      return r.json();
    }),

  askPlaylists: (question: string, playlistId?: string): Promise<{ answer: string; sources: string[] }> =>
    fetch(
      `${API}/api/learning/playlists/ask?question=${encodeURIComponent(question)}` +
        (playlistId ? `&playlist_id=${playlistId}` : ''),
      { method: 'POST' }
    ).then((r) => {
      if (!r.ok) throw new Error(`Ask failed: ${r.status}`);
      return r.json();
    }),
```

- [ ] **Step 3: Verify it type-checks**

```bash
cd web && npx tsc --noEmit
```
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/api.ts
git commit -m "Add frontend API client for playlist study RAG"
```

---

### Task 10: Frontend Playlists tab

**Files:**
- Create: `web/components/PlaylistPanel.tsx`
- Modify: `web/app/learning/page.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `api.ingestPlaylist`/`listPlaylists`/`getPlaylist`/`askPlaylists`, `StudyPlaylist`, `StudyVideo` (Task 9).

- [ ] **Step 1: Create the PlaylistPanel component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { YoutubeLogo, Plus, CircleNotch, CheckCircle, XCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { api, StudyPlaylist, StudyVideo } from '@/lib/api';
import { useToast } from './Toast';

function StatusBadge({ status }: { status: StudyVideo['status'] }) {
  if (status === 'done') return <CheckCircle size={14} className="text-accent-green" />;
  if (status === 'failed') return <XCircle size={14} className="text-red-400" />;
  return <CircleNotch size={14} className="animate-spin text-white/40" />;
}

export default function PlaylistPanel() {
  const [playlists, setPlaylists] = useState<StudyPlaylist[]>([]);
  const [selected, setSelected] = useState<StudyPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ answer: string; sources: string[] } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const load = async () => {
    try {
      const data = await api.listPlaylists();
      setPlaylists(data);
      setSelected((prev) => prev ?? (data.length > 0 ? data[0] : null));
    } catch {
      toast('Failed to load playlists', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selected) return;

    const refresh = async () => {
      try {
        const detail = await api.getPlaylist(selected.id);
        setSelected(detail);
        setPlaylists((prev) => prev.map((p) => (p.id === detail.id ? detail : p)));
        const stillWorking = detail.videos?.some(
          (v) => v.status === 'pending' || v.status === 'transcribing' || v.status === 'embedding'
        );
        if (!stillWorking && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // transient poll failure — try again next tick
      }
    };

    refresh();
    pollRef.current = setInterval(refresh, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const handleIngest = async () => {
    if (!urlInput.trim() || ingesting) return;
    setIngesting(true);
    try {
      const res = await api.ingestPlaylist(urlInput.trim());
      setUrlInput('');
      toast('Playlist queued — transcribing in the background', 'success');
      await load();
      const detail = await api.getPlaylist(res.playlist_id);
      setSelected(detail);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ingest failed', 'error');
    } finally {
      setIngesting(false);
    }
  };

  const handleAsk = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await api.askPlaylists(question.trim(), selected?.id);
      setAnswer(res);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ask failed', 'error');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0">
      <div className="md:w-80 xl:w-96 border-r border-border flex-shrink-0 overflow-y-auto p-4">
        <div className="mb-5 flex items-center gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleIngest()}
            placeholder="Paste a YouTube playlist link..."
            disabled={ingesting}
            className="flex-1 bg-bg-2 border border-border rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/25"
          />
          <button
            onClick={handleIngest}
            disabled={ingesting || !urlInput.trim()}
            className="p-2 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green disabled:opacity-40"
          >
            {ingesting ? <CircleNotch size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : playlists.length === 0 ? (
          <p className="text-xs text-white/25 text-center px-4 py-6">No playlists yet — paste a link to get started.</p>
        ) : (
          <div className="space-y-1.5">
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={clsx(
                  'w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150',
                  selected?.id === p.id
                    ? 'bg-accent-green/10 border-accent-green/25 text-white/90'
                    : 'bg-bg-2 border-border text-white/60 hover:border-white/10 hover:text-white/80'
                )}
              >
                <YoutubeLogo size={18} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium leading-tight line-clamp-2">{p.title}</span>
                  <p className="text-xs text-white/30 mt-0.5 capitalize">{p.status}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 min-h-[500px]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <p className="text-white/40 text-sm">Select a playlist or paste a link to start</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-border flex-shrink-0">
              <h3 className="font-semibold text-white/90 text-sm">{selected.title}</h3>
              <p className="text-xs text-white/35">{selected.videos?.length ?? 0} videos</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="space-y-2">
                {(selected.videos ?? []).map((v) => (
                  <div key={v.id} className="bg-bg-3 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white/80 leading-tight">{v.title}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    {v.status === 'failed' && v.error && (
                      <p className="text-xs text-red-400/80 mt-1">{v.error}</p>
                    )}
                    {v.notes_md && (
                      <details className="mt-2">
                        <summary className="text-xs text-accent-green cursor-pointer">Notes</summary>
                        <div className="text-xs text-white/60 mt-2 whitespace-pre-wrap">{v.notes_md}</div>
                      </details>
                    )}
                  </div>
                ))}
              </div>

              {answer && (
                <div className="bg-accent-purple/10 border border-accent-purple/25 rounded-xl px-4 py-3">
                  <p className="text-sm text-white/80 whitespace-pre-wrap">{answer.answer}</p>
                  {answer.sources.length > 0 && (
                    <p className="text-[10px] text-white/35 mt-2">Sources: {answer.sources.join(', ')}</p>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border flex-shrink-0">
              <div className="flex items-center gap-3 bg-bg-3 border border-border rounded-xl px-4 py-2.5">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                  disabled={asking}
                  placeholder="Ask a question about this playlist..."
                  className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 disabled:opacity-50"
                />
                <button
                  onClick={handleAsk}
                  disabled={asking || !question.trim()}
                  className="text-accent-green disabled:text-white/20 transition-colors hover:text-accent-green/80 p-1"
                >
                  {asking ? <CircleNotch size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the third tab into learning/page.tsx**

Change the `Tab` type (web/app/learning/page.tsx:14) from:
```typescript
type Tab = 'skills' | 'books';
```
to:
```typescript
type Tab = 'skills' | 'books' | 'playlists';
```

Add the import (after line 9, `import { ToastProvider, useToast } from '@/components/Toast';`):
```typescript
import PlaylistPanel from '@/components/PlaylistPanel';
```

Add the third tab button, after the "Books & PDFs" button (web/app/learning/page.tsx:211-222), inside the same `<div className="flex items-center gap-2 mt-4">` block:
```tsx
          <button
            onClick={() => setTab('playlists')}
            className={clsx(
              'text-xs font-semibold px-4 py-2 rounded-lg border transition-all',
              tab === 'playlists'
                ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                : 'border-border text-white/40 hover:text-white/70'
            )}
          >
            Playlists
          </button>
```

Change the render ternary (web/app/learning/page.tsx:225, `{tab === 'skills' ? (`) so the final `) : (` branch (currently the Books & PDFs panel, ending at line 322 `)}`) becomes a three-way branch. Replace:
```tsx
      {tab === 'skills' ? (
```
with:
```tsx
      {tab === 'skills' ? (
```
(unchanged — the skills branch stays as-is), then replace the line that closes the skills branch and opens the books branch (web/app/learning/page.tsx:267):
```tsx
      ) : (
```
with:
```tsx
      ) : tab === 'books' ? (
```
and replace the final closing of the books branch (web/app/learning/page.tsx:322-323):
```tsx
      )}
    </div>
  );
}
```
with:
```tsx
      ) : (
        <PlaylistPanel />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify visually**

```bash
cd web && npm run dev
```
Open `http://localhost:3000/learning`, click the "Playlists" tab, paste a real playlist URL, confirm: the tab renders, ingestion kicks off without the page hanging, the video list appears with progress badges that update every ~4s, and asking a question returns an answer with sources once at least one video is `done`.

- [ ] **Step 4: Document the feature in CLAUDE.md**

Add a new subsection under `## Agent Details` in `CLAUDE.md`, after the `### JobApplierAgent` section:

```markdown
### StudyAgent (agents/study_agent.py)
- Paste a YouTube playlist link in the dashboard's Learning > Playlists tab
- `yt-dlp` lists videos, `youtube-transcript-api` gets captions (Whisper fallback if captions are off — needs `ffmpeg` installed)
- Each video's transcript is summarized into notes via `ask_ai()` and chunked/embedded (NVIDIA `bge-m3`) into a combined FAISS index (`data/study_index.faiss`)
- Questions are answered by RAG: embed the question, retrieve top-k chunks, ground `ask_ai()`'s answer in them
- No CLI command — web dashboard only (`POST /api/learning/playlists/ingest`, `GET /api/learning/playlists[/{id}]`, `POST /api/learning/playlists/ask`)
```

- [ ] **Step 5: Commit**

```bash
git add web/components/PlaylistPanel.tsx web/app/learning/page.tsx CLAUDE.md
git commit -m "Add Playlists tab: paste-link ingest, per-video progress, notes, RAG ask box"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-17-youtube-study-rag-design.md` maps to a task — ingest pipeline (Tasks 4-6), query pipeline (Task 7), storage (Task 3), new code list (Tasks 2-3, 6-7 for `study_agent.py`, Task 8 for routes, Tasks 9-10 for frontend), error handling (per-video try/except in Task 6, fail-open embedding in Task 2), testing (offline self-check in Task 4), new dependencies (Task 1).
- **Storage detail changed from the spec:** the spec said "chunk row id doubles as the FAISS id." Implemented instead as chunk ids staying `TEXT` UUIDs (matching every other table's primary-key convention in `tracker.py`) with a parallel `study_index_order.json` file recording FAISS row → chunk_id, since FAISS's `IndexFlatIP` returns positional row indices, not arbitrary IDs, and introducing an `INTEGER AUTOINCREMENT` primary key would have been the only schema in the file inconsistent with the rest. Functionally equivalent, more consistent with the existing codebase.
- **Background execution changed from the spec's plain description:** implemented with FastAPI's built-in `BackgroundTasks` (zero new dependency, already available since `fastapi` is already installed) rather than a bespoke thread-pool-and-poll scheme.
