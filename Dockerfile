# Playwright's own base image ships Python + Chromium + every system-level
# dependency headless Chromium needs, already installed as root at image-build
# time (not our build time) — this sidesteps the `playwright install --with-deps`
# failure on Render's native Python buildpack, which doesn't allow su/sudo.
FROM mcr.microsoft.com/playwright/python:v1.60.0-noble

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render injects $PORT at runtime — shell form (not exec form) so it expands.
CMD uvicorn app:app --host 0.0.0.0 --port $PORT
