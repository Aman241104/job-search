# job-serach

A self-hosted AI job-hunting assistant, built for the Indian fresher job market
(but the scrapers/AI pipeline aren't India-specific). It scrapes jobs from
~14 sources, scores them against your resume with an LLM, generates a
tailored CV + cover letter per job, and gives you a dashboard to track the
whole pipeline — plus an interview trainer, a legitimacy checker for
sketchy postings, a Story Bank for interview answers, and a "Learning"
tutor with book/PDF upload for closing skill gaps.

## Why self-host instead of one shared app

This started as a single-user tool built for one person's own job search,
not a multi-tenant SaaS. Rather than turning it into a shared login-based
product (which would mean building and maintaining real tenant isolation —
the exact kind of cross-tenant data leak that's an easy, dangerous mistake
to make under time pressure), it's set up so anyone can run **their own
private copy** in a few minutes: your own free Supabase database, your own
free AI API keys, your own deployed backend. Nobody else's job data ever
touches your instance, and vice versa.

## Quick start

Requires `ffmpeg` on your system `PATH` (used as a Whisper transcription
fallback for YouTube playlist videos with captions disabled — Learning >
Playlists tab). `sudo apt install ffmpeg` / `brew install ffmpeg`.

```bash
git clone <this-repo>
cd job-serach
python scripts/setup.py
```

The script walks you through every account you need (all free tier, no
credit card required except optionally for deployment — see below), and
writes your `.env` file. Then:

```bash
pip install -r requirements.txt
uvicorn app:app --reload
```

```bash
cd web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open `http://localhost:3000`, go to Profile, and fill in your resume
details — everything else (scraping, scoring, CV generation) reads from
that.

## What you need accounts for

| Service | Required? | Free tier | Used for |
|---|---|---|---|
| [Supabase](https://supabase.com) | Yes | Yes | Postgres database — tables auto-create on first run |
| [NVIDIA NIM](https://build.nvidia.com) | Yes | Yes, ~40 req/min | Primary AI: scoring, CV/cover-letter gen, interview trainer, legitimacy check, contact discovery, Learning tutor |
| [Google Gemini](https://aistudio.google.com/apikey) | Recommended | Yes | Fallback AI if NVIDIA is rate-limited |
| Gmail App Password | For email-apply | Yes | Sending applications directly from the dashboard |
| [Adzuna](https://developer.adzuna.com/signup) / [Jooble](https://jooble.org/api/about) | Optional | Yes | Two extra job-listing sources |
| Telegram Bot ([@BotFather](https://t.me/botfather)) | Optional | Yes | Job alerts to your phone, reply "applied"/an email to update status |
| [Cloudinary](https://cloudinary.com) | Optional | Yes | Persists uploaded book/PDF files across restarts (Learning feature) |

## Architecture

```
web/ (Next.js, Vercel)  ──HTTP──►  app.py (FastAPI)  ──────►  Supabase Postgres
                                        │
                                        ├──► agents/job_finder.py    (14 scrapers)
                                        ├──► claude_client.py         (local Claude CLI, if opted in → NVIDIA → Gemini;
                                        │                              also: job scoring, legitimacy check, STAR story drafting)
                                        ├──► agents/cv_customizer.py (CV + cover letter, WeasyPrint → PDF)
                                        ├──► agents/job_applier.py   (SMTP email-apply)
                                        ├──► agents/batch_applier.py (batch apply: email/telegram/browser)
                                        ├──► agents/telegram_notifier.py (alerts + inbound webhook)
                                        ├──► agents/trainer.py       (interview trainer)
                                        ├──► agents/contact_finder.py
                                        ├──► agents/tracker.py       (all DB access — SQLite locally, Postgres in production)
                                        └──► agents/cloudinary_storage.py (book PDFs)
```

**Job sources scraped:** Internshala, Jobicy, WeWorkRemotely, Arbeitnow,
LinkedIn (guest search — no login), Remotive, RemoteOK, TheMuse,
Remote.co, Himalayas, Hacker News "Who is hiring", Adzuna, Jooble — plus a
hardcoded list of manual-browsing links (`get_gujarat_job_links` in
`job_finder.py`, shown on the `/links` page) for platforms that actively
block automated access (Naukri, Indeed, Glassdoor, Wellfound, Cutshort).

**AI provider chain (for CV/cover-letter generation specifically):** your
local `claude` CLI session first, only if you explicitly set
`AI_PROVIDER=claude_code` (local dev only — uses your Claude subscription,
never set this in a deployed environment) → NVIDIA NIM (free, generous
rate limit) → Gemini if NVIDIA fails/rate-limits. Every other AI feature
(scoring, legitimacy check, interview trainer, Learning tutor, contact
discovery) goes straight to NVIDIA → Gemini, since `AI_PROVIDER` only
gates CV/cover-letter generation.

## Batch Apply

The `/batch` page lets you pick a batch of jobs (top N by score, or hand-
picked) and run them all at once through one of three channels:

- **Email** — generates a tailored CV + cover letter per job and sends it
  to whatever email address it finds in the posting. Toggle between
  **Automatic** (sends immediately) and **Review** (stage everything,
  approve/skip per item, then one confirm-and-send).
- **Telegram** — pushes a batch of job alerts to your configured chat.
- **Browser pre-fill** — opens each job's own page in a headless browser
  and fills whatever common fields it can match (name/email/phone/resume
  upload). **This never clicks submit, in either mode.** Two reasons: ATS
  platforms have mixed and sometimes explicit ToS prohibitions on
  automated submission, and generic form-filling is too unreliable across
  different job board layouts to trust unattended. You finish and submit
  by hand using the screenshot it saves.
  **Known limitation:** doesn't work on platforms that gate the
  application form behind a login wall (e.g. Internshala) — there's
  nothing to fill until you're signed in, and this project deliberately
  does not automate logins against platforms whose ToS prohibits it.

## A note on scraping and ToS

Some sources here (Naukri, Indeed, Wellfound) were tried and abandoned —
they actively detect and block automated access. LinkedIn's guest search
works but visiting many individual job pages in a row (rather than just
the search results) triggers its anti-bot system — that's deliberately
**not** enabled by default (see `_enrich_linkedin_descriptions` in
`job_finder.py` for the one-off local-testing path). Internshala's own ToS
explicitly prohibits automated access; this project runs that scraper
anyway at low volume for personal use, which is a real, acknowledged
gray area, not a claim of blanket permission — the deliberate exclusion of
Internshala from the batch browser channel's login flow (above) reflects
this same caution, not just a technical limitation.

## Deploying

`scripts/setup.py` can deploy to Google Cloud Run for you at the end (needs
the `gcloud` CLI and a GCP project with billing linked — some regions
require a small refundable prepayment, you won't be charged unless you
exceed the free tier). Manually:

```bash
gcloud run deploy job-serach-api --source . --region <your-region> \
  --project <your-project-id> --allow-unauthenticated --memory 2Gi \
  --set-env-vars "$(grep -v '^#' .env | grep -v '^$' | tr '\n' ',' | sed 's/,$//')"
```

`render.yaml` is also included if you'd rather use Render instead — simpler
setup, but its free tier has slow cold starts after idling (which is why
this project's own deployment moved to Cloud Run).

Frontend: `cd web && vercel --prod` (set `NEXT_PUBLIC_API_URL` to your
backend's URL in the Vercel project's environment variables first — it's
baked in at build time, so redeploy after changing it).
