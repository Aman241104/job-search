# Lightweight base — PDF generation uses WeasyPrint (HTML/CSS -> PDF directly,
# no browser process) instead of Playwright/Chromium, which was measured at
# ~591MB RSS for a single PDF render and caused a real OOM crash on Render's
# 512MB free tier. WeasyPrint needs a handful of system libs (Pango/Cairo/
# GDK-PixBuf for text shaping and rendering), installed below as root during
# the image build — this also sidesteps the earlier `su`/sudo restriction
# Render's native Python buildpack has (Docker builds run as root by default).
#
# Pinned to -bookworm explicitly, not the floating `slim` tag: that tag moved
# to Debian trixie underneath us mid-deploy and broke this exact apt-get step
# (trixie renamed libgdk-pixbuf2.0-0). Bookworm's package names below are the
# ones WeasyPrint's own install docs document.
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    fonts-liberation \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render injects $PORT at runtime — shell form (not exec form) so it expands.
CMD uvicorn app:app --host 0.0.0.0 --port $PORT
