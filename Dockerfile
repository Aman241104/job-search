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
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    fonts-liberation \
    shared-mime-info \
    tesseract-ocr \
    poppler-utils \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Crawl4AI (used for a narrow, deliberately-scoped set of JS-heavy scraping
# targets — NOT a wholesale replacement of the requests+BeautifulSoup
# scrapers) needs its own Chromium binary + system deps. This is the one
# exception to the "no browser" rule the comment above explains — safe now
# that the deployed service has 2GB RAM (Cloud Run), not Render's 512MB
# free tier that ruled this out originally. `--with-deps` auto-installs the
# apt packages Chromium needs; safe to run as root during a Docker build.
RUN python -m playwright install --with-deps chromium

COPY . .

# Cloud Run (like Render before it) injects $PORT at runtime — shell form
# (not exec form) so it expands.
CMD uvicorn app:app --host 0.0.0.0 --port $PORT
