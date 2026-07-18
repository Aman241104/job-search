"""Cloudinary storage — persists files across Cloud Run/Render's ephemeral
disk (doesn't survive a restart/redeploy). Two uses: uploaded book PDFs, and
the study RAG FAISS index (see study_agent.py's _cloud_sync_up/_cloud_sync_down
— lets a playlist ingested on one host, e.g. local dev, be searchable from
`ask()` running on another, e.g. the deployed backend, since the index is a
local file, not something stored in the shared Postgres DB).

Best-effort throughout: every function returns "" / None on any failure or
missing config, never raises — callers must not depend on this succeeding.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

_configured = False


def _configure() -> bool:
    global _configured
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return False
    if not _configured:
        import cloudinary
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True,
        )
        _configured = True
    return True


def upload_raw(raw_bytes: bytes, public_id: str) -> str:
    """Uploads arbitrary bytes under resource_type='raw' (not an image).
    Overwrites whatever was previously at this public_id. Returns the
    secure_url, or "" on any failure/missing config."""
    if not _configure():
        return ""
    try:
        import cloudinary.uploader
        result = cloudinary.uploader.upload(
            raw_bytes, resource_type="raw", public_id=public_id, overwrite=True,
        )
        return result.get("secure_url", "")
    except Exception:
        return ""


def download_raw(public_id: str) -> bytes | None:
    """Downloads a raw file previously uploaded under `public_id`. Returns
    the bytes, or None on any failure/missing config/not-yet-uploaded."""
    if not _configure():
        return None
    try:
        import cloudinary.utils
        import requests
        url, _ = cloudinary.utils.cloudinary_url(public_id, resource_type="raw")
        resp = requests.get(url, timeout=30)
        return resp.content if resp.status_code == 200 else None
    except Exception:
        return None


def upload_pdf(raw_bytes: bytes, public_id: str) -> str:
    """Uploads a book PDF. Returns the secure_url, or "" on any failure."""
    return upload_raw(raw_bytes, f"job-serach-books/{public_id}")


if __name__ == "__main__":
    # Offline self-check: no network/config — verifies the fail-open contract
    # (every function must return ""/None, never raise, when Cloudinary
    # isn't configured, since most local dev runs won't have these keys set).
    assert not _configure() or (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        assert upload_raw(b"test", "job-serach-selfcheck/test") == ""
        assert download_raw("job-serach-selfcheck/test") is None
        assert upload_pdf(b"test", "selfcheck") == ""
        print("cloudinary_storage self-check passed (no config — fail-open contract verified)")
    else:
        print("cloudinary_storage self-check skipped (Cloudinary IS configured — fail-open path not exercised)")
