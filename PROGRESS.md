# Job Search Progress — Aman Patel

> Auto-updated each session. Last updated: 2026-09-24

---

## Current Status

| Metric | Count |
|---|---|
| Jobs Found | 900 (Postgres, as of session 6 — see note below) |
| Applied | 4 |
| Interviewing | 0 |
| Offers | 0 |
| Rejected | 0 |
| Ghosted | 0 |

**Backup offer target:** 1+ offer above 8 LPA before TCS joining  
**TCS Digital offer:** 7 LPA (no joining date yet as of 2026-06-15)

**⚠️ DB migration note (session 6):** the app migrated from SQLite (`data/applications.db`) to
multi-tenant Postgres/Supabase (`DATABASE_URL` in `.env`) sometime between session 4 and 6 — this
was never logged here. `data/applications.db` is now a **stale, unused leftover file**; don't trust
its contents. The CLI (`main.py`) always resolves to the operator's own account via `SMTP_EMAIL`
(see `orchestrator.py`) — real data lives in Postgres under that user row. Check via
`agents.tracker.TrackerAgent().get_user_by_email(SMTP_EMAIL)` then query `jobs`/`applications` with
that `user_id`, not by opening the sqlite file directly.

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

### Session 5 (2026-07-26) — Backlog from the Digital Heroes submission push

Aman spent the last stretch heads-down on `dh-fullstack-task` (Full Stack role submission,
Task A + Task B), plus already-shipped `dh-web-task` and `dh-shopify-task` submissions. None of
that work is reflected in this project yet. Next agent picking this up should do the following,
in this order:

- [ ] **Add the 3 Digital Heroes submissions to `data/master_resume.json`'s `projects[]`.**
  Each needs: `name`, `description`, `tech_stack`, `live_url`, `github_url`, `bullets` (same shape
  as the existing WhatsApp AI Agent entry — see that entry as the template).
  - **Docket** (Full Stack, `dh-fullstack-task`) — lead management platform, Next.js + Supabase
    RLS + real-time + AI Copilot (NVIDIA tool-calling, 4 scoped tools) + hybrid AI lead scoring +
    native TOTP 2FA + admin IP allowlist + Sentry. Live: `dh-fullstack-task.vercel.app`. Repo:
    `github.com/Aman241104/dh-fullstack-task`. Pull the bullet-point framing straight from that
    repo's README.md (Feature list + Architecture sections) rather than re-deriving it.
  - **dh-web-task** (Web Development role) — marketing site, 98-100 Lighthouse across all 4 pages
    (mobile, production, throttled), plus a separate mobile-performance-audit deliverable
    (`dh-web-task-b-audit/` — diagnosed a real live site, 46→estimated-90+ fix path, root-caused a
    32%-of-page-weight unoptimized image).
  - **dh-shopify-task** — 3 custom Liquid sections + metafield-driven variant swatch feature +
    a live-store audit deliverable.
- [ ] **Pull "new skills learned" into `skills{}`.** From this session specifically: Postgres
  `security definer` functions as an RLS-safe pattern for narrow anon-role operations (rate
  limiting, duplicate detection, IP allowlisting — all without ever granting `anon` direct table
  access), Supabase Realtime (`postgres_changes` subscriptions, RLS-scoped), LLM tool-calling
  design for a *scoped* agent (exactly 4 tools, no service-role bypass — the tool layer inherits
  the same permission boundary a manual API call would), Supabase Auth native TOTP MFA
  (enrollment/challenge/verify flow, including the "qr_code is sometimes raw SVG, sometimes
  already a data URI" gotcha), GitHub Actions CI for a Next.js + Supabase stack, and diagnosing a
  real upstream framework bug (Next.js 16 silently not registering `proxy.ts` in its middleware
  manifest — traced via manifest inspection, not guessed).
- [ ] **Surface the current shortlisted jobs.** "Shortlisted" here means `tracker.py`'s existing
  `priority_jobs` query (score ≥75, `status='found'` — see `agents/tracker.py:1166`) — export or
  display that list so it's actually visible somewhere (dashboard already has a "high-match
  filter" per Session 4, so this may already be half-done — check before rebuilding).
- [ ] **Build a "Project Deep Dive" section in the `learning/` Obsidian vault**, inside
  `Big Tech Prep/` following its existing numbered-folder convention (`01 -` through
  `14 -`, next free number is `15`). This is the *reverse* of `trainer.py`'s existing `portfolio`
  topic (which has Aman explain his projects to an AI interviewer) — here the AI explains a
  project's architecture, key decisions, and tricky parts *to* Aman, sourced from
  `data/master_resume.json`'s `projects[]` entries (plus the real repos where more depth is
  needed than the resume bullets have). Concretely: one note per project
  (`15 - Project Deep Dives/01 WhatsApp AI Agent.md`, etc.), each covering: what it does, why it
  was built that way, the 2-3 hardest technical decisions and the reasoning behind them, and the
  most likely interview questions it'll draw. This is a genuinely new feature (a new `trainer.py`
  topic could reuse the pattern, or it can be static generated notes — worth 5 minutes deciding
  which before building either).

