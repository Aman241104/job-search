"""Cloudinary storage for uploaded book PDFs — persists across a Render
restart/redeploy, unlike local disk on the free tier (ephemeral). Only used
for the raw file itself; extracted page text is stored directly in Postgres
regardless (see tracker.py), so reading/summarizing/chatting never depends
on Cloudinary being configured or reachable.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET


def upload_pdf(raw_bytes: bytes, public_id: str) -> str:
    """Uploads a PDF to Cloudinary under resource_type='raw' (PDFs aren't
    images). Returns the secure_url, or "" on any failure/missing config —
    callers should treat this as best-effort, never block the upload flow
    on it succeeding.
    """
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return ""
    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True,
        )
        result = cloudinary.uploader.upload(
            raw_bytes,
            resource_type="raw",
            public_id=f"job-serach-books/{public_id}",
            overwrite=True,
        )
        return result.get("secure_url", "")
    except Exception:
        return ""
