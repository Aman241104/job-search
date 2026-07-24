import json
from pathlib import Path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATA_DIR, OUTPUT_DIR, USER_PROFILE
from claude_client import ask_ai
from rich.console import Console
import markdown as md_lib
from weasyprint import HTML

console = Console()

RESUME_CSS = """<style>
  @page { size: A4; margin: 14mm 15mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 9.5pt; line-height: 1.32; }
  h1 { font-size: 18pt; margin-bottom: 2px; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #333; margin-top: 9px; margin-bottom: 4px; }
  h3 { font-size: 9.5pt; margin-bottom: 1px; }
  p { margin: 3px 0; }
  ul { margin: 2px 0 6px 16px; padding: 0; }
  li { margin-bottom: 1px; }
  a { color: #1a1a1a; text-decoration: none; }
  em { font-size: 8.5pt; color: #555; }
</style>"""


class CVCustomizerAgent:
    def __init__(self):
        self.master_resume = self._load_master_resume()
        self.master_resume_text = json.dumps(self.master_resume, indent=2)
        self.projects_detailed = self._load_projects_detailed()

    def _load_master_resume(self) -> dict:
        path = Path(DATA_DIR) / "master_resume.json"
        with open(path) as f:
            return json.load(f)

    def _load_projects_detailed(self) -> dict:
        path = Path(DATA_DIR) / "projects_detailed.json"
        with open(path) as f:
            return json.load(f)

    def _resume_text(self, resume: dict = None) -> str:
        """resume: the calling user's own saved resume (from the per-user
        Postgres `resumes` table) — falls back to the static
        master_resume.json for CLI/legacy callers that don't pass one.
        Without this, every user's CV was silently built from the account
        owner's real resume data (same bug class as the profile PII leak),
        since this class previously only ever read the static file."""
        return json.dumps(resume, indent=2) if resume else self.master_resume_text

    def _resume_dict(self, resume: dict = None) -> dict:
        return resume if resume else self.master_resume

    def _select_relevant_projects(self, job: dict, resume: dict = None, top_n: int = 5) -> list:
        """Keyword-overlap scorer, cheap and deterministic (no extra LLM call,
        same style as claude_client.py's _keyword_fallback).

        When `resume` is given (the real per-user web path), scores that
        user's own `projects` array by overlap between the job's own
        significant words and each project's name/description/tech_stack/
        bullets — no manually-curated `keywords`/`tier` fields required,
        since a random signed-up user's Resume Builder entries won't have
        those. Without this, every user's CV showed the account owner's own
        curated project list regardless of whose resume was passed in —
        `resume`'s personal info/experience flowed through correctly but
        projects silently didn't, defeating the whole per-user fix.

        `resume=None` (CLI/legacy) keeps the original curated
        projects_detailed.json tier/keywords system unchanged."""
        text = (job.get("title", "") + " " + job.get("description", "")).lower()

        if resume and resume.get("projects"):
            job_words = {w for w in text.split() if len(w) > 3}
            scored = []
            for p in resume["projects"]:
                proj_text = " ".join([
                    p.get("name", "") or "", p.get("description", "") or "",
                    " ".join(p.get("tech_stack", []) or []),
                    " ".join(p.get("bullets", []) or []),
                ]).lower()
                overlap = sum(1 for w in job_words if w in proj_text)
                scored.append((overlap, p))
            scored.sort(key=lambda x: x[0], reverse=True)
            return [p for _, p in scored[:top_n]]

        scored = []
        for p in self.projects_detailed["flagship"]:
            overlap = sum(1 for kw in p.get("keywords", []) if kw.lower() in text)
            tier_bonus = {"S": 2, "A": 1, "C": 0}.get(p.get("tier", "C"), 0)
            scored.append((overlap + tier_bonus, p))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [p for _, p in scored[:top_n]] + [self.projects_detailed["gallery"]]

    def _refine(self, draft: str, job: dict, doc_type: str, extra_checks: str, max_tokens: int) -> str:
        """
        Self-critique pass: review the first draft against the job description
        and rewrite it if there's a real issue, otherwise return it unchanged.
        Affordable now that a second AI call per document isn't rationing a
        scarce quota (previously Gemini's 20/day smart-model limit). Falls
        back to the original draft untouched if this call fails — the first
        draft is already a complete, valid document on its own, this is a
        quality pass, not a required step.
        """
        prompt = f"""Review this draft {doc_type} against the target job below. If you find real issues, rewrite it. If it's already good, return it unchanged — don't rewrite for the sake of rewriting.

TARGET JOB:
Title: {job['title']}
Company: {job['company']}
Description: {job['description'][:2000]}

DRAFT:
{draft}

Check for:
- Generic filler language or JD-mirroring boilerplate
- Invented achievements/skills not grounded in the draft's own real details (do NOT add anything not already present in the draft)
- Weak keyword alignment with the job description
- {extra_checks}

Output ONLY the final {doc_type} text (improved or unchanged) — no explanation of what you checked or changed."""
        refined = ask_ai(prompt, max_tokens=max_tokens)
        return refined if refined else draft

    def customize_for_job(self, job: dict, resume: dict = None) -> str:
        console.print(f"[cyan]Customizing CV for: {job['title']} at {job['company']}[/cyan]")

        selected_projects = self._select_relevant_projects(job, resume=resume)
        projects_text = json.dumps(selected_projects, indent=2)
        resume_text = self._resume_text(resume)
        candidate_name = self._resume_dict(resume).get("personal_info", {}).get("name") or "Candidate"

        prompt = f"""You are an expert resume writer who creates ATS-optimized, tailored resumes.
Tailor this candidate's resume for the specific job below.

MASTER RESUME (JSON) — personal info, education, skills, work experience, achievements:
{resume_text}

CANDIDATE'S PROJECTS, PRE-SELECTED FOR RELEVANCE TO THIS JOB (JSON):
{projects_text}

TARGET JOB:
Title: {job['title']}
Company: {job['company']}
Location: {job['location']}
Description: {job['description'][:3000]}

INSTRUCTIONS:
1. Reorder skills to put most relevant ones FIRST
2. The projects above are already pre-selected for relevance — pick the best 3-4 of them (the gallery entry counts as one project if included), don't invent others
3. Rewrite project AND work-experience bullets to use keywords from the job description, based on the real `bullets`/`highlights` given — do NOT invent functionality not listed
4. Keep summary focused on what this company wants
5. Do NOT add fake experience or skills the candidate doesn't have
6. Output a clean, professional Markdown resume
7. Avoid generic filler language ("eager to collaborate on cutting-edge projects", "fast-paced environment", "passionate about technology") — keep the summary specific and grounded in the candidate's real experience, not JD-mirroring boilerplate
8. Keep each bullet a clean, standalone achievement statement. Do NOT bolt on generic justification clauses that just restate a JD phrase (e.g. don't end a bullet about a multi-tenant SaaS with "...demonstrating strong understanding of HTML and CSS") — reword for relevant keywords using only the real details given, without padding
9. If the resume's `work_experience` array is non-empty, include an "## Experience" section listing each entry (job or internship) with its real title/company/dates/bullets — reworded for keyword alignment like projects, never invented. If `work_experience` is empty, omit the section entirely.

Keep total output under ~700 words.

Output ONLY the markdown resume, no explanations. Format:
# {candidate_name}
contact info line

## Summary
...

## Experience (omit this whole section if work_experience is empty)
### Job Title | Company
*Location · Start – End (or "Present")*
- bullet
- bullet

## Skills
**Frontend:** ...
**Backend:** ...
etc.

## Projects
### Project Name | Tech Stack
*Live: url*
- bullet
- bullet

## Education
...

## Achievements
...
"""
        result = ask_ai(prompt, max_tokens=2000)
        if not result:
            return f"# {candidate_name}\n\n*CV generation failed — please retry.*"
        return self._refine(
            result, job, "resume",
            extra_checks="ATS-friendliness (clean headers, no tables/columns, standard section names)",
            max_tokens=2000,
        )

    def generate_cover_letter(self, job: dict, resume: dict = None) -> str:
        console.print(f"[cyan]Writing cover letter for: {job['title']} at {job['company']}[/cyan]")

        selected_projects = self._select_relevant_projects(job, resume=resume, top_n=3)
        projects_text = json.dumps(selected_projects, indent=2)
        r = self._resume_dict(resume)
        info = r.get("personal_info", {})

        prompt = f"""Write a personalized, genuine cover letter for this job application. Avoid generic AI-sounding language.

CANDIDATE: {info.get('name', 'the candidate')}
Email: {info.get('email', '')} | GitHub: {info.get('github', '')} | Portfolio: {info.get('portfolio', '')}
Summary: {r.get('summary', '')}
Education: {json.dumps(r.get('education', []))}
Work experience: {json.dumps(r.get('work_experience', []))}
Skills: {json.dumps(r.get('skills', {}))}

CANDIDATE'S PROJECTS, PRE-SELECTED FOR RELEVANCE TO THIS JOB (JSON):
{projects_text}

TARGET JOB:
Title: {job['title']}
Company: {job['company']}
Description: {job['description'][:2000]}

REQUIREMENTS:
- 3 short paragraphs max
- Do NOT include a greeting/salutation line (no "Dear ..." of any kind) — a salutation is added separately afterward
- Do NOT include placeholder brackets like "[Hiring Manager Name]" anywhere — if you don't know a name, just skip greetings entirely as instructed above
- Opening: specific hook mentioning the company or role (not "I am writing to apply")
- Middle: pick the most relevant 1-2 items from either the work experience or the pre-selected projects above (whichever best fits this job), explain what they demonstrate — use only real details given, don't invent functionality or responsibilities
- Closing: brief, confident, clear CTA
- Tone: professional but human, not robotic
- Keep under 300 words

Output ONLY the cover letter body paragraphs — no greeting, no sign-off, no subject line."""

        result = ask_ai(prompt, max_tokens=600)
        if not result:
            return "Cover letter generation failed — please retry."
        return self._refine(
            result, job, "cover letter",
            extra_checks="3-short-paragraph structure, no greeting/sign-off, no placeholder brackets like \"[Hiring Manager Name]\"",
            max_tokens=600,
        )

    def _markdown_to_pdf(self, markdown_text: str, output_path: Path):
        # WeasyPrint instead of a full browser (Playwright/Chromium) — a headless
        # Chromium launch was measured at ~591MB RSS for a single PDF render,
        # already over Render's entire 512MB free-tier limit on its own (confirmed
        # via a real OOM crash in production). WeasyPrint renders HTML/CSS to PDF
        # directly with no browser process at all — same output for a document
        # this simple (no JS, no complex layout), a fraction of the memory.
        html_body = md_lib.markdown(markdown_text, extensions=["extra"])
        full_html = f"<html><head><meta charset='utf-8'>{RESUME_CSS}</head><body>{html_body}</body></html>"
        HTML(string=full_html).write_pdf(str(output_path))

    def save_tailored_cv(self, job_id: str, cv_markdown: str) -> str:
        path = Path(OUTPUT_DIR) / f"cv_{job_id}.pdf"
        self._markdown_to_pdf(cv_markdown, path)
        return str(path)

    def save_cover_letter(self, job_id: str, cover_letter: str, resume: dict = None) -> str:
        # job_applier.py wraps `cover_letter` with a greeting/sign-off for the
        # *emailed* body text, but that wrap never touched the PDF file itself
        # — anyone opening the attachment directly (not just reading the email)
        # saw a bare paragraph with no salutation or signature. Add the same
        # wrap here, PDF-only, so the standalone document reads as a complete
        # cover letter on its own.
        info = self._resume_dict(resume).get("personal_info", USER_PROFILE)
        full_letter = f"""Dear Hiring Team,

{cover_letter}

Best regards,
{info.get('name', USER_PROFILE['name'])}
{info.get('phone', USER_PROFILE['phone'])} | {info.get('email', USER_PROFILE['email'])}
Portfolio: {info.get('portfolio', USER_PROFILE['portfolio'])} | GitHub: {info.get('github', USER_PROFILE['github'])}"""
        path = Path(OUTPUT_DIR) / f"cover_{job_id}.pdf"
        self._markdown_to_pdf(full_letter, path)
        return str(path)

    def prepare_full_package(self, job: dict, resume: dict = None) -> dict:
        cv = self.customize_for_job(job, resume=resume)
        cover = self.generate_cover_letter(job, resume=resume)
        cv_path = self.save_tailored_cv(job["id"], cv)
        cover_path = self.save_cover_letter(job["id"], cover, resume=resume)
        return {
            "job_id": job["id"],
            "cv_markdown": cv,
            "cover_letter": cover,
            "cv_path": cv_path,
            "cover_letter_path": cover_path,
        }
