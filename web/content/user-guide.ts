export const userGuideMd = `# Welcome to JobOS

This is a job-search dashboard that finds and scores jobs for you, helps you apply faster, and gives you a place to practice interviews and track your learning — all in one place. This guide walks through everything, feature by feature.

Building your own copy instead of using this one? See the separate [developer setup guide](/docs/setup) — this page is for using the site, not running it yourself.

---

## 1. Signing in and first-time setup

Sign in with your Google account. First login only, you'll land on a short **setup wizard**: your name, skills, target roles, preferred locations, and target salary range. This is what job scoring and matching are based on — spend a minute getting it right, you can always change it later in **Profile**.

Everything after that is your own private workspace — nobody else sees your jobs, resume, notes, or learning progress. Two people signed into this same site never share data.

---

## 2. Dashboard

Your home screen: stats (jobs found, applied, interviewing, offers), a 30-day activity chart, follow-up reminders for applications that have gone quiet, and a **Find New Jobs** button.

Click **Find New Jobs** to run a fresh scrape across ~12 sources (Internshala, LinkedIn, RemoteOK, Remotive, Hacker News "Who's Hiring," and more). Each job gets scored against your profile — takes a minute or two, you'll see a progress bar.

---

## 3. Jobs

Every job found, sorted by match score by default. You can:
- **Search** by title/company, **filter** by source/score/salary/date, **switch** between list and Kanban board view
- **Star** jobs to shortlist them, add **notes**, change **status** (found → applied → interviewing → offer/rejected/ghosted)
- Click a job to open its full detail drawer: description, why it scored the way it did, application timeline, interview rounds tracker, and your generated CV/cover letter
- **Apply** generates a tailored CV + cover letter (as PDF) for that specific job in one click
- **Bulk select** multiple jobs to update status or star them all at once
- **Blacklist** a company if you never want to see their postings again

Keyboard shortcuts: \`j\`/\`k\` to move between jobs, \`s\` to star, \`Enter\` to open, \`?\` to see the full list.

---

## 4. Batch Apply

Pick a batch of jobs (top N by score, or hand-picked) and apply to all of them in one pass through one channel:

- **Email** — generates a CV + cover letter per job and sends it to whatever email address it finds in the listing
- **Browser pre-fill** — opens each job's page and fills in whatever fields it can match (name, email, phone, resume upload). **It never clicks submit** — you finish and submit by hand using the screenshot as a guide
- Toggle between **Automatic** (sends right away) and **Review** (stage everything, approve or skip each one, then confirm-and-send together)

Telegram-based batch alerts exist in the code but are tied to the site owner's own bot, not available per-account yet — you won't see it do anything under your own login.

---

## 5. Learning

Three tabs:
- **Skills & Courses** — a curated learning track plus any skill you add yourself, each with an AI tutor chat and an auto-generated "zero to hero" topic checklist you check off as you go
- **Books & PDFs** — upload a PDF, read it page by page, get AI summaries and a Q&A chat grounded in the actual page text
- **Playlists** — paste a YouTube playlist link, it transcribes every video, generates study notes, and lets you ask questions answered by searching across the whole playlist's content (not just guessing from general knowledge)

Everything here is private to your account — your progress, your uploaded books, your playlists.

---

## 6. Train (Interview Practice)

Pick a topic (React/JS, backend, DSA, system design, behavioral/HR, portfolio walkthrough, salary negotiation, and more) and have a real back-and-forth interview with an AI coach. Each answer gets scored out of 10 with specific feedback and a model answer, then the next question. Your sessions and average scores are saved — check **Train → Progress** to see your history.

---

## 7. Story Bank

A place to build out STAR-format stories (Situation, Task, Action, Result) plus a reflection, for behavioral interview prep. Paste rough notes about something you did and get an AI-drafted structured story back — review and edit before saving.

---

## 8. Resume & Profile

**Resume** is your master resume — the source every generated CV pulls from and tailors per job. **Profile** is your job-search preferences (skills, target roles, locations, salary range) — the same fields from the first-login wizard, editable anytime.

---

## 9. Analytics

Funnel health (found → applied → interviewing → offer), which sources are actually converting for you, salary insights across everything you've found, and score distribution — useful for spotting whether you're applying enough, or applying too low.

---

## FAQ

**Do I need to configure anything myself?** No — sign in and go. Job scoring, CV generation, and the AI tutor/coach all work immediately with no setup beyond the first-login wizard.

**Is my data private from other users?** Yes — every table is scoped to your account. Nobody else can see your jobs, notes, resume, or learning progress.

**Why don't I get Telegram alerts?** That integration is currently tied to the site owner's own bot token, not available per-account — see Batch Apply above.
`;
