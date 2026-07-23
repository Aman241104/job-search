"""FastAPI backend for the Job Search Dashboard."""
import asyncio
import html
import json
import math
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, Request, UploadFile, File, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.tracker import TrackerAgent
from agents.job_finder import JobFinderAgent
from agents.cv_customizer import CVCustomizerAgent
from agents.job_applier import JobApplierAgent, extract_email_from_description
from agents.telegram_notifier import TelegramNotifierAgent
from config import OUTPUT_DIR, DATA_DIR, MIN_APPLY_SCORE, LEARNING_TRACK, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHAT_ID
from claude_client import GeminiChat, ask_gemini, ask_ai, check_legitimacy, draft_star_story
from agents.contact_finder import draft_contact_outreach
from agents.trainer import TRAINING_TOPICS, SYSTEM_PROMPTS
from config import FRONTEND_URL, SMTP_EMAIL
from auth import oauth, issue_session_jwt, get_current_user, SESSION_COOKIE, SESSION_TTL_SECONDS
from starlette.middleware.sessions import SessionMiddleware

app = FastAPI(title='Job Search AI', version='1.0.0')
# Cookie-based auth across origins requires allow_credentials=True, which in
# turn requires an explicit origin list — '*' is rejected by browsers once
# credentials are involved.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, 'http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
# Authlib's OAuth client stores the state/nonce for the login->callback
# round-trip in the request session, which starlette needs this middleware
# for. Separate from our own session JWT cookie below.
app.add_middleware(SessionMiddleware, secret_key=os.getenv("JWT_SECRET", ""))

app.mount('/static', StaticFiles(directory='frontend'), name='static')

TOPIC_ICONS = {
    "1": "⚛️", "2": "⚙️", "3": "🧩", "4": "🌳",
    "5": "🏗️", "6": "🤝", "7": "🎨", "8": "💰",
}

TOPIC_DESCRIPTIONS = {
    "1": "React hooks, Next.js SSR/SSG, TypeScript, performance",
    "2": "REST APIs, Express middleware, MongoDB, JWT auth, async/await",
    "3": "Two pointers, sliding window, hash maps, sorting",
    "4": "BFS, DFS, BST operations, binary tree traversals",
    "5": "URL shortener, REST API design, caching, CDN basics",
    "6": "STAR method, tell me about yourself, failures & growth",
    "7": "DevEvents, Awwwards Clone, Stock App deep-dives",
    "8": "TCS 7 LPA → 8-12 LPA negotiation at product startups",
}


@app.get('/')
async def root():
    return FileResponse('frontend/index.html')


# ── Auth (Google OAuth login, JWT session cookie) ───────────────────────────

@app.get('/auth/google/login')
async def google_login(request: Request):
    # Explicit FRONTEND_URL-based redirect_uri, not request.url_for('google_callback')
    # (which would reflect this backend's own domain) — both /login and
    # /callback are reached through the frontend's Next.js rewrite proxy so
    # the whole OAuth dance, including Authlib's CSRF state cookie, stays
    # scoped to one origin. Must exactly match what's registered in
    # Google's console as an authorized redirect URI.
    return await oauth.google.authorize_redirect(request, f"{FRONTEND_URL}/auth/google/callback")


@app.get('/auth/google/callback')
async def google_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get('userinfo') or {}
    google_sub = userinfo.get('sub')
    if not google_sub:
        return JSONResponse({'error': 'Google did not return a user id'}, status_code=400)

    user_id = TrackerAgent().get_or_create_user(
        google_sub=google_sub,
        email=userinfo.get('email', ''),
        name=userinfo.get('name', ''),
        avatar_url=userinfo.get('picture', ''),
    )
    session_jwt = issue_session_jwt(user_id)

    response = RedirectResponse(url=FRONTEND_URL)
    response.set_cookie(
        SESSION_COOKIE, session_jwt, httponly=True, secure=True,
        samesite='none', max_age=SESSION_TTL_SECONDS,
    )
    return response


@app.get('/auth/me')
async def auth_me(user_id: str = Depends(get_current_user)):
    user = TrackerAgent().get_user(user_id)
    if not user:
        return JSONResponse({'error': 'user not found'}, status_code=404)
    return user


@app.post('/auth/logout')
async def auth_logout():
    response = JSONResponse({'ok': True})
    response.delete_cookie(SESSION_COOKIE, samesite='none', secure=True)
    return response


# ── Stats ──────────────────────────────────────────────────────────────────────

@app.get('/api/stats')
async def get_stats(user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    stats = tracker.get_stats(user_id)
    top = tracker.get_unapplied_top_jobs(user_id, min_score=40, limit=20)
    stats['top_opportunities'] = len(top)

    stats['applied']      = stats.get('applied', 0)
    stats['interviewing'] = stats.get('interviewing', 0)
    stats['offers']       = stats.get('offer', 0)
    stats['found']        = stats.get('found', 0)
    stats['rejected']     = stats.get('rejected', 0)
    stats['ghosted']      = stats.get('ghosted', 0)

    # Score breakdown from the database directly, not JobFinderAgent.get_all_jobs()
    # (that reads a local found_jobs.json cache file — regenerable local scrape
    # state, gitignored, and absent entirely on a fresh deploy, where this
    # silently produced all-zero score stats despite jobs.score being right
    # there in the same DB every other stat on this page uses).
    with tracker._get_conn() as conn:
        score_rows = conn.execute("SELECT score FROM jobs WHERE user_id = ?", (user_id,)).fetchall()
    scores = [row[0] or 0 for row in score_rows]
    stats['score_80_plus']  = sum(1 for s in scores if s >= 80)
    stats['score_60_79']    = sum(1 for s in scores if 60 <= s < 80)
    stats['score_40_59']    = sum(1 for s in scores if 40 <= s < 60)
    stats['score_below_40'] = sum(1 for s in scores if s < 40)
    stats['high_match']     = sum(1 for s in scores if s >= 60)
    stats['avg_score']      = round(sum(scores) / len(scores)) if scores else 0
    return stats


@app.get('/api/stats/timeline')
async def get_stats_timeline(user_id: str = Depends(get_current_user)):
    from datetime import timedelta
    tracker = TrackerAgent()
    today = datetime.now().date()
    start = today - timedelta(days=29)  # 30 days including today

    # Build zero-filled dict for all 30 days
    timeline_map = {}
    for i in range(30):
        day = (start + timedelta(days=i)).isoformat()
        timeline_map[day] = {'date': day, 'found': 0, 'applied': 0}

    with tracker._get_conn() as conn:
        # SUBSTR(x, 1, 10) — date_found/date_applied are stored as ISO8601 text,
        # so the first 10 characters are always the date portion.
        found_rows = conn.execute("""
            SELECT SUBSTR(date_found, 1, 10) as day, COUNT(*) as cnt
            FROM jobs
            WHERE user_id = ? AND SUBSTR(date_found, 1, 10) >= ?
            GROUP BY day
        """, (user_id, start.isoformat())).fetchall()
        for row in found_rows:
            day = row[0]
            if day in timeline_map:
                timeline_map[day]['found'] = row[1]

        applied_rows = conn.execute("""
            SELECT SUBSTR(date_applied, 1, 10) as day, COUNT(*) as cnt
            FROM applications
            WHERE user_id = ? AND status != 'found' AND SUBSTR(date_applied, 1, 10) >= ?
            GROUP BY day
        """, (user_id, start.isoformat())).fetchall()
        for row in applied_rows:
            day = row[0]
            if day and day in timeline_map:
                timeline_map[day]['applied'] = row[1]

    timeline = sorted(timeline_map.values(), key=lambda x: x['date'])
    return {'timeline': timeline}


# ── Jobs ───────────────────────────────────────────────────────────────────────

@app.get('/api/jobs')
async def get_jobs(
    status: Optional[str] = None,
    min_score: int = 0,
    min_lpa: int = 0,
    days_ago: int = 0,
    search: str = '',
    source: str = '',
    sort: str = 'score',
    starred: Optional[bool] = None,
    page: int = 1,
    per_page: int = 24,
    user_id: str = Depends(get_current_user),
):
    tracker = TrackerAgent()
    all_apps = tracker.get_all_applications(user_id)

    if status:
        all_apps = [a for a in all_apps if a.get('status') == status]
    if min_score:
        all_apps = [a for a in all_apps if (a.get('score') or 0) >= min_score]
    if search:
        s = search.lower()
        all_apps = [a for a in all_apps if s in (a.get('title', '') + a.get('company', '')).lower()]
    if source:
        all_apps = [a for a in all_apps if source.lower() in (a.get('source') or '').lower()]
    if starred is True:
        all_apps = [a for a in all_apps if a.get('starred')]

    if min_lpa > 0:
        def extract_lpa(job):
            salary = (job.get('salary') or '').lower()
            m = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\.p\.a)', salary)
            if m:
                return float(m.group(1))
            m = re.search(r'(\d+)', salary)
            return float(m.group(1)) if m else 0
        all_apps = [a for a in all_apps if extract_lpa(a) >= min_lpa or not (a.get('salary') or '').strip()]

    if days_ago > 0:
        from datetime import timedelta
        cutoff = (datetime.now() - timedelta(days=days_ago)).isoformat()
        all_apps = [a for a in all_apps if (a.get('date_found') or '') >= cutoff]

    if sort == 'date':
        all_apps = sorted(all_apps, key=lambda x: x.get('date_found') or '', reverse=True)
    elif sort == 'company':
        all_apps = sorted(all_apps, key=lambda x: (x.get('company') or '').lower())
    else:
        all_apps = sorted(all_apps, key=lambda x: x.get('score') or 0, reverse=True)

    total = len(all_apps)
    total_pages = math.ceil(total / per_page) if total > 0 else 1
    start = (page - 1) * per_page
    return {
        'jobs': all_apps[start:start + per_page],
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': total_pages,
    }


