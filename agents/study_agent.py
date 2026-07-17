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

    def ask(self, question: str, playlist_id: str = None, k: int = 5) -> dict:
        from claude_client import ask_ai, ask_nvidia_embedding

        vectors = ask_nvidia_embedding([question], input_type="query")
        if not vectors:
            return {"answer": "Embedding service unavailable — try again shortly.", "sources": []}

        raw_results = _search_index(vectors[0], k=k * 4 if playlist_id else k)
        candidate_ids = [cid for cid, _ in raw_results]
        chunk_map = self.tracker.get_chunks_by_ids(candidate_ids)
        chunk_ids = [cid for cid in candidate_ids if cid in chunk_map]

        if playlist_id:
            chunk_ids = [cid for cid in chunk_ids if chunk_map[cid]["playlist_id"] == playlist_id][:k]

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
