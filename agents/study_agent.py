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