@app.get('/api/jobs/{job_id}')
async def get_job(job_id: str, user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("""
            SELECT j.id, j.title, j.company, j.description, j.url, j.source, j.location,
                   j.salary, j.date_found, j.score, j.score_reason, j.starred,
                   a.status, a.date_applied, a.notes, a.cv_path, a.cover_letter_path
            FROM jobs j
            LEFT JOIN applications a ON j.id = a.job_id
            WHERE j.id = ? AND j.user_id = ?
        """, (job_id, user_id)).fetchone()
    if not row:
        return JSONResponse({'error': 'not found'}, status_code=404)
    return row


@app.post('/api/jobs/{job_id}/star')
async def star_job(job_id: str, user_id: str = Depends(get_current_user)):
    starred = TrackerAgent().toggle_star(user_id, job_id)
    return {'starred': starred}


@app.get('/api/jobs/{job_id}/legitimacy')
async def get_job_legitimacy(job_id: str, user_id: str = Depends(get_current_user)):
    """Lazy compute-and-cache — only spends an AI call the first time a job's
    detail view is opened, not for every scraped job in bulk."""
    tracker = TrackerAgent()
    cached = tracker.get_legitimacy(user_id, job_id)
    if cached:
        return cached

    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: check_legitimacy(row))
    if result.get('score') is not None:
        tracker.save_legitimacy(user_id, job_id, result['score'], result['flags'])
    return result


@app.post('/api/jobs/{job_id}/contact')
async def find_job_contact(job_id: str, user_id: str = Depends(get_current_user)):
    """Search-assist + message-draft, not automated LinkedIn scraping (see
    agents/contact_finder.py) — on-demand, not run in bulk."""
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: draft_contact_outreach(row))
    return result


