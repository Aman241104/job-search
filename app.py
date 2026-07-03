"""FastAPI backend for the Job Search Dashboard."""
import asyncio
import json
import math
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.tracker import TrackerAgent
from agents.job_finder import JobFinderAgent
from agents.cv_customizer import CVCustomizerAgent
from agents.job_applier import JobApplierAgent, extract_email_from_description
from agents.telegram_notifier import TelegramNotifierAgent
from config import OUTPUT_DIR, DATA_DIR, MIN_APPLY_SCORE
from claude_client import GeminiChat, ask_gemini
from agents.trainer import TRAINING_TOPICS, SYSTEM_PROMPTS

app = FastAPI(title='Job Search AI', version='1.0.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

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


# ── Stats ──────────────────────────────────────────────────────────────────────

@app.get('/api/stats')
async def get_stats():
    tracker = TrackerAgent()
    stats = tracker.get_stats()
    top = tracker.get_unapplied_top_jobs(min_score=40, limit=20)
    stats['top_opportunities'] = len(top)

    stats['applied']      = stats.get('applied', 0)
    stats['interviewing'] = stats.get('interviewing', 0)
    stats['offers']       = stats.get('offer', 0)
    stats['found']        = stats.get('found', 0)
    stats['rejected']     = stats.get('rejected', 0)
    stats['ghosted']      = stats.get('ghosted', 0)

    # Score breakdown from the database directly, not JobFinderAgent.get_all_jobs()
    # (that reads a local found_jobs.json cache file — regenerable local scrape
    # state, gitignored, and absent entirely on a fresh deploy like Render's,
    # where this silently produced all-zero score stats despite jobs.score
    # being right there in the same DB every other stat on this page uses).
    with tracker._get_conn() as conn:
        score_rows = conn.execute("SELECT score FROM jobs").fetchall()
    scores = [row[0] or 0 for row in score_rows]
    stats['score_80_plus']  = sum(1 for s in scores if s >= 80)
    stats['score_60_79']    = sum(1 for s in scores if 60 <= s < 80)
    stats['score_40_59']    = sum(1 for s in scores if 40 <= s < 60)
    stats['score_below_40'] = sum(1 for s in scores if s < 40)
    stats['high_match']     = sum(1 for s in scores if s >= 60)
    stats['avg_score']      = round(sum(scores) / len(scores)) if scores else 0
    return stats


@app.get('/api/stats/timeline')
async def get_stats_timeline():
    import sqlite3 as _sqlite3
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
        # SUBSTR(x, 1, 10) instead of SQLite's DATE(x) — date_found/date_applied
        # are stored as ISO8601 text ("YYYY-MM-DDTHH:MM:SS..."), so the first 10
        # characters are always the date portion. Works identically on SQLite
        # and Postgres, unlike DATE() which SQLite supports natively but Postgres
        # doesn't (Postgres needs a ::date cast instead) — this avoids branching.
        found_rows = conn.execute("""
            SELECT SUBSTR(date_found, 1, 10) as day, COUNT(*) as cnt
            FROM jobs
            WHERE SUBSTR(date_found, 1, 10) >= ?
            GROUP BY day
        """, (start.isoformat(),)).fetchall()
        for row in found_rows:
            day = row[0]
            if day in timeline_map:
                timeline_map[day]['found'] = row[1]

        applied_rows = conn.execute("""
            SELECT SUBSTR(date_applied, 1, 10) as day, COUNT(*) as cnt
            FROM applications
            WHERE status != 'found' AND SUBSTR(date_applied, 1, 10) >= ?
            GROUP BY day
        """, (start.isoformat(),)).fetchall()
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
):
    tracker = TrackerAgent()
    all_apps = tracker.get_all_applications()

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
            import re
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
async def get_job(job_id: str):
    import sqlite3
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("""
            SELECT j.id, j.title, j.company, j.description, j.url, j.source, j.location,
                   j.salary, j.date_found, j.score, j.score_reason, j.starred,
                   a.status, a.date_applied, a.notes, a.cv_path, a.cover_letter_path
            FROM jobs j
            LEFT JOIN applications a ON j.id = a.job_id
            WHERE j.id = ?
        """, (job_id,)).fetchone()
    if not row:
        return JSONResponse({'error': 'not found'}, status_code=404)
    return dict(row)


@app.post('/api/jobs/{job_id}/star')
async def star_job(job_id: str):
    starred = TrackerAgent().toggle_star(job_id)
    return {'starred': starred}


