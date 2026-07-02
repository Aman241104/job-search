# Job Search Progress — Aman Patel

> Auto-updated each session. Last updated: 2026-06-16

---

## Current Status

| Metric | Count |
|---|---|
| Jobs Found | 226+ (DB populated as of session 2) |
| Applied | 0 |
| Interviewing | 0 |
| Offers | 0 |
| Rejected | 0 |
| Ghosted | 0 |

**Backup offer target:** 1+ offer above 8 LPA before TCS joining  
**TCS Digital offer:** 7 LPA (no joining date yet as of 2026-06-15)

---

## System Built — Full Stack Job Search Dashboard

### How to Run
```bash
cd /home/whoever/personal-project/job-serach
./run_web.sh        # Terminal 1 — FastAPI backend on port 8000
./run_nextjs.sh     # Terminal 2 — Next.js frontend on port 3000
# Open http://localhost:3000
```

### Architecture
- **Backend:** FastAPI (`app.py`) on port 8000
- **Frontend:** Next.js 14 App Router (`web/`) on port 3000
- **AI:** Google Gemini 2.0 Flash via `claude_client.py` → `ask_gemini()`
- **DB:** SQLite at `data/applications.db` via `agents/tracker.py`
- **Python venv:** `.venv/bin/python` — system has no pip; venv has all packages

### Pages
| Route | What it does |
|---|---|
| `/dashboard` | Stats, Find Jobs SSE, Top Opportunities, Activity chart, Follow-up reminders, Onboarding empty state |
| `/jobs` | Grid + Kanban view, bulk select/actions, keyboard shortcuts, filter badge, drawer detail view |
| `/analytics` | Funnel (with health indicator), Source ROI table, Salary insights, Score distribution, Weekly activity strip |
| `/train` | AI interview coach — 8 topics, scored Q&A sessions via Gemini |
| `/links` | 17 curated job board cards (with AUTO badge for scraped sources) |
| `/resume` | Visual resume editor — Profile/Skills/Projects/Achievements tabs, unsaved warning, retry on error |
| `/profile` | User profile editor — name, skills, target roles, LPA range, links |

### API Endpoints (app.py)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stats` | KPIs: total, applied, high_match, avg_score |
| GET | `/api/stats/timeline` | Jobs found+applied per day last 30 days |
| GET | `/api/jobs` | Paginated — all filters including starred |
| GET | `/api/jobs/{id}` | Single job (queries SQLite, includes description) |
| POST | `/api/jobs/{id}/star` | Toggle bookmark |
| POST | `/api/jobs/bulk` | Bulk status/star/delete — body: `{action, ids, value?}` |
| POST | `/api/jobs/{id}/blacklist` | Toggle company blacklist |
| GET | `/api/blacklist` | List blacklisted companies |
| POST | `/api/notes/{id}` | Save notes |
| POST | `/api/apply/{id}` | Generate CV+cover via Gemini, marks applied |
| POST | `/api/update/{id}` | Update status |
| GET | `/api/find` | SSE stream: scrape → score → save (9 sources) |
| GET | `/api/export` | Download job_tracker.xlsx |
| GET | `/api/files/cv/{id}` | Download CV markdown |
| GET | `/api/files/cover/{id}` | Download cover letter |
| GET | `/api/files/cv/{id}/content` | Return CV markdown as JSON `{content}` for inline preview |
| GET | `/api/followups` | Jobs applied 7+ days ago with no status change |
| GET | `/api/analytics` | Funnel, source breakdown, score distribution, top companies |
| GET | `/api/interview/{job_id}` | Get interview rounds for a job |
| POST | `/api/interview/{job_id}` | Add interview round |
| PATCH | `/api/interview/round/{id}` | Update round result/notes/date |
| DELETE | `/api/interview/round/{id}` | Delete round |
| GET | `/api/resume` | Returns master_resume.json |
| POST | `/api/resume` | Saves master_resume.json |
| GET | `/api/user/profile` | Returns user profile (data/user_profile.json → config.py fallback) |
| PATCH | `/api/user/profile` | Updates user_profile.json |
| GET | `/api/train/topics` | 8 training topics |
| POST | `/api/train/start` | Start session → `{session_id, topic_key, topic_name, message}` |
| POST | `/api/train/chat` | Send answer → `{response, score, avg_score}` |
| GET | `/api/train/progress` | `{sessions_completed, avg_score, topics_covered, total_messages}` |

### Job Sources (agents/job_finder.py)
| Source | Status | Volume/Run | Notes |
|---|---|---|---|
| **Internshala** | ✅ Working | ~280 raw | Primary. 7 slugs × ~40 jobs. Best for India freshers. |
| **LinkedIn** | ✅ Working | ~38 | Guest API. No auth. 6 searches (React/Frontend/FullStack × India + Ahmedabad). |
| **Jobicy** | ✅ Working | ~4 | Remote API. Filters by jobLevel for senior roles. |
| **WeWorkRemotely** | ✅ Working | ~24 | RSS feed. Worldwide remote. |
| **Arbeitnow** | ✅ Working | ~3–10 | Free API. Tech tags filter. |
| **Remotive** | ✅ Working | ~20 | REST API, title keyword filter. |
| **RemoteOK** | ✅ Working | ~15 | Tag-specific URLs. Title filter. |
| **Remote.co** | ✅ Working | ~10 | RSS feed, lxml-xml parser. |
| **Adzuna** | ⚙️ Optional | ~30 | Needs `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` in .env |
| **Naukri/Indeed/Wellfound etc.** | ❌ Blocked | 0 | Bot detection. Cookie-based approach deferred. |

### SQLite DB (data/applications.db)
Tables: `jobs`, `applications`, `training_sessions`, `blacklisted_companies`, `interview_rounds`
Indexes: score, source, date_found, starred, status, job_id

