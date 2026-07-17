# YouTube Study RAG — Design

## Purpose

Turn any YouTube playlist into searchable study notes: paste a playlist
link, get per-video notes, and ask questions answered from the actual
transcript content (RAG, not the model's general knowledge). Inspired by
EduRAG (github.com/Lucifer0406/EduRAG), adapted to this project's existing
infra (NVIDIA NIM via `claude_client.py`, SQLite via `TrackerAgent`,
Next.js dashboard) instead of Ollama/Streamlit.

## Non-goals

- Not building a generic video-upload pipeline (EduRAG's use case). Source
  is always a YouTube playlist URL.
- Not replacing the existing Books feature — this is a new, separate
  surface (own tab, own tables).

## Ingest pipeline

```
playlist URL
  → yt-dlp --flat-playlist (video IDs + titles, no download)
  → per video:
      youtube-transcript-api (captions)
        ↳ TranscriptsDisabled / NoTranscriptFound
          → yt-dlp audio download + local Whisper transcription
      → transcript text (+ source tag: "captions" | "whisper")
      → ask_ai(transcript) → notes_md (structured markdown notes)
      → chunk transcript (~500 words, ~50 word overlap)
      → ask_nvidia_embedding() per chunk, batched
      → FAISS IndexIDMap add (chunk row id doubles as FAISS id)
```

Runs as a FastAPI background task. Each video's status (`pending` →
`transcribing` → `embedding` → `done` | `failed`) is written to SQLite as
it progresses so the frontend can poll and show per-video progress instead
of one opaque spinner for the whole playlist.

## Query pipeline

```
question (+ optional playlist_id filter)
  → ask_nvidia_embedding(question) → query vector
  → FAISS search top-k (k=5)
  → build context from top-k chunks (video title + chunk text)
  → ask_ai(question, context, system="answer only from the given context,
           cite which video(s) the answer came from")
  → answer + source list (video titles)
```

Single combined FAISS index across all playlists (per project decision —
not one index per playlist). Cross-playlist search is the default; a
`playlist_id` filter narrows to one playlist by filtering chunk metadata
after the top-k FAISS search (over-fetch k*4, filter, truncate to k).

## Storage

Extends `TrackerAgent`'s existing SQLite DB — no new storage mechanism.

```sql
playlists(id, url, title, status, created_at)
videos(id, playlist_id, video_id, title, url, transcript, notes_md,
       source, status, error, created_at)
chunks(id, video_id, playlist_id, chunk_index, text, created_at)
```

`chunks.id` (SQLite autoincrement) is reused as the FAISS vector id, so no
separate id-mapping table is needed. FAISS index file lives at
`data/study_index.faiss`, rebuilt-on-load if missing (empty index), saved
to disk after every ingest batch.

## New code

- **`claude_client.py`** — add `ask_nvidia_embedding(texts: list[str]) ->
  list[list[float]]`. NVIDIA NIM `/v1/embeddings`, model `baai/bge-m3`,
  batched (NIM embedding endpoints accept a list of inputs per call).
  Returns `[]` on failure — same fail-open contract as `ask_nvidia`.
- **`agents/study_agent.py`** — new `StudyAgent`:
  - `ingest_playlist(url)` — the pipeline above, updates DB status as it
    goes, catches per-video failures without aborting the playlist.
  - `ask(question, playlist_id=None)` — the query pipeline above.
  - `_get_transcript(video_id)` — captions first, Whisper fallback.
  - `_chunk(text)` — word-based chunking with overlap.
- **`agents/tracker.py`** — add `add_playlist`, `update_video`,
  `add_chunks`, `get_playlists`, `get_playlist`, `get_video`,
  `search_chunks` (thin wrapper around the FAISS query), following the
  same method shape as the existing `add_book`/`get_books` methods.
- **`app.py`** — routes:
  - `POST /api/study/playlists/ingest` `{url}` → creates playlist row,
    kicks off background task, returns `{playlist_id}`.
  - `GET /api/study/playlists` → list with per-video status (for the
    progress view).
  - `GET /api/study/playlists/{id}` → detail: videos + notes_md.
  - `POST /api/study/ask` `{question, playlist_id?}` → RAG answer.
- **Frontend** (`web/`) — third tab ("Playlists") in
  `app/learning/page.tsx`, next to Skills/Books. New
  `components/PlaylistPanel.tsx`: paste-link input, per-video ingest
  progress list, notes viewer, ask box. Ask box reuses `LearningChat.tsx`'s
  shape. `lib/api.ts` gets the four calls above.

## Error handling

- Per-video failure (captions off *and* Whisper fails — private/deleted/
  region-locked video) marks that video `status=failed` with `error`
  text; ingestion continues with the rest of the playlist. A playlist is
  never aborted by one bad video.
- Embedding call failure on a chunk: skip that chunk, log it, continue —
  a partially-indexed video beats a crashed ingest.
- Chat/notes generation already goes through `ask_ai`'s existing
  NVIDIA→Gemini→keyword fallback chain in `claude_client.py`; no new
  fallback logic needed there.
- Missing `ffmpeg`/`openai-whisper` at runtime (fallback path only): caught
  and surfaced as a clear per-video error, not a crash of the whole
  ingest job.

## Testing

`agents/study_agent.py` gets a `__main__` self-check (no network calls):
chunk a fixed string, build a FAISS index from deterministic fake vectors,
query it, assert the nearest match is the expected chunk. This verifies
the chunk/index/search wiring independent of YouTube/NVIDIA availability.

## New dependencies

`youtube-transcript-api`, `yt-dlp`, `faiss-cpu` — light, added to
`requirements.txt` unconditionally. `openai-whisper` + system `ffmpeg` —
heavy (whisper model download is a few hundred MB), only exercised on the
fallback path, but must still be installed for that path to work at all;
noted in `requirements.txt` and `CLAUDE.md` as a manual `ffmpeg` install
step (same as EduRAG's own install instructions).