@app.post('/api/jobs/{job_id}/blacklist')
async def blacklist_job_company(job_id: str):
    import sqlite3 as _sqlite3
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = _sqlite3.Row
        row = conn.execute("SELECT company FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    company = row['company']
    blacklisted = tracker.toggle_blacklist(company)
    return {'blacklisted': blacklisted, 'company': company}


@app.post('/api/jobs/bulk')
async def bulk_update_jobs(request: Request):
    import sqlite3 as _sqlite3
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
                    WHERE job_id=?
                """, (value, now, date_applied or '', job_id))
                updated += 1
            conn.commit()
    elif action == 'star':
        star_val = 1 if value == 'true' else 0
        with tracker._get_conn() as conn:
            for job_id in ids:
                conn.execute("UPDATE jobs SET starred=? WHERE id=?", (star_val, job_id))
                updated += 1
            conn.commit()
    elif action == 'delete':
        with tracker._get_conn() as conn:
            for job_id in ids:
                conn.execute("DELETE FROM applications WHERE job_id=?", (job_id,))
                conn.execute("DELETE FROM jobs WHERE id=?", (job_id,))
                updated += 1
            conn.commit()
    return {'updated': updated}


# ── Files (CV / Cover Letter download) ────────────────────────────────────────

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

_find_running = False


@app.get('/api/find')
async def find_jobs_stream():
    global _find_running
    if _find_running:
        async def already():
            yield 'data: ' + json.dumps({'type': 'error', 'message': 'Job finder already running'}) + '\n\n'
        return StreamingResponse(already(), media_type='text/event-stream')

    async def generate():
        global _find_running
        _find_running = True
        try:
            yield 'data: ' + json.dumps({'type': 'start', 'message': 'Initializing job finder...'}) + '\n\n'
            await asyncio.sleep(0.1)

            loop = asyncio.get_event_loop()

            def run_finder():
                finder = JobFinderAgent()
                tracker = TrackerAgent()
                jobs = finder.find_jobs()
                added = sum(1 for j in jobs if tracker.add_job(j))
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
                            if notifier.send_job_alert(j, package['cv_path'], package['cover_letter_path'], package['cv_markdown']):
                                tracker.update_status(j['id'], 'found', notes='Telegram alert sent',
                                                       cv_path=package['cv_path'], cover_path=package['cover_letter_path'])
                                sent_count += 1
                        except Exception:
                            continue
                    return sent_count

                await loop.run_in_executor(None, notify_top)

            stats = TrackerAgent().get_stats()
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
            _find_running = False

    return StreamingResponse(
        generate(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


# ── Apply ──────────────────────────────────────────────────────────────────────

@app.post('/api/apply/{job_id}')
async def generate_application(job_id: str, force: bool = Query(default=False)):
    import sqlite3
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    job = dict(row)
    if (job.get('score') or 0) < MIN_APPLY_SCORE and not force:
        return JSONResponse({
            'error': f"Score {job.get('score', 0)} is below your quality gate ({MIN_APPLY_SCORE}). "
                     f"Pass ?force=true to generate anyway."
        }, status_code=400)
    loop = asyncio.get_event_loop()
    package = await loop.run_in_executor(None, lambda: CVCustomizerAgent().prepare_full_package(job))
    tracker = TrackerAgent()
    tracker.update_status(
        job_id, 'applied',
        cv_path=package.get('cv_path', ''),
        cover_path=package.get('cover_letter_path', ''),
    )
    return {
        'cv': package.get('cv_markdown', ''),
        'cover_letter': package.get('cover_letter', ''),
        'cv_path': package.get('cv_path', ''),
        'cover_path': package.get('cover_letter_path', ''),
        'apply_url': job.get('url', ''),
    }


@app.post('/api/email-apply/{job_id}')
async def email_apply(job_id: str, to_email: str = Query(default=''), force: bool = Query(default=False)):
    """Send the tailored CV+cover letter (as PDF attachments) directly to a
    recruiter's email via the SMTP sender in job_applier.py. If to_email isn't
    supplied, tries to auto-detect one from the job's own description text."""
    import sqlite3
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    job = dict(row)
    if (job.get('score') or 0) < MIN_APPLY_SCORE and not force:
        return JSONResponse({
            'error': f"Score {job.get('score', 0)} is below your quality gate ({MIN_APPLY_SCORE}). "
                     f"Pass ?force=true to send anyway."
        }, status_code=400)

    email = to_email or extract_email_from_description(job.get('description', ''))
    if not email:
        return JSONResponse(
            {'error': 'No email address found in this listing — pass one explicitly with ?to_email=...'},
            status_code=400,
        )

    loop = asyncio.get_event_loop()
    package = await loop.run_in_executor(None, lambda: CVCustomizerAgent().prepare_full_package(job))
    if 'generation failed' in package.get('cv_markdown', ''):
        return JSONResponse({'error': 'CV generation failed, not sending email — try again.'}, status_code=502)

    applier = JobApplierAgent()
    sent = await loop.run_in_executor(None, lambda: applier.send_email_application(job, email, package))
    if not sent:
        return JSONResponse({'error': 'Email failed to send — check SMTP_PASSWORD in .env.'}, status_code=502)
    return {'ok': True, 'sent_to': email}


@app.post('/api/telegram-notify/{job_id}')
async def telegram_notify(job_id: str, force: bool = Query(default=False)):
    """For listings with no direct recruiter email (the majority) — generates
    the tailored CV/cover-letter and pushes job link + details + both PDFs to
    Telegram, so applying by hand can happen from a phone whenever there's a
    free moment, instead of needing this dashboard open."""
    import sqlite3
    tracker = TrackerAgent()
    notifier = TelegramNotifierAgent()
    if not notifier.enabled:
        return JSONResponse(
            {'error': 'Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.'},
            status_code=400,
        )

    with tracker._get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return JSONResponse({'error': 'Job not found'}, status_code=404)
    job = dict(row)
    if (job.get('score') or 0) < MIN_APPLY_SCORE and not force:
        return JSONResponse({
            'error': f"Score {job.get('score', 0)} is below your quality gate ({MIN_APPLY_SCORE}). "
                     f"Pass ?force=true to notify anyway."
        }, status_code=400)

    loop = asyncio.get_event_loop()
    package = await loop.run_in_executor(None, lambda: CVCustomizerAgent().prepare_full_package(job))
    if 'generation failed' in package.get('cv_markdown', ''):
        return JSONResponse({'error': 'CV generation failed, not notifying — try again.'}, status_code=502)

    sent = await loop.run_in_executor(
        None, lambda: notifier.send_job_alert(job, package['cv_path'], package['cover_letter_path'], package['cv_markdown'])
    )
    if not sent:
        return JSONResponse({'error': 'Telegram send failed — check TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID.'}, status_code=502)

    tracker.update_status(job_id, 'found', notes='Telegram alert sent',
                           cv_path=package['cv_path'], cover_path=package['cover_letter_path'])
    return {'ok': True}


@app.post('/api/update/{job_id}')
async def update_job(job_id: str, status: str, notes: str = ''):
    TrackerAgent().update_status(job_id, status, notes=notes)
    return {'ok': True}


@app.post('/api/notes/{job_id}')
async def save_notes(job_id: str, notes: str = Query(...)):
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.execute(
            "UPDATE applications SET notes=?, last_updated=? WHERE job_id=?",
            (notes, datetime.now().isoformat(), job_id)
        )
        conn.commit()
    return {'ok': True}


# ── Export ─────────────────────────────────────────────────────────────────────

@app.get('/api/export')
async def export_excel():
    path = TrackerAgent().export_to_excel()
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
async def start_training(topic_key: str):
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


def _rehydrate_chat_session(session_id: str) -> dict | None:
    """Reconstruct an in-memory chat session from its persisted row after a
    server restart (Render can restart/redeploy at any time — _chat_sessions
    is process-local and doesn't survive that). Returns None if nothing was
    ever persisted for this session (e.g. it died before the first exchange
    completed) — that case genuinely can't be recovered."""
    row = TrackerAgent().get_training_session(session_id)
    if not row:
        return None
    topic_key = row.get('topic_key', '')
    topic_id = TRAINING_TOPICS.get(topic_key, (None, 'behavioral'))[1]
    system = SYSTEM_PROMPTS.get(topic_id, SYSTEM_PROMPTS['behavioral'])
    chat = GeminiChat(system=system, temperature=0.8)
    messages = row.get('messages', [])
    chat.history = [
        {
            'role': 'model' if m['role'] == 'assistant' else 'user',
            'parts': [{'text': m.get('content', '')}],
        }
        for m in messages
    ]
    scores = [m['score'] for m in messages if m.get('score')]
    return {
        'chat': chat,
        'topic': row.get('topic_name', ''),
        'topic_key': topic_key,
        'scores': scores,
        'messages': messages,
    }


@app.post('/api/train/chat')
async def training_chat(session_id: str, message: str):
    import re
    if session_id not in _chat_sessions:
        rehydrated = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _rehydrate_chat_session(session_id)
        )
        if not rehydrated:
            return JSONResponse({'error': 'Session expired'}, status_code=400)
        _chat_sessions[session_id] = rehydrated
    session = _chat_sessions[session_id]
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
    # Persist session to SQLite
    try:
        tracker = TrackerAgent()
        tracker.save_training_session(
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
async def training_progress():
    tracker = TrackerAgent()
    progress = tracker.get_training_progress()
    # Fall back to training_log.json if SQLite table is empty
    if progress['sessions_completed'] == 0:
        log_file = Path(DATA_DIR) / 'training_log.json'
        if log_file.exists():
            try:
                log = json.loads(log_file.read_text())
                if log:
                    all_scores = [s for entry in log for s in entry.get('scores', [])]
                    topics_covered = list(set(entry.get('topic', '') for entry in log))
                    total_msgs = sum(entry.get('num_questions', 0) for entry in log)
                    return {
                        'sessions_completed': len(log),
                        'avg_score': round(sum(all_scores) / len(all_scores), 1) if all_scores else 0,
                        'topics_covered': topics_covered,
                        'total_messages': total_msgs,
                    }
            except Exception:
                pass
    return progress


# ── Analytics ──────────────────────────────────────────────────────────────────

@app.get('/api/analytics')
async def get_analytics():
    tracker = TrackerAgent()
    all_apps = tracker.get_all_applications()

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


# ── Resume ─────────────────────────────────────────────────────────────────────

@app.get('/api/resume')
async def get_resume():
    resume_path = Path(DATA_DIR) / 'master_resume.json'
    if not resume_path.exists():
        return JSONResponse({'error': 'Resume not found'}, status_code=404)
    return json.loads(resume_path.read_text())


@app.post('/api/resume')
async def save_resume(request: Request):
    data = await request.json()
    resume_path = Path(DATA_DIR) / 'master_resume.json'
    resume_path.write_text(json.dumps(data, indent=2))
    return {'ok': True}


# ── Interview Rounds ───────────────────────────────────────────────────────────

@app.get('/api/interview/{job_id}')
async def get_interview_rounds(job_id: str):
    tracker = TrackerAgent()
    rounds = tracker.get_interview_rounds(job_id)
    return {'rounds': rounds}


@app.post('/api/interview/{job_id}')
async def add_interview_round(job_id: str, request: Request):
    data = await request.json()
    round_type = data.get('round_type', 'technical')
    scheduled_at = data.get('scheduled_at')
    notes = data.get('notes')
    tracker = TrackerAgent()
    round_dict = tracker.add_interview_round(job_id, round_type, scheduled_at=scheduled_at, notes=notes)
    return round_dict


@app.patch('/api/interview/round/{round_id}')
async def update_interview_round(round_id: str, request: Request):
    data = await request.json()
    tracker = TrackerAgent()
    updated = tracker.update_interview_round(
        round_id,
        result=data.get('result'),
        notes=data.get('notes'),
        scheduled_at=data.get('scheduled_at'),
    )
    if not updated:
        return JSONResponse({'error': 'Round not found'}, status_code=404)
    return updated


@app.delete('/api/interview/round/{round_id}')
async def delete_interview_round(round_id: str):
    TrackerAgent().delete_interview_round(round_id)
    return {'ok': True}


# ── Follow-ups ─────────────────────────────────────────────────────────────────

@app.get('/api/followups')
async def get_followups():
    import sqlite3 as _sqlite3
    from datetime import timedelta
    cutoff = (datetime.now() - timedelta(days=7)).isoformat()
    tracker = TrackerAgent()
    with tracker._get_conn() as conn:
        conn.row_factory = _sqlite3.Row
        rows = conn.execute("""
            SELECT j.id, j.title, j.company, j.url, j.source, j.location, j.salary,
                   j.date_found, j.score, j.score_reason, j.starred,
                   a.status, a.date_applied, a.notes, a.last_updated, a.cv_path, a.cover_letter_path
            FROM jobs j
            JOIN applications a ON j.id = a.job_id
            WHERE a.status = 'applied' AND a.date_applied <= ?
            ORDER BY a.date_applied ASC
        """, (cutoff,)).fetchall()
    return {'jobs': [dict(r) for r in rows]}


@app.post('/api/followups/notify')
async def notify_followups():
    """Push the current follow-up list (applications 7+ days old, no status
    update) to Telegram — same data /api/followups shows the dashboard, just
    pushed somewhere that doesn't require remembering to check."""
    followups = await get_followups()
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


# ── Blacklist ──────────────────────────────────────────────────────────────────

@app.get('/api/blacklist')
async def get_blacklist():
    tracker = TrackerAgent()
    companies = tracker.get_blacklisted()
    return {'companies': companies}


# ── User Profile ───────────────────────────────────────────────────────────────

@app.get('/api/user/profile')
async def get_user_profile():
    from config import USER_PROFILE, JOB_PREFERENCES
    profile_override_path = Path(DATA_DIR) / 'user_profile.json'
    if profile_override_path.exists():
        try:
            return json.loads(profile_override_path.read_text())
        except Exception:
            pass
    return {
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
    }


@app.patch('/api/user/profile')
async def update_user_profile(request: Request):
    data = await request.json()
    profile_path = Path(DATA_DIR) / 'user_profile.json'
    if profile_path.exists():
        try:
            existing = json.loads(profile_path.read_text())
        except Exception:
            existing = {}
    else:
        # Seed with defaults from config
        from config import USER_PROFILE, JOB_PREFERENCES
        existing = {
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
        }
    existing.update(data)
    profile_path.write_text(json.dumps(existing, indent=2))
    return {'ok': True}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000, reload=False)