### Frontend Components
| Component | Notes |
|---|---|
| `StatCard` | GSAP counter 0→value |
| `ScoreRing` | SVG ring, color by score |
| `JobCard` | Star, notes, CV/cover download, status dropdown, Apply, onView prop, bulk select checkbox |
| `JobDrawer` | 3 tabs: Overview/Track/CV. Timeline, interview rounds, CV preview, blacklist, copy dropdown |
| `KanbanCard` | Compact inline component in jobs page for kanban view |
| `FindButton` | SSE EventSource, animated progress bar |
| `TrainChat` | Scored Q&A, markdown rendering |
| `Sidebar` | 7 nav items + Search (⌘K) + Export + user avatar |
| `Toast` | GSAP slide-in/out notifications |
| `GlobalSearch` | Cmd+K command palette — searches jobs, keyboard nav, routes to /jobs?open={id} |

### Design System
- **Theme:** Deep space dark — bg `#050508`, animated dot-grid
- **Accents:** Green `#63ffb2` · Cyan `#67e8f9` · Yellow `#fbbf24` · Purple `#a78bfa`
- **Fonts:** Fragment Mono + Outfit (Google Fonts)
- **Animations:** GSAP `fromTo` (never `from` — causes opacity:0 bug), stagger entrance, SVG ring, counter, card hover

### Known Issues / Next Steps
- ⚠️ **Gemini API key exhausted** — get fresh key at `aistudio.google.com/apikey`, paste into `.env`
- System works without key (keyword scoring still runs; CV gen and interview training won't work)
- **Tomorrow (deferred):** Cookie-based scrapers for Naukri + Cutshort
- Playwright + playwright-stealth installed but Naukri still blocks even with stealth

---

## Environment (.env)
```
GEMINI_API_KEY=your_new_key   # aistudio.google.com/apikey
ADZUNA_APP_ID=xxx              # Optional — developer.adzuna.com
ADZUNA_APP_KEY=xxx
SMTP_EMAIL=patelaman0241@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
```

---

## Weekly Log

### Sessions 1–2 (2026-06-15) — System Built
- [x] Multi-agent Python job search system (JobFinder, CVCustomizer, Tracker, Trainer, Applier)
- [x] FastAPI backend with SSE streaming
- [x] Next.js 14 frontend — dark mode, GSAP, Fragment Mono + Outfit
- [x] Switched from Claude CLI → direct Gemini API
- [x] Fixed bugs: pagination, training API, sort wiring
- [x] Star/bookmark, inline notes editor, CV/cover download
- [x] Analytics page: funnel, score distribution, source breakdown
- [x] "Do This Next" action queue on dashboard
- [x] Salary (min LPA) + freshness (last N days) filters
- [x] Scrapers: removed Naukri, added WeWorkRemotely + Arbeitnow

### Session 3 (2026-06-16 morning) — Scrapers + UI Polish
- [x] JobDrawer component (GSAP slide-in, full job details)
- [x] Resume editor page (`/resume`) with 4 tabs
- [x] Resume API endpoints (GET/POST /api/resume)
- [x] Sidebar: added Resume nav item
- [x] 5 new scrapers: LinkedIn guest API, Remotive, RemoteOK, Remote.co
- [x] Apply flow fixed (reads SQLite not found_jobs.json)
- [x] `/api/jobs/{id}` returns description field
- [x] Jobs page: filter badge, clear button, correct SOURCE_OPTIONS
- [x] Links page rewrite: 17 platforms, AUTO badge, stats bar
- [x] Fixed GSAP opacity bug (gsap.from → gsap.fromTo) across all pages

### Session 4 (2026-06-16 afternoon) — Major Feature Expansion
- [x] **Backend:** 6 DB indexes, 3 new tables (training_sessions, blacklisted_companies, interview_rounds)
- [x] **Backend:** 13 new API endpoints (timeline, bulk, blacklist, interviews, followups, CV content, user profile)
- [x] **Backend:** Training sessions now persisted to SQLite
- [x] **Dashboard:** Activity SVG chart (found vs applied/30 days), follow-up reminders, onboarding empty state, velocity stat, dynamic name
- [x] **Analytics:** Source ROI table, salary insights, funnel health indicator, weekly strip, score trend insight
- [x] **Jobs page:** Kanban board view, bulk select + actions, keyboard shortcuts (j/k/Enter/s/?), high-match filter, back-to-top
- [x] **JobDrawer:** 3 tabs (Overview/Track/CV), application timeline, interview rounds tracker, CV preview, company blacklist, copy-as-markdown
- [x] **Resume page:** Unsaved changes warning, char count, add/remove project/category, retry on error, skeleton loading
- [x] **New `/profile` page:** Edit name, skills, target roles, LPA range, education, links
- [x] **GlobalSearch component:** Cmd+K command palette, keyboard nav, opens job drawer directly
- [x] **Sidebar:** Profile + Search nav items, ⌘K hint

- [ ] **Next:** Get fresh Gemini API key (system works without it for scraping/browsing)
- [ ] **Next:** Cookie-based scraper for Naukri + Cutshort
- [ ] **Next:** Run "Find New Jobs" with all 9 sources
- [ ] **Next:** Apply to top 5 scored jobs

---

## Application Log

| Date | Company | Role | Source | Score | Status | Notes |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

---

## Training Sessions

| Date | Topic | Avg Score | Weak Areas |
|---|---|---|---|
| — | — | — | — |

---

## Platform Accounts

| Platform | Profile URL | Status |
|---|---|---|
| LinkedIn | linkedin.com/in/aman-patel | Active |
| Naukri | — | Set up needed |
| Wellfound | — | Set up needed |
| Internshala | — | Set up needed |
| Cutshort | — | Set up needed |
