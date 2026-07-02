# Job Search AI System — Claude Code Guide

## About this project
Multi-agent job search automation system for Aman Patel (EC fresher, LDCE Ahmedabad, CGPA 8.0).
Goal: Find and secure a software job (8+ LPA, remote or Ahmedabad/Gujarat) as backup to TCS Digital offer (7 LPA, no joining date).

## Quick Commands (run these from this directory)

> **No API key needed** — uses your Claude Code session directly via `claude` CLI.
> Always use `.venv/bin/python` to run commands (has all packages installed).

```bash
# Web Dashboard
./run_web.sh          # Start web dashboard at http://localhost:8000

# Daily workflow
.venv/bin/python main.py find                    # Fetch & score new jobs from Remotive, The Muse, Adzuna
.venv/bin/python main.py links                   # Open Ahmedabad/Gujarat job boards in browser
.venv/bin/python main.py track                   # View dashboard
.venv/bin/python main.py apply --top 5           # Apply to top 5 scored jobs interactively
.venv/bin/python main.py export                  # Export to output/job_tracker.xlsx
.venv/bin/python main.py status                  # Quick stats

# Training (interactive interview coach)
.venv/bin/python main.py train                   # Interactive menu — pick topic
.venv/bin/python main.py train --topic react     # React/JS/TS interview practice
.venv/bin/python main.py train --topic dsa       # DSA drill (arrays, strings)
.venv/bin/python main.py train --topic hr        # Behavioral / STAR method
.venv/bin/python main.py train --topic portfolio # Project walkthrough practice
.venv/bin/python main.py train --topic salary    # Salary negotiation roleplay
.venv/bin/python main.py train --topic system    # System design basics
.venv/bin/python main.py train --progress        # Show training history

# Job status updates
.venv/bin/python main.py update <job_id> applied         # Mark job as applied
.venv/bin/python main.py update <job_id> interviewing    # Got interview call
.venv/bin/python main.py update <job_id> offer           # Received offer
.venv/bin/python main.py update <job_id> rejected        # Rejected
.venv/bin/python main.py update <job_id> ghosted         # No response
```

## Project Structure

```
job-serach/
├── CLAUDE.md              ← You are here
├── PROGRESS.md            ← Session tracking — update after each session
├── main.py                ← CLI entry point
├── orchestrator.py        ← Wires all agents
├── config.py              ← User profile, job preferences, API keys
├── requirements.txt
├── .env                   ← API keys (create from .env.example, never commit)
├── .env.example           ← Template
├── agents/
│   ├── job_finder.py      ← Fetches jobs from Remotive, The Muse, Adzuna
│   ├── cv_customizer.py   ← Tailors resume + writes cover letters via Claude
│   ├── tracker.py         ← SQLite DB + Excel export
│   ├── trainer.py         ← Interactive interview coach (8 topics)
│   └── job_applier.py     ← Apply workflow: opens browser, sends emails
├── data/
│   ├── master_resume.json ← Master resume — edit this to update your info
│   ├── found_jobs.json    ← All fetched jobs (auto-generated)
│   ├── applications.db    ← SQLite database (auto-generated)
│   └── training_log.json  ← Training session history (auto-generated)
└── output/
    ├── job_tracker.xlsx   ← Excel export (auto-generated)
    ├── cv_<id>.md         ← Tailored CVs per job (auto-generated)
    └── cover_<id>.md      ← Cover letters per job (auto-generated)
```

## User Profile

- **Name:** Aman Patel
- **Email:** patelaman0241@gmail.com | **Phone:** +91 9558009550
- **College:** LDCE Ahmedabad, B.E. EC Engineering, GTU, CGPA 8.00 (2022-2026)
- **GitHub:** github.com/Aman241104 | **Portfolio:** portfolio-1byaman.vercel.app
- **Current offer:** TCS Digital 7 LPA (no joining date)
- **Target:** 8-12 LPA, Remote or Ahmedabad/Gujarat

## Key Skills (for job matching)

React, Next.js, TypeScript, JavaScript, Tailwind CSS, GSAP, Node.js, Express, MongoDB, MySQL, Figma, Git

## Target Roles

Frontend Developer, React Developer, Next.js Developer, Full Stack Developer, UI Developer

## Location Preference

1. Remote (worldwide) — first choice
2. Ahmedabad / Gujarat onsite — second choice
3. Other Indian cities — only if package is significantly better (10+ LPA)

## Agent Details

### JobFinderAgent (agents/job_finder.py)
- Fetches from: Remotive (free), The Muse (free), Adzuna India, Adzuna Ahmedabad
- Scores each job 0-100 using Claude based on Aman's profile
- Gujarat/Ahmedabad jobs get location bonus in scoring
- Remote jobs also get preference in scoring
- Use `python main.py links` to open manual job boards for Naukri, Internshala, LinkedIn

### CVCustomizerAgent (agents/cv_customizer.py)
- Reads `data/master_resume.json` as source of truth
- Generates ATS-tailored Markdown resume for each specific job
- Reorders skills/projects to match job keywords
- Also generates personalized cover letters
- Outputs to `output/cv_<job_id>.md` and `output/cover_<job_id>.md`

### TrackerAgent (agents/tracker.py)
- SQLite database at `data/applications.db`
- Status lifecycle: found → applied → interviewing → offer / rejected / ghosted
- Excel export: 3 sheets — Applications (color-coded), Stats, High Priority
- Run `python main.py export` then open `output/job_tracker.xlsx`

### TrainerAgent (agents/trainer.py)
- 8 interview topics, fully interactive
- Claude acts as interviewer, scores answers /10, gives model answers
- Session history saved to `data/training_log.json`
- Run `python main.py train --progress` to see history

### JobApplierAgent (agents/job_applier.py)
- Generates full application package (CV + cover letter) for a job
- Opens apply URL in your browser and asks if you submitted
- Can send email applications via Gmail SMTP (set SMTP_PASSWORD in .env)
- Marks status in DB after you confirm

## How to update your resume

Edit `data/master_resume.json` — this is the master source. All auto-generated CVs are derived from this.
Key fields to keep updated: `projects[].bullets`, `skills`, `summary`.

## Environment Variables (.env)

```
# No Anthropic key needed — uses Claude Code CLI directly
SMTP_EMAIL=patelaman0241@gmail.com  # Optional — only needed for email applications
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # Gmail App Password (Settings > Security > App Passwords)
ADZUNA_APP_ID=xxx                   # Optional — register free at developer.adzuna.com
ADZUNA_APP_KEY=xxx                  # Same as above
```

The system works out-of-the-box with zero config — all Claude calls go through the `claude` CLI
you already have running.

## Daily Workflow Recommendation

```
Morning (15 min):
  python main.py find              # Find new jobs
  python main.py links             # Open Gujarat boards, scan manually

Evening (30-45 min):
  python main.py apply --top 5    # Apply to best matches
  python main.py train --topic react   # Or whichever topic you need
  Update PROGRESS.md with what you did
```

## When Claude Code asks about this project

- The job search system is in /home/whoever/personal-project/job-serach/
- All commands run as `python main.py <command>` from that directory
- Check PROGRESS.md for current status and what's been done
- Check data/applications.db or `python main.py status` for live stats
- Master resume is at data/master_resume.json — edit it to update profile info