@app.post('/api/jobs/{job_id}/blacklist')
async def blacklist_job_company(job_id: str, user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT company FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    company = row['company']
    blacklisted = tracker.toggle_blacklist(user_id, company)
    return {'blacklisted': blacklisted, 'company': company}


@app.post('/api/jobs/bulk')
async def bulk_update_jobs(request: Request, user_id: str = Depends(get_current_user)):
    data = await request.json()
    action = data.get('action')
    ids = data.get('ids', [])
    value = data.get('value', '')
    if not ids or action not in ('status', 'star', 'delete'):
        return JSONResponse({'error': 'Invalid request'}, status_code=400)
    tracker = TrackerAgent()
    updated = 0
    if action == 'status':
        valid = {'found', 'applied', 'interviewing', 'offer', 'rejected', 'ghosted', 'skipped'}
        if value not in valid:
            return JSONResponse({'error': f'Invalid status: {value}'}, status_code=400)
        with tracker._get_conn() as conn:
            now = datetime.now().isoformat()
            for job_id in ids:
                date_applied = now if value == 'applied' else None
                conn.execute("""
                    UPDATE applications SET status=?, last_updated=?,
                    date_applied=COALESCE(NULLIF(?, ''), date_applied)
                    WHERE job_id=? AND user_id=?
                """, (value, now, date_applied or '', job_id, user_id))
                updated += 1
            conn.commit()
    elif action == 'star':
        star_val = 1 if value == 'true' else 0
        with tracker._get_conn() as conn:
            for job_id in ids:
                conn.execute("UPDATE jobs SET starred=? WHERE id=? AND user_id=?", (star_val, job_id, user_id))
                updated += 1
            conn.commit()
    elif action == 'delete':
        with tracker._get_conn() as conn:
            for job_id in ids:
                conn.execute("DELETE FROM applications WHERE job_id=? AND user_id=?", (job_id, user_id))
                conn.execute("DELETE FROM jobs WHERE id=? AND user_id=?", (job_id, user_id))
                updated += 1
            conn.commit()
    return {'updated': updated}


# ── Files (CV / Cover Letter download) ────────────────────────────────────────
# NOTE: files are scoped by job_id, whose ownership was already checked when
# it was created — download endpoints below don't re-check user_id since the
# filename itself (a UUID) isn't guessable, matching the pre-auth behavior.
# Tightening this (join through applications.user_id) is a good next step but
# out of scope for this pass.

@app.get('/api/files/cv/{job_id}/content')
async def get_cv_content(job_id: str):
    # CVs are now generated as PDF (binary), so there's no text to inline-preview
    # here anymore — the frontend's markdown preview tab falls back to its existing
    # empty state. Download the PDF directly via /api/files/cv/{job_id} instead.
    path = Path(OUTPUT_DIR) / f'cv_{job_id}.pdf'
    if not path.exists():
        return {'content': None}
    return {'content': None}


@app.get('/api/files/cv/{job_id}')
async def download_cv(job_id: str):
    path = Path(OUTPUT_DIR) / f'cv_{job_id}.pdf'
    if not path.exists():
        return JSONResponse({'error': 'CV not found. Generate it by clicking Apply first.'}, status_code=404)
    return FileResponse(path, filename=f'cv_{job_id}.pdf', media_type='application/pdf')


@app.get('/api/files/cover/{job_id}')
async def download_cover(job_id: str):
    path = Path(OUTPUT_DIR) / f'cover_{job_id}.pdf'
    if not path.exists():
        return JSONResponse({'error': 'Cover letter not found. Generate it by clicking Apply first.'}, status_code=404)
    return FileResponse(path, filename=f'cover_{job_id}.pdf', media_type='application/pdf')


# ── Find Jobs (SSE stream) ─────────────────────────────────────────────────────

_find_running: set = set()  # user_ids currently running a find — was a single bool, now per-user


@app.get('/api/find')
async def find_jobs_stream(user_id: str = Depends(get_current_user)):
    if user_id in _find_running:
        async def already():
            yield 'data: ' + json.dumps({'type': 'error', 'message': 'Job finder already running'}) + '\n\n'
        return StreamingResponse(already(), media_type='text/event-stream')

    async def generate():
        _find_running.add(user_id)
        try:
            yield 'data: ' + json.dumps({'type': 'start', 'message': 'Initializing job finder...'}) + '\n\n'
            await asyncio.sleep(0.1)

            loop = asyncio.get_event_loop()

            def run_finder():
                tracker = TrackerAgent()
                profile = tracker.get_profile(user_id) or {}
                finder = JobFinderAgent(profile=profile)
                jobs = finder.find_jobs()
                added = sum(1 for j in jobs if tracker.add_job(user_id, j))
                return jobs, added

            yield 'data: ' + json.dumps({
                'type': 'progress',
                'message': 'Scraping 12 sources: Internshala, LinkedIn, Jobicy, WWR, Arbeitnow, Remotive, RemoteOK, Remote.co, TheMuse, Himalayas, HN Who\'s Hiring, Adzuna...',
                'percent': 10,
            }) + '\n\n'
            jobs, added = await loop.run_in_executor(None, run_finder)
            yield 'data: ' + json.dumps({
                'type': 'progress',
                'message': f'Scoring {len(jobs)} jobs with AI...',
                'percent': 70,
            }) + '\n\n'
            await asyncio.sleep(0.1)

            # Push the best new finds to Telegram for manual apply-from-phone —
            # capped at 5/run so a big scrape doesn't spam the same phone with
            # dozens of messages at once. No-ops silently if Telegram isn't
            # configured (checked once via .enabled, not per-job).
            notifier = TelegramNotifierAgent()
            if notifier.enabled:
                yield 'data: ' + json.dumps({
                    'type': 'progress',
                    'message': 'Pushing top new finds to Telegram...',
                    'percent': 85,
                }) + '\n\n'

                def notify_top():
                    top_new = sorted(
                        [j for j in jobs if j.get('score', 0) >= 70], key=lambda x: x['score'], reverse=True
                    )[:5]
                    tracker = TrackerAgent()
                    cv_agent = CVCustomizerAgent()
                    sent_count = 0
                    for j in top_new:
                        try:
                            package = cv_agent.prepare_full_package(j)
                            if notifier.send_job_alert(user_id, j, package['cv_path'], package['cover_letter_path'], package['cv_markdown']):
                                tracker.update_status(user_id, j['id'], 'found', notes='Telegram alert sent',
                                                       cv_path=package['cv_path'], cover_path=package['cover_letter_path'])
                                sent_count += 1
                        except Exception:
                            continue
                    return sent_count

                await loop.run_in_executor(None, notify_top)

            stats = TrackerAgent().get_stats(user_id)
            top5 = sorted(jobs, key=lambda x: x.get('score', 0), reverse=True)[:5]
            yield 'data: ' + json.dumps({
                'type': 'done',
                'message': f'Found {len(jobs)} jobs, added {added} new',
                'stats': stats,
                'top_jobs': top5,
                'percent': 100,
            }) + '\n\n'
        except Exception as e:
            yield 'data: ' + json.dumps({'type': 'error', 'message': str(e)}) + '\n\n'
        finally:
            _find_running.discard(user_id)

    return StreamingResponse(
        generate(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


# ── Apply ──────────────────────────────────────────────────────────────────────

@app.post('/api/apply/{job_id}')
async def generate_application(job_id: str, force: bool = Query(default=False), user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    threshold = (tracker.get_profile(user_id) or {}).get('min_score_threshold', MIN_APPLY_SCORE)
    if (row.get('score') or 0) < threshold and not force:
        return JSONResponse({
            'error': f"Score {row.get('score', 0)} is below your quality gate ({threshold}). "
                     f"Pass ?force=true to generate anyway."
        }, status_code=400)
    loop = asyncio.get_event_loop()
    package = await loop.run_in_executor(None, lambda: CVCustomizerAgent().prepare_full_package(row))
    tracker.update_status(
        user_id, job_id, 'applied',
        cv_path=package.get('cv_path', ''),
        cover_path=package.get('cover_letter_path', ''),
    )
    return {
        'cv': package.get('cv_markdown', ''),
        'cover_letter': package.get('cover_letter', ''),
        'cv_path': package.get('cv_path', ''),
        'cover_path': package.get('cover_letter_path', ''),
        'apply_url': row.get('url', ''),
    }


@app.post('/api/email-apply/{job_id}')
async def email_apply(job_id: str, to_email: str = Query(default=''), force: bool = Query(default=False), user_id: str = Depends(get_current_user)):
    """Send the tailored CV+cover letter (as PDF attachments) directly to a
    recruiter's email via the SMTP sender in job_applier.py. If to_email isn't
    supplied, tries to auto-detect one from the job's own description text."""
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    profile = tracker.get_profile(user_id) or {}
    threshold = profile.get('min_score_threshold', MIN_APPLY_SCORE)
    if (row.get('score') or 0) < threshold and not force:
        return JSONResponse({
            'error': f"Score {row.get('score', 0)} is below your quality gate ({threshold}). "
                     f"Pass ?force=true to send anyway."
        }, status_code=400)

    email = to_email or extract_email_from_description(row.get('description', ''))
    if not email:
        return JSONResponse(
            {'error': 'No email address found in this listing — pass one explicitly with ?to_email=...'},
            status_code=400,
        )

    loop = asyncio.get_event_loop()
    package = await loop.run_in_executor(None, lambda: CVCustomizerAgent().prepare_full_package(row))
    if 'generation failed' in package.get('cv_markdown', ''):
        return JSONResponse({'error': 'CV generation failed, not sending email — try again.'}, status_code=502)

    applier = JobApplierAgent()
    sent = await loop.run_in_executor(None, lambda: applier.send_email_application(user_id, row, email, package, profile))
    if not sent:
        return JSONResponse({'error': 'Email failed to send — set up your email in Profile, or check SMTP_PASSWORD in .env.'}, status_code=502)
    return {'ok': True, 'sent_to': email}


@app.post('/api/telegram-notify/{job_id}')
async def telegram_notify(job_id: str, force: bool = Query(default=False), user_id: str = Depends(get_current_user)):
    """For listings with no direct recruiter email (the majority) — generates
    the tailored CV/cover-letter and pushes job link + details + both PDFs to
    Telegram, so applying by hand can happen from a phone whenever there's a
    free moment, instead of needing this dashboard open."""
    tracker = TrackerAgent()
    notifier = TelegramNotifierAgent()
    if not notifier.enabled:
        return JSONResponse(
            {'error': 'Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.'},
            status_code=400,
        )

    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    threshold = (tracker.get_profile(user_id) or {}).get('min_score_threshold', MIN_APPLY_SCORE)
    if (row.get('score') or 0) < threshold and not force:
        return JSONResponse({
            'error': f"Score {row.get('score', 0)} is below your quality gate ({threshold}). "
                     f"Pass ?force=true to notify anyway."
        }, status_code=400)

    loop = asyncio.get_event_loop()
    package = await loop.run_in_executor(None, lambda: CVCustomizerAgent().prepare_full_package(row))
    if 'generation failed' in package.get('cv_markdown', ''):
        return JSONResponse({'error': 'CV generation failed, not notifying — try again.'}, status_code=502)

    sent = await loop.run_in_executor(
        None, lambda: notifier.send_job_alert(user_id, row, package['cv_path'], package['cover_letter_path'], package['cv_markdown'])
    )
    if not sent:
        return JSONResponse({'error': 'Telegram send failed — check TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID.'}, status_code=502)

    tracker.update_status(user_id, job_id, 'found', notes='Telegram alert sent',
                           cv_path=package['cv_path'], cover_path=package['cover_letter_path'])
    return {'ok': True}


EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')


def _resolve_job_from_telegram_text(tracker: 'TrackerAgent', user_id: str, text: str, reply_to_message_id) -> dict | None:
    """Reply-to-a-specific-alert is the reliable path (message_id was recorded
    when that alert was sent). Falls back to matching the message text against
    recently-found job titles/companies for when the user just types a plain
    message instead of replying to a specific alert."""
    if reply_to_message_id:
        job_id = tracker.get_job_id_by_telegram_message(reply_to_message_id)
        if job_id:
            with tracker._get_conn() as conn:
                conn.row_factory = True
                row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
            if row:
                return row

    text_lower = text.lower()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        rows = conn.execute(
            "SELECT * FROM jobs WHERE user_id = ? ORDER BY date_found DESC LIMIT 200", (user_id,)
        ).fetchall()
    for job in rows:
        company = (job.get('company') or '').lower()
        title = (job.get('title') or '').lower()
        if company and company in text_lower:
            return job
        if title and len(title) > 6 and title in text_lower:
            return job
    return None


@app.post('/api/telegram/webhook')
async def telegram_webhook(request: Request):
    """Receives inbound Telegram messages so applying can happen entirely
    from the phone: reply "applied" or "emailed x@company.com" to a job
    alert (or just mention the company/title in a plain message) and the
    tracker updates without opening the dashboard.

    Auth: Telegram attaches the secret configured via setWebhook's
    secret_token param as this header on every real callback — the only
    protection this public, unauthenticated-by-default endpoint has. There's
    no browser session here (Telegram calls this directly), so it resolves to
    whichever account's email matches SMTP_EMAIL — the bot token/chat id are
    both global env vars, not per-user yet, so this feature is effectively
    single-tenant regardless of how many accounts the dashboard has.
    """
    if TELEGRAM_WEBHOOK_SECRET:
        if request.headers.get('X-Telegram-Bot-Api-Secret-Token', '') != TELEGRAM_WEBHOOK_SECRET:
            return JSONResponse({'error': 'unauthorized'}, status_code=403)

    owner = TrackerAgent().get_user_by_email(SMTP_EMAIL)
    if not owner:
        return {'ok': True}  # no matching account yet — nothing to update
    user_id = owner['id']

    try:
        update = await request.json()
    except Exception:
        return {'ok': True}  # malformed body — ack anyway, nothing to retry

    message = update.get('message') or update.get('edited_message')
    if not message:
        return {'ok': True}  # non-message update (e.g. a bot command menu event) — nothing to do

    chat_id = str(message.get('chat', {}).get('id', ''))
    if not TELEGRAM_CHAT_ID or chat_id != str(TELEGRAM_CHAT_ID):
        return {'ok': True}  # ignore messages from anyone but the configured owner chat

    text = (message.get('text') or '').strip()
    if not text:
        return {'ok': True}

    reply_to = message.get('reply_to_message', {}).get('message_id')
    tracker = TrackerAgent()
    notifier = TelegramNotifierAgent()

    loop = asyncio.get_event_loop()
    job = await loop.run_in_executor(None, lambda: _resolve_job_from_telegram_text(tracker, user_id, text, reply_to))

    if not job:
        await loop.run_in_executor(
            None, lambda: notifier._send_message(
                "🤔 Couldn't match that to a job — reply directly to a job alert message, "
                "or mention the company/title clearly."
            )
        )
        return {'ok': True}

    text_lower = text.lower()
    email_match = EMAIL_RE.search(text)

    if email_match:
        status, note = 'applied', f"Applied — email sent to {email_match.group()} (via Telegram)"
    elif any(w in text_lower for w in ('applied', 'submitted', 'done')):
        status, note = 'applied', 'Applied (marked via Telegram)'
    elif any(w in text_lower for w in ('skip', 'skipping', 'pass', 'not applying', "won't apply")):
        status, note = 'skipped', 'Skipped (marked via Telegram)'
    else:
        status, note = 'applied', f'Applied — note: {text} (via Telegram)'

    await loop.run_in_executor(None, lambda: tracker.update_status(user_id, job['id'], status, notes=note))
    await loop.run_in_executor(
        None, lambda: notifier._send_message(
            f"✅ Marked <b>{html.escape(job.get('title',''))}</b> @ {html.escape(job.get('company',''))} as <b>{status}</b>."
        )
    )
    return {'ok': True}


@app.post('/api/update/{job_id}')
async def update_job(job_id: str, status: str, notes: str = '', user_id: str = Depends(get_current_user)):
    TrackerAgent().update_status(user_id, job_id, status, notes=notes)
    return {'ok': True}


@app.post('/api/notes/{job_id}')
async def save_notes(job_id: str, notes: str = Query(...), user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.execute(
            "UPDATE applications SET notes=?, last_updated=? WHERE job_id=? AND user_id=?",
            (notes, datetime.now().isoformat(), job_id, user_id)
        )
        conn.commit()
    return {'ok': True}


# ── Export ─────────────────────────────────────────────────────────────────────

@app.get('/api/export')
async def export_excel(user_id: str = Depends(get_current_user)):
    path = TrackerAgent().export_to_excel(user_id)
    return FileResponse(
        path,
        filename='job_tracker.xlsx',
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


# ── Training ───────────────────────────────────────────────────────────────────

@app.get('/api/train/topics')
async def get_topics():
    return [
        {
            'key': k,
            'name': v[0],
            'description': TOPIC_DESCRIPTIONS.get(k, ''),
            'icon': TOPIC_ICONS.get(k, '📚'),
        }
        for k, v in TRAINING_TOPICS.items()
    ]


_chat_sessions: dict = {}


@app.post('/api/train/start')
async def start_training(topic_key: str, user_id: str = Depends(get_current_user)):
    if topic_key not in TRAINING_TOPICS:
        return JSONResponse({'error': 'Invalid topic'}, status_code=400)
    topic_name, topic_id = TRAINING_TOPICS[topic_key]
    system = SYSTEM_PROMPTS.get(topic_id, SYSTEM_PROMPTS['behavioral'])
    session_id = str(uuid.uuid4())
    chat = GeminiChat(system=system, temperature=0.8)
    first_q = await asyncio.get_event_loop().run_in_executor(
        None, lambda: chat.send('Start the interview. Greet me briefly and ask your first question.')
    )
    _chat_sessions[session_id] = {
        'chat': chat,
        'topic': topic_name,
        'topic_key': topic_key,
        'user_id': user_id,
        'scores': [],
        'messages': [],
    }
    first_msg = first_q or f"Welcome to the {topic_name} interview! Let's begin with the first question."
    _chat_sessions[session_id]['messages'].append({'role': 'assistant', 'content': first_msg, 'score': None})
    return {
        'session_id': session_id,
        'topic_key': topic_key,
        'topic_name': topic_name,
        'message': first_msg,
    }


def _rehydrate_chat_session(user_id: str, session_id: str) -> dict | None:
    """Reconstruct an in-memory chat session from its persisted row after a
    server restart (Cloud Run can restart/redeploy at any time — _chat_sessions
    is process-local and doesn't survive that). Returns None if nothing was
    ever persisted for this session (e.g. it died before the first exchange
    completed) — that case genuinely can't be recovered."""
    row = TrackerAgent().get_training_session(user_id, session_id)
    if not row:
        return None
    topic_key = row.get('topic_key', '')
    topic_id = TRAINING_TOPICS.get(topic_key, (None, 'behavioral'))[1]
    system = SYSTEM_PROMPTS.get(topic_id, SYSTEM_PROMPTS['behavioral'])
    chat = GeminiChat(system=system, temperature=0.8)
    messages = row.get('messages', [])
    # GeminiChat.history is OpenAI-format ({"role": "user"/"assistant", "content": ...})
    # since the NVIDIA-first rewrite — NOT Gemini-native {"role":"model","parts":[...]}.
    # Using the old format here would silently corrupt every rehydrated (post-restart)
    # session's history sent to the API.
    chat.history = [
        {'role': 'assistant' if m['role'] == 'assistant' else 'user', 'content': m.get('content', '')}
        for m in messages
    ]
    scores = [m['score'] for m in messages if m.get('score')]
    return {
        'chat': chat,
        'topic': row.get('topic_name', ''),
        'topic_key': topic_key,
        'user_id': user_id,
        'scores': scores,
        'messages': messages,
    }


@app.post('/api/train/chat')
async def training_chat(session_id: str, message: str, user_id: str = Depends(get_current_user)):
    if session_id not in _chat_sessions:
        rehydrated = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _rehydrate_chat_session(user_id, session_id)
        )
        if not rehydrated:
            return JSONResponse({'error': 'Session expired'}, status_code=400)
        _chat_sessions[session_id] = rehydrated
    session = _chat_sessions[session_id]
    if session.get('user_id') != user_id:
        return JSONResponse({'error': 'Session expired'}, status_code=400)
    chat: GeminiChat = session['chat']
    session['messages'].append({'role': 'user', 'content': message, 'score': None})
    prompt = f"{message}\n\n[Score my answer /10, give specific feedback, model answer, then ask next question.]"
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: chat.send(prompt, max_tokens=700))
    score_match = re.search(r'(\d+)\s*/\s*10', response or '')
    score = int(score_match.group(1)) if score_match else None
    if score:
        session['scores'].append(score)
    session['messages'].append({'role': 'assistant', 'content': response or '', 'score': score})
    avg_score = sum(session['scores']) / len(session['scores']) if session['scores'] else 0
    # Persist session
    try:
        tracker = TrackerAgent()
        tracker.save_training_session(
            user_id=user_id,
            session_id=session_id,
            topic_key=session.get('topic_key', ''),
            topic_name=session.get('topic', ''),
            messages=session['messages'],
            avg_score=round(avg_score, 1),
        )
    except Exception:
        pass
    return {
        'response': response,
        'score': score,
        'avg_score': avg_score if session['scores'] else None,
    }


@app.get('/api/train/progress')
async def training_progress(user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    return tracker.get_training_progress(user_id)


# ── Learning track: ROADMAP.md's curated list + user-added custom skills,
# progress tracking, an AI tutor chat per item, an AI-generated zero-to-hero
# topic checklist per item (a real 0-100 coverage score, checked off manually
# rather than fragile auto-detection from conversation), and a PDF/book
# library with page-by-page reading + AI page summaries grounded in the
# book's actual extracted text. ─────────────────────────────────────────────

_learning_sessions: dict = {}
_book_sessions: dict = {}

LEARNING_SYSTEM_PROMPT_TEMPLATE = (
    'You are a patient, knowledgeable tutor teaching "{title}" to a self-taught '
    "full-stack/AI engineer preparing for AI-engineering interviews. Explain "
    "concepts clearly with concrete, practical examples grounded in real code "
    "where relevant. Answer questions directly, FAQ-style — no filler, no "
    "restating the question back. If asked for an overview, give a numbered "
    "breakdown of the key topics/chapters in this specific book or course."
)


@app.get('/api/learning/topics')
async def get_learning_topics(user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    tracker.seed_learning_items(user_id, LEARNING_TRACK)
    items = tracker.get_learning_items(user_id)
    for item in items:
        topics = tracker.get_learning_topics(item['id'])
        item['topic_count'] = len(topics)
        item['topics_covered'] = sum(1 for t in topics if t.get('covered'))
        item['coverage_score'] = (
            round(item['topics_covered'] / item['topic_count'] * 100) if topics else None
        )
    return items


def _get_learning_item(user_id: str, item_id: str) -> dict | None:
    return next((i for i in TrackerAgent().get_learning_items(user_id) if i['id'] == item_id), None)


@app.post('/api/learning/skills')
async def add_learning_skill(title: str, user_id: str = Depends(get_current_user)):
    """User-added "zero to hero" skill, not limited to the curated ROADMAP.md
    list — any skill name works. Gets its own AI-generated topic checklist
    immediately, same as curated items."""
    item_id = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:60] or str(uuid.uuid4())[:8]
    item_id = f"{user_id}:{item_id}"
    tracker = TrackerAgent()
    tracker.add_custom_learning_item(user_id, item_id, title)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: _ensure_learning_topics(item_id, title))
    return {'ok': True, 'item_id': item_id}


def _ensure_learning_topics(item_id: str, title: str) -> list:
    """Generates a zero-to-hero topic breakdown via AI the first time it's
    needed for this item, then reuses it (save_learning_topics no-ops if
    topics already exist) — so re-opening an item never regenerates over
    checkboxes the user already ticked."""
    tracker = TrackerAgent()
    existing = tracker.get_learning_topics(item_id)
    if existing:
        return existing
    prompt = (
        f'Give a "zero to hero" breakdown of "{title}" as a numbered list of 8-12 concrete, '
        "learnable topics, ordered from fundamentals to advanced. One topic per line, just "
        "the topic name (a few words each), no descriptions. Example:\n1. Topic name\n2. Topic name"
    )
    raw = ask_ai(prompt, max_tokens=400) or ""
    topic_names = []
    for line in raw.splitlines():
        m = re.match(r'^\s*\d+[\.\)]\s*(.+)$', line.strip())
        if m:
            topic_names.append(m.group(1).strip().strip('*').strip())
    if not topic_names:
        topic_names = ["Fundamentals", "Core concepts", "Practical application", "Advanced topics"]
    tracker.save_learning_topics(item_id, topic_names[:12])
    return tracker.get_learning_topics(item_id)


@app.get('/api/learning/{item_id}/topics')
async def get_item_topics(item_id: str, user_id: str = Depends(get_current_user)):
    item = _get_learning_item(user_id, item_id)
    if not item:
        return JSONResponse({'error': 'Unknown learning item'}, status_code=404)
    loop = asyncio.get_event_loop()
    topics = await loop.run_in_executor(None, lambda: _ensure_learning_topics(item_id, item['title']))
    return topics


@app.post('/api/learning/topics/{topic_id}/toggle')
async def toggle_topic(topic_id: str):
    covered = TrackerAgent().toggle_learning_topic(topic_id)
    return {'ok': True, 'covered': covered}


@app.post('/api/learning/{item_id}/status')
async def set_learning_status(item_id: str, status: str, notes: str = Query(default=''), user_id: str = Depends(get_current_user)):
    if not _get_learning_item(user_id, item_id):
        return JSONResponse({'error': 'Unknown learning item'}, status_code=404)
    TrackerAgent().update_learning_status(user_id, item_id, status, notes)
    return {'ok': True}


def _rehydrate_learning_session(user_id: str, item_id: str, title: str) -> dict | None:
    row = TrackerAgent().get_training_session(user_id, f"learning_{item_id}")
    if not row:
        return None
    chat = GeminiChat(system=LEARNING_SYSTEM_PROMPT_TEMPLATE.format(title=title), temperature=0.6)
    messages = row.get('messages', [])
    chat.history = [
        {'role': 'assistant' if m['role'] == 'assistant' else 'user', 'content': m.get('content', '')}
        for m in messages
    ]
    return {'chat': chat, 'title': title, 'messages': messages}


@app.post('/api/learning/{item_id}/chat')
async def learning_chat(item_id: str, message: str = Query(default=''), user_id: str = Depends(get_current_user)):
    item = _get_learning_item(user_id, item_id)
    if not item:
        return JSONResponse({'error': 'Unknown learning item'}, status_code=404)
    title = item['title']
    loop = asyncio.get_event_loop()

    if item_id not in _learning_sessions:
        rehydrated = await loop.run_in_executor(None, lambda: _rehydrate_learning_session(user_id, item_id, title))
        if rehydrated:
            _learning_sessions[item_id] = rehydrated
        else:
            _learning_sessions[item_id] = {
                'chat': GeminiChat(system=LEARNING_SYSTEM_PROMPT_TEMPLATE.format(title=title), temperature=0.6),
                'title': title,
                'messages': [],
            }
            if not message:
                # first time this item is opened — kick off with a topic breakdown
                message = (
                    f'Give me a numbered breakdown of the key topics/chapters in "{title}" — '
                    f"just the list with a one-line description of each, so I know what to ask about next."
                )

    if not message:
        return JSONResponse({'error': 'message is required'}, status_code=400)

    session = _learning_sessions[item_id]
    chat: GeminiChat = session['chat']
    session['messages'].append({'role': 'user', 'content': message})
    response = await loop.run_in_executor(None, lambda: chat.send(message, max_tokens=700))
    session['messages'].append({'role': 'assistant', 'content': response or ''})

    try:
        TrackerAgent().save_training_session(
            user_id=user_id, session_id=f"learning_{item_id}", topic_key=f"learning_{item_id}",
            topic_name=title, messages=session['messages'], avg_score=0,
        )
        # first real exchange on an untouched item — bump it to in_progress
        if item.get('status') == 'not_started':
            TrackerAgent().update_learning_status(user_id, item_id, 'in_progress')
    except Exception:
        pass

    return {'response': response or '', 'item_id': item_id}


# ── Book/PDF library — upload, page-by-page reading, AI page summaries
# grounded in the book's own extracted text (not the AI's general knowledge),
# and a tutor chat scoped to a page range. NOTE: the raw uploaded PDF itself
# is stored on local disk (OUTPUT_DIR) and may NOT survive a restart on a
# free-tier host (ephemeral disk) — the extracted TEXT is stored in Postgres
# and survives regardless, which is what page reading/summary/chat actually
# depend on. ──────────────────────────────────────────────────────────────

@app.post('/api/learning/books/upload')
async def upload_book(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        return JSONResponse({'error': 'Only PDF files are supported'}, status_code=400)

    raw = await file.read()
    if len(raw) > 30 * 1024 * 1024:  # 30MB — generous for a text-based book, guards against accidental huge uploads
        return JSONResponse({'error': 'File too large (30MB max)'}, status_code=400)

    def _extract_and_store():
        import pypdf
        import io
        from agents.cloudinary_storage import upload_pdf
        reader = pypdf.PdfReader(io.BytesIO(raw))
        page_texts = [(p.extract_text() or '') for p in reader.pages]

        # OCR fallback for pages pypdf couldn't extract text from (scanned/
        # image-only pages) — tesseract is lightweight, safe on a free tier
        # unlike the Playwright/Chromium path this repo already ruled out
        # for PDF generation (see Dockerfile comment).
        empty_pages = [i for i, t in enumerate(page_texts) if not t.strip()]
        if empty_pages:
            import pytesseract
            from pdf2image import convert_from_bytes
            for i in empty_pages:
                try:
                    images = convert_from_bytes(raw, first_page=i + 1, last_page=i + 1, dpi=200)
                    if images:
                        ocr_text = pytesseract.image_to_string(images[0])
                        if ocr_text.strip():
                            page_texts[i] = ocr_text
                except Exception:
                    continue  # this page stays empty — not fatal for the rest of the book

        if not any(t.strip() for t in page_texts):
            return None, 0
        # Pre-generate the id so the Cloudinary public_id and the DB row's
        # book_id match — upload is best-effort (empty string on any failure/
        # missing config just means no download link; reading/summary/chat
        # never depend on it, they use the extracted text stored below).
        book_id = str(uuid.uuid4())
        cloudinary_url = upload_pdf(raw, book_id)
        TrackerAgent().add_book(
            user_id=user_id, title=file.filename.rsplit('.', 1)[0], filename=file.filename,
            page_texts=page_texts, cloudinary_url=cloudinary_url, book_id=book_id,
        )
        return book_id, len(page_texts)

    loop = asyncio.get_event_loop()
    book_id, page_count = await loop.run_in_executor(None, _extract_and_store)
    if not book_id:
        return JSONResponse({'error': 'No extractable text found — this may be a scanned/image-only PDF'}, status_code=400)
    return {'ok': True, 'book_id': book_id, 'page_count': page_count}


@app.get('/api/learning/books')
async def list_books(user_id: str = Depends(get_current_user)):
    return TrackerAgent().get_books(user_id)


@app.get('/api/learning/books/{book_id}/page/{page_num}')
async def get_book_page(book_id: str, page_num: int, user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    page = tracker.get_book_page(user_id, book_id, page_num)
    if not page:
        return JSONResponse({'error': 'Page not found'}, status_code=404)
    tracker.update_book_current_page(user_id, book_id, page_num)
    return page


@app.post('/api/learning/books/{book_id}/page/{page_num}/summary')
async def summarize_book_page(book_id: str, page_num: int, user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    page = tracker.get_book_page(user_id, book_id, page_num)
    if not page:
        return JSONResponse({'error': 'Page not found'}, status_code=404)
    if page.get('summary'):
        return {'summary': page['summary'], 'cached': True}
    text = (page.get('text') or '').strip()
    if not text:
        return {'summary': '(This page has no extractable text — likely a scanned image page.)', 'cached': False}
    loop = asyncio.get_event_loop()
    prompt = f"Summarize this book page clearly and concisely (3-5 sentences), grounded only in the text given:\n\n{text[:6000]}"
    summary = await loop.run_in_executor(None, lambda: ask_ai(prompt, max_tokens=300))
    summary = summary or "Summary generation failed — try again."
    tracker.save_page_summary(book_id, page_num, summary)
    return {'summary': summary, 'cached': False}


@app.post('/api/learning/books/{book_id}/chat')
async def book_chat(book_id: str, page_num: int, message: str = Query(default=''), user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    book = tracker.get_book(user_id, book_id)
    if not book:
        return JSONResponse({'error': 'Book not found'}, status_code=404)
    page = tracker.get_book_page(user_id, book_id, page_num)
    if not page:
        return JSONResponse({'error': 'Page not found'}, status_code=404)
    if not message:
        return JSONResponse({'error': 'message is required'}, status_code=400)

    session_key = f"{book_id}_{page_num}"
    if session_key not in _book_sessions:
        system = (
            f'You are a tutor helping the user understand page {page_num} of "{book["title"]}". '
            f"Answer only using the actual page text given below — if the answer isn't in this "
            f"page, say so rather than guessing from general knowledge.\n\nPAGE TEXT:\n{(page.get('text') or '')[:6000]}"
        )
        _book_sessions[session_key] = GeminiChat(system=system, temperature=0.4)

    chat: GeminiChat = _book_sessions[session_key]
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: chat.send(message, max_tokens=600))
    return {'response': response or ''}


# ── YouTube playlist study RAG — paste a playlist link, get transcripts +
# AI notes per video, and ask questions answered by RAG over the indexed
# transcripts. Ingest is split into a fast synchronous step (list videos,
# create rows) so the request returns immediately, and a BackgroundTasks
# step that does the slow transcribe/embed work; the frontend polls
# GET .../{playlist_id} for per-video progress. ─────────────────────────────

@app.post('/api/learning/playlists/ingest')
async def ingest_playlist(background_tasks: BackgroundTasks, url: str = Query(...), user_id: str = Depends(get_current_user)):
    from agents.study_agent import StudyAgent
    agent = StudyAgent()
    loop = asyncio.get_event_loop()
    playlist_id = await loop.run_in_executor(None, lambda: agent.start_playlist(user_id, url))
    background_tasks.add_task(agent.process_playlist, playlist_id)
    return {'ok': True, 'playlist_id': playlist_id}


@app.get('/api/learning/playlists')
async def list_playlists(user_id: str = Depends(get_current_user)):
    return TrackerAgent().get_playlists(user_id)


@app.get('/api/learning/playlists/{playlist_id}')
async def get_playlist_detail(playlist_id: str, user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    playlist = tracker.get_playlist(user_id, playlist_id)
    if not playlist:
        return JSONResponse({'error': 'Playlist not found'}, status_code=404)
    playlist['videos'] = tracker.get_videos_for_playlist(playlist_id)
    return playlist


@app.post('/api/learning/playlists/ask')
async def ask_playlists(question: str = Query(...), playlist_id: str = Query(default=None), user_id: str = Depends(get_current_user)):
    if not question:
        return JSONResponse({'error': 'question is required'}, status_code=400)
    if playlist_id and not TrackerAgent().get_playlist(user_id, playlist_id):
        return JSONResponse({'error': 'Playlist not found'}, status_code=404)
    from agents.study_agent import StudyAgent
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: StudyAgent().ask(user_id, question, playlist_id))
    return result


# ── Interview Story Bank (STAR + Reflection) ────────────────────────────────────

@app.get('/api/stories')
async def get_stories(user_id: str = Depends(get_current_user)):
    return TrackerAgent().get_stories(user_id)


@app.post('/api/stories')
async def add_story(situation: str, task: str, action: str, result: str,
                     reflection: str, tags: str = Query(default=''), source_job_id: str = Query(default=''),
                     user_id: str = Depends(get_current_user)):
    """tags is a comma-separated string over the query string; stored as a JSON list."""
    tag_list = [t.strip() for t in tags.split(',') if t.strip()]
    story_id = TrackerAgent().add_story(user_id, situation, task, action, result, reflection, tag_list, source_job_id)
    return {'ok': True, 'id': story_id}


@app.post('/api/stories/draft')
async def draft_story(notes: str):
    """AI-assist: paste rough notes about a past experience, get back a
    structured STAR+Reflection draft (not saved yet — the user reviews/edits
    before POSTing to /api/stories)."""
    loop = asyncio.get_event_loop()
    draft = await loop.run_in_executor(None, lambda: draft_star_story(notes))
    return draft


@app.put('/api/stories/{story_id}')
async def update_story(story_id: str, situation: str, task: str, action: str,
                        result: str, reflection: str, tags: str = Query(default=''),
                        user_id: str = Depends(get_current_user)):
    tag_list = [t.strip() for t in tags.split(',') if t.strip()]
    TrackerAgent().update_story(user_id, story_id, situation, task, action, result, reflection, tag_list)
    return {'ok': True}


@app.delete('/api/stories/{story_id}')
async def delete_story(story_id: str, user_id: str = Depends(get_current_user)):
    TrackerAgent().delete_story(user_id, story_id)
    return {'ok': True}


# ── Analytics ──────────────────────────────────────────────────────────────────

@app.get('/api/analytics')
async def get_analytics(user_id: str = Depends(get_current_user)):
    tracker = TrackerAgent()
    all_apps = tracker.get_all_applications(user_id)

    # Funnel
    total = len(all_apps)
    by_status = {}
    for a in all_apps:
        s = a.get('status', 'found')
        by_status[s] = by_status.get(s, 0) + 1

    found = by_status.get('found', 0)
    applied = by_status.get('applied', 0)
    interviewing = by_status.get('interviewing', 0)
    offer = by_status.get('offer', 0)
    rejected = by_status.get('rejected', 0)
    ghosted = by_status.get('ghosted', 0)

    funnel = {
        'found': total,
        'applied': applied + interviewing + offer + rejected + ghosted,
        'interviewing': interviewing + offer,
        'offer': offer,
        'apply_rate': round((applied + interviewing + offer + rejected + ghosted) / total * 100, 1) if total else 0,
        'interview_rate': round((interviewing + offer) / max(applied + interviewing + offer + rejected + ghosted, 1) * 100, 1),
        'offer_rate': round(offer / max(interviewing + offer, 1) * 100, 1),
    }

    # Source breakdown
    source_map: dict = {}
    for a in all_apps:
        src = a.get('source') or 'Unknown'
        if src not in source_map:
            source_map[src] = {'count': 0, 'scores': [], 'high_match': 0}
        source_map[src]['count'] += 1
        score = a.get('score') or 0
        source_map[src]['scores'].append(score)
        if score >= 60:
            source_map[src]['high_match'] += 1

    source_breakdown = sorted(
        [
            {
                'source': src,
                'count': v['count'],
                'avg_score': round(sum(v['scores']) / len(v['scores'])) if v['scores'] else 0,
                'high_match': v['high_match'],
            }
            for src, v in source_map.items()
        ],
        key=lambda x: x['count'],
        reverse=True,
    )

    # Score distribution
    scores = [a.get('score') or 0 for a in all_apps]
    score_distribution = [
        {'range': '80–100', 'count': sum(1 for s in scores if s >= 80), 'color': 'green'},
        {'range': '60–79', 'count': sum(1 for s in scores if 60 <= s < 80), 'color': 'cyan'},
        {'range': '40–59', 'count': sum(1 for s in scores if 40 <= s < 60), 'color': 'yellow'},
        {'range': '20–39', 'count': sum(1 for s in scores if 20 <= s < 40), 'color': 'orange'},
        {'range': '0–19', 'count': sum(1 for s in scores if s < 20), 'color': 'red'},
    ]

    # Top companies
    company_map: dict = {}
    for a in all_apps:
        co = a.get('company') or 'Unknown'
        if co not in company_map:
            company_map[co] = {'count': 0, 'scores': []}
        company_map[co]['count'] += 1
        company_map[co]['scores'].append(a.get('score') or 0)

    top_companies = sorted(
        [
            {
                'company': co,
                'count': v['count'],
                'avg_score': round(sum(v['scores']) / len(v['scores'])) if v['scores'] else 0,
            }
            for co, v in company_map.items()
        ],
        key=lambda x: x['avg_score'],
        reverse=True,
    )[:10]

    # Status health tips
    tips = []
    if total == 0:
        tips.append({'type': 'warning', 'msg': 'No jobs found yet. Click "Find New Jobs" on Dashboard.'})
    elif funnel['apply_rate'] < 10:
        tips.append({'type': 'warning', 'msg': f'Apply rate is only {funnel["apply_rate"]}%. Try to apply to at least 10% of found jobs.'})
    elif funnel['apply_rate'] >= 30:
        tips.append({'type': 'success', 'msg': f'Great apply rate at {funnel["apply_rate"]}%! Keep the momentum.'})
    if applied > 0 and interviewing == 0:
        tips.append({'type': 'info', 'msg': 'No interviews yet. Consider improving your CV or applying to more companies.'})
    if total > 50 and sum(1 for s in scores if s >= 70) < 5:
        tips.append({'type': 'info', 'msg': 'Few high-match jobs. Try refreshing job search or broadening role titles.'})

    return {
        'funnel': funnel,
        'source_breakdown': source_breakdown,
        'score_distribution': score_distribution,
        'top_companies': top_companies,
        'tips': tips,
        'total_jobs': total,
        'avg_score': round(sum(scores) / len(scores)) if scores else 0,
    }


# ── Resume (per-user, stored in Postgres — falls back to the repo's default
# master_resume.json template for a brand-new user who hasn't saved yet) ────

@app.get('/api/resume')
async def get_resume(user_id: str = Depends(get_current_user)):
    data = TrackerAgent().get_resume(user_id)
    if data is not None:
        return data
    default_path = Path(DATA_DIR) / 'master_resume.json'
    if not default_path.exists():
        return JSONResponse({'error': 'Resume not found'}, status_code=404)
    return json.loads(default_path.read_text())


@app.post('/api/resume')
async def save_resume(request: Request, user_id: str = Depends(get_current_user)):
    data = await request.json()
    TrackerAgent().save_resume(user_id, data)
    return {'ok': True}


# ── Interview Rounds ───────────────────────────────────────────────────────────

@app.get('/api/interview/{job_id}')
async def get_interview_rounds(job_id: str, user_id: str = Depends(get_current_user)):
    rounds = TrackerAgent().get_interview_rounds(user_id, job_id)
    return {'rounds': rounds}


@app.post('/api/interview/{job_id}')
async def add_interview_round(job_id: str, request: Request, user_id: str = Depends(get_current_user)):
    data = await request.json()
    round_type = data.get('round_type', 'technical')
    scheduled_at = data.get('scheduled_at')
    notes = data.get('notes')
    round_dict = TrackerAgent().add_interview_round(user_id, job_id, round_type, scheduled_at=scheduled_at, notes=notes)
    return round_dict


@app.patch('/api/interview/round/{round_id}')
async def update_interview_round(round_id: str, request: Request, user_id: str = Depends(get_current_user)):
    data = await request.json()
    updated = TrackerAgent().update_interview_round(
        user_id, round_id,
        result=data.get('result'),
        notes=data.get('notes'),
        scheduled_at=data.get('scheduled_at'),
    )
    if not updated:
        return JSONResponse({'error': 'Round not found'}, status_code=404)
    return updated


@app.delete('/api/interview/round/{round_id}')
async def delete_interview_round(round_id: str, user_id: str = Depends(get_current_user)):
    TrackerAgent().delete_interview_round(user_id, round_id)
    return {'ok': True}


# ── Follow-ups ─────────────────────────────────────────────────────────────────

@app.get('/api/followups')
async def get_followups(user_id: str = Depends(get_current_user)):
    from datetime import timedelta
    cutoff = (datetime.now() - timedelta(days=7)).isoformat()
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = True
        rows = conn.execute("""
            SELECT j.id, j.title, j.company, j.url, j.source, j.location, j.salary,
                   j.date_found, j.score, j.score_reason, j.starred,
                   a.status, a.date_applied, a.notes, a.last_updated, a.cv_path, a.cover_letter_path
            FROM jobs j
            JOIN applications a ON j.id = a.job_id
            WHERE j.user_id = ? AND a.status = 'applied' AND a.date_applied <= ?
            ORDER BY a.date_applied ASC
        """, (user_id, cutoff)).fetchall()
    return {'jobs': rows}


@app.post('/api/followups/notify')
async def notify_followups(user_id: str = Depends(get_current_user)):
    """Push the current follow-up list (applications 7+ days old, no status
    update) to Telegram — same data /api/followups shows the dashboard, just
    pushed somewhere that doesn't require remembering to check."""
    followups = await get_followups(user_id)
    jobs = followups['jobs']
    notifier = TelegramNotifierAgent()
    if not notifier.enabled:
        return JSONResponse(
            {'error': 'Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.'},
            status_code=400,
        )
    loop = asyncio.get_event_loop()
    sent = await loop.run_in_executor(None, lambda: notifier.send_followup_digest(jobs))
    if not sent:
        return JSONResponse({'error': 'Telegram send failed.'}, status_code=502)
    return {'ok': True, 'count': len(jobs)}


# ── Batch apply (email/telegram/browser, automatic or review-then-send) ────────

@app.get('/api/settings/auto-apply-mode')
async def get_auto_apply_mode(user_id: str = Depends(get_current_user)):
    return {'mode': TrackerAgent().get_setting(user_id, 'auto_apply_mode', 'review')}


@app.post('/api/settings/auto-apply-mode')
async def set_auto_apply_mode(mode: str, user_id: str = Depends(get_current_user)):
    if mode not in ('automatic', 'review'):
        return JSONResponse({'error': 'mode must be "automatic" or "review"'}, status_code=400)
    TrackerAgent().set_setting(user_id, 'auto_apply_mode', mode)
    return {'ok': True, 'mode': mode}


@app.post('/api/batch/run')
async def run_batch(channel: str, job_ids: str = Query(...), mode: str = Query(default=''), force: bool = Query(default=False),
                     user_id: str = Depends(get_current_user)):
    """job_ids: comma-separated. mode defaults to the persisted auto-apply-mode
    setting if not passed explicitly. channel: email | telegram | browser."""
    ids = [j.strip() for j in job_ids.split(',') if j.strip()]
    if not ids:
        return JSONResponse({'error': 'job_ids is required'}, status_code=400)
    if channel not in ('email', 'telegram', 'browser'):
        return JSONResponse({'error': 'channel must be email, telegram, or browser'}, status_code=400)

    tracker = TrackerAgent()
    effective_mode = mode or tracker.get_setting(user_id, 'auto_apply_mode', 'review')

    loop = asyncio.get_event_loop()
    if channel == 'email':
        from agents.batch_applier import run_email_batch
        result = await loop.run_in_executor(None, lambda: run_email_batch(user_id, ids, effective_mode, force))
    elif channel == 'telegram':
        from agents.batch_applier import run_telegram_batch
        result = await loop.run_in_executor(None, lambda: run_telegram_batch(user_id, ids, force))
    else:  # browser — always review, never auto-submits regardless of mode
        from agents.batch_applier import run_browser_batch
        result = await loop.run_in_executor(None, lambda: run_browser_batch(user_id, ids, force))
    return result


@app.get('/api/batch/{batch_id}')
async def get_batch(batch_id: str, user_id: str = Depends(get_current_user)):
    batch = TrackerAgent().get_batch(user_id, batch_id)
    if not batch:
        return JSONResponse({'error': 'Batch not found'}, status_code=404)
    return batch


@app.post('/api/batch/{batch_id}/items/{item_id}/approval')
async def set_batch_item_approval(batch_id: str, item_id: str, approved: bool):
    TrackerAgent().set_batch_item_approval(item_id, approved)
    return {'ok': True}


@app.post('/api/batch/{batch_id}/send')
async def send_batch(batch_id: str, user_id: str = Depends(get_current_user)):
    """Confirm-then-send for a review-mode EMAIL batch. Browser-channel
    batches have nothing to "send" here — the user finishes those by hand
    in their own browser using the screenshot as a guide."""
    from agents.batch_applier import send_staged_batch
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: send_staged_batch(user_id, batch_id))
    if result.get('error'):
        return JSONResponse(result, status_code=404)
    return result


# ── Blacklist ──────────────────────────────────────────────────────────────────

@app.get('/api/blacklist')
async def get_blacklist(user_id: str = Depends(get_current_user)):
    companies = TrackerAgent().get_blacklisted(user_id)
    return {'companies': companies}


# ── User Profile (per-user, stored in Postgres — falls back to config.py's
# defaults for a brand-new user who hasn't saved yet) ───────────────────────

def _default_profile() -> dict:
    from config import USER_PROFILE, JOB_PREFERENCES
    return {
        'onboarding_completed': False,
        'name': USER_PROFILE.get('name', ''),
        'email': USER_PROFILE.get('email', ''),
        'phone': USER_PROFILE.get('phone', ''),
        'linkedin': USER_PROFILE.get('linkedin', ''),
        'github': USER_PROFILE.get('github', ''),
        'portfolio': USER_PROFILE.get('portfolio', ''),
        'location': USER_PROFILE.get('location', ''),
        'college': USER_PROFILE.get('college', ''),
        'degree': USER_PROFILE.get('degree', ''),
        'cgpa': USER_PROFILE.get('cgpa', ''),
        'grad_year': USER_PROFILE.get('grad_year', ''),
        'skills': JOB_PREFERENCES.get('tech_keywords', []),
        'target_roles': JOB_PREFERENCES.get('target_roles', []),
        'location_preference': JOB_PREFERENCES.get('locations', []),
        'target_lpa': {
            'min': JOB_PREFERENCES.get('min_package_lpa', 8),
            'max': JOB_PREFERENCES.get('target_package_lpa', 12),
        },
        'skill_weights': {},
        'enabled_sources': list(JobFinderAgent.ALL_SOURCE_KEYS),
        'min_score_threshold': MIN_APPLY_SCORE,
        'salary_weight': 50,
        'location_weight': 50,
        'smtp_email': '',
        'smtp_app_password': '',
    }


@app.get('/api/user/profile')
async def get_user_profile(user_id: str = Depends(get_current_user)):
    data = TrackerAgent().get_profile(user_id)
    return data if data is not None else _default_profile()


@app.patch('/api/user/profile')
async def update_user_profile(request: Request, user_id: str = Depends(get_current_user)):
    data = await request.json()
    tracker = TrackerAgent()
    existing = tracker.get_profile(user_id) or _default_profile()
    existing.update(data)
    tracker.save_profile(user_id, existing)
    return {'ok': True}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000, reload=False)