### Session 6 (2026-09-03) — Instagram/Substack company-list sweep, 1 real application

User shared two "companies hiring" sources (an Instagram infographic listing ~60 companies paying
30-90 LPA, and a Substack post listing ~65 India/remote companies with fresher role bands) and
asked to find and apply to openings at all of them. Ran the existing `find` pipeline plus 4 parallel
research agents checking direct company careers pages, then cross-referenced ~125 company names
against the job DB.

**Result: only 5 real, verified openings existed across all ~125 companies, and only 1 was
actually applyable.** Most "prestige" companies (Google, Microsoft, Salesforce, NVIDIA, Snowflake,
JPMorgan, Goldman Sachs, etc.) either had no fresher-level opening or their careers sites are
JS-rendered SPAs / bot-blocked, unreachable via WebFetch. Company-name substring matching against
scraped job titles has a high false-positive rate (e.g. "CRED" matching "Credo Health", "Intel"
matching inside "Intelligence") — normalize to alphanumeric and require length-4+ matches on both
sides before trusting a match.

Of the 5 real matches (Razorpay, Figma, Accenture, Infosys, Elastic):
- **Razorpay — Full Stack Builder (Bengaluru): ✅ applied** (Greenhouse form, manual submit).
  CV/cover letter used the batch-apply pipeline (`agents/batch_applier.py:run_browser_batch`) —
  generates CV+cover + Playwright prefill without needing interactive `input()` (unlike
  `main.py apply`, which blocks on stdin and can't run non-interactively).
- **Figma** — real listing exists but is NY/US-only, no India/remote eligibility — skipped, not
  worth the time without US work authorization.
- **Accenture** (Front End Developer, Kochi) — listing had gone closed by the time of follow-up.
- **Infosys** (Fullstack React+Node, Hyderabad) — actually requires 2-3 years experience despite
  matching on keyword score; Infosys hires freshers through a separate campus/off-campus pipeline,
  not general job-board reqs.
- **Elastic** — the aggregator-sourced link (arbeitnow.co.uk mirror) had a broken SSL cert; checked
  Elastic's real Greenhouse-backed job board directly (`boards-api.greenhouse.io/v1/boards/elastic/jobs`)
  and the actual "Software Engineer II - Full Stack - Web Engineering" req only exists for
  UK/Greece/Ireland/Spain/Portugal — no India or remote-anywhere version. No real opening exists.

**Takeaway for future sessions:** when given a company-name list to bulk-target, always verify each
"match" against the *real* job details (location, experience level) before spending application
effort — score/keyword matches from scrapers are not reliable enough to apply on faith. A batch of
~125 named companies yielded exactly 1 usable application.

Also built (reusable going forward): a one-page AI-leverage case-study PDF generator (HTML →
weasyprint, same as CV rendering) for the "describe how you leverage AI" / "share a PDF" style
custom Greenhouse questions — content pulled from real project READMEs (via `gh api`), never
invented. First one covers the WhatsApp AI Agent ("Pulse AI") project; hosted at
`github.com/Aman241104/dh-fullstack-task/docs/ai-case-study.pdf` (raw.githubusercontent.com link)
since that repo is public — `whatsapp-ai-agent` itself is private, so raw/blob links there 404 for
anyone without repo access. Don't try to push binary files through an MCP tool's inline
base64-content parameter by retyping bytes read via the Read tool — real risk of silent corruption
on long opaque strings; use `git`/filesystem-native operations instead.

- [ ] **Still pending from Session 5:** the 3 Digital Heroes resume additions (Docket, dh-web-task,
  dh-shopify-task) were not done this session either — see Session 5 entry above.

### Session 7 (2026-09-23) — Login fixes, "why no interviews" diagnosis, Gujarat sources

**Login:** Cloud Run logs showed zero successful Google callbacks in 21 days. Fixed: callback
now redirects to `/login?error=<code>` (cancelled / expired / google / server) instead of a raw
JSON 500; login page shows the reason; AuthProvider retries `/auth/me` on cold start (~10s)
instead of hanging on "Loading..." forever; signed-in users are bounced off `/login`.
**Not deployed yet** — needs Cloud Run + Vercel redeploy, then one real login by Aman.

**Why no interviews (findings):**
- Only 3 applications in the tracker out of 900 found; Super+J Wellfound bot added 15 unique
  jobs (34 CSV rows — duplicates).
- The bot's cover letter/answers used the OLD June resume data: "Frontend Developer at
  Freelance" (hid the Gravity internship), highlights = Awwwards clone / landing page /
  58 LeetCode problems. Screening answers claimed React Native, Redux, GraphQL, Redis.
- Bot scraped the wrong company name from neighbouring cards ("Auroscale" on Muze/Kraftbase
  jobs) and applied to up to 8 roles at one company (incl. Go backend, Spring) — reads as spam.
- `resume.pdf` in the repo root is the old June version (CGPA 8.00, 2 clone projects) — make
  sure it's not what's uploaded on Naukri/LinkedIn/Internshala profiles.
- Fixed in `~/job-search/wellfound_autoApply`: company from the "Apply to X" panel, max 2
  roles per company per run, `.env` CURRENT_ROLE/HIGHLIGHTS/SKILLS from master_resume.json,
  honest screening answers (all 3 bots), EXPECTED_CTC=5-8, analyst/WordPress/Shopify titles.

**Sources added** (`agents/job_finder.py`): Cutshort (≤1 yr exp only), Talent.com, Shine,
Freshersworld — Ahmedabad + Gandhinagar, Vadodara, Anand, Nadiad. Roles broadened to web,
backend, Python/Node, AI engineer, data analyst; removed ML/AI/data score penalties. Profile:
target_lpa 5-12, new sources enabled. Blocked/JS-only (need Chrome bots): Naukri, Indeed,
Glassdoor, Hirist, Instahyre, Foundit.

- [ ] Deploy backend + frontend, then do one real Google login
- [ ] Chrome-based apply bots for Internshala / Cutshort / Shine / Freshersworld
- [ ] Replace resume.pdf everywhere with the current generated CV

---

### Session 8 (2026-09-24) — Applications push, site speed-up, Obsidian vault, liquid glass

**Applications:** tailored CV + cover letter for Flam (LinkedIn intern), Microsoft SWE (Fabric Spark, Bangalore),
Chegg SWE II Frontend, plus a verified batch of 15 (7 remote 7+ LPA Internshala roles, 8 Gujarat roles) — all under
`output/`. Applied: QuickHyre Full Stack (marked in tracker). Found the dashboard DB resume still says CGPA 8.00 while
`data/master_resume.json` says 8.67 — batch CVs were patched; DB resume itself not yet synced.

**Site fixes:**
- Every request re-ran the full schema DDL (`TrackerAgent()` → `_init_db`, ~5s against Supabase) — now once per process.
  45 `async def` endpoints that never awaited were blocking the event loop → made sync. Local requests 40-60s → 0.25-0.9s.
- Learning: nested `<button>` hydration error; re-opening a tutor topic 400'd (empty message on an existing session) —
  now returns the saved conversation. Chats (Learning/Book/Train) no longer scroll the whole page on load.
- Sidebar avatar broken (Google blocks hotlinks with a Referer) → `referrerPolicy="no-referrer"` + initials fallback.

**New:** Obsidian Vault tab + `main.py vault-sync`; live Find Jobs progress (per-source counts, AI evaluation i/N with
ETA, scored-job feed); liquid-glass UI (`.glass-panel`, ambient color field) + Light/Dark/Dim theme switcher
(`components/ui/apple-liquid-glass-switcher.tsx`). Tests 9 → 16.

---

## Application Log

| Date | Company | Role | Source | Score | Status | Notes |
|---|---|---|---|---|---|---|
| 2026-09-03 | Razorpay | Full Stack Builder | Direct (Greenhouse) | 88 | Applied | Manual submit via Greenhouse form; CV+cover via batch-apply pipeline |

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
