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

    def _select_relevant_projects(self, job: dict, top_n: int = 5) -> list:
        """Keyword-overlap scorer against each project's `keywords`, with a tier
        bonus (S > A > C). Cheap and deterministic — no extra LLM call, same
        style as claude_client.py's _keyword_fallback."""
        text = (job.get("title", "") + " " + job.get("description", "")).lower()
        scored = []
        for p in self.projects_detailed["flagship"]:
            overlap = sum(1 for kw in p.get("keywords", []) if kw.lower() in text)
            tier_bonus = {"S": 2, "A": 1, "C": 0}.get(p.get("tier", "C"), 0)
            scored.append((overlap + tier_bonus, p))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [p for _, p in scored[:top_n]] + [self.projects_detailed["gallery"]]

    def customize_for_job(self, job: dict) -> str:
        console.print(f"[cyan]Customizing CV for: {job['title']} at {job['company']}[/cyan]")

        selected_projects = self._select_relevant_projects(job)
        projects_text = json.dumps(selected_projects, indent=2)

        prompt = f"""You are an expert resume writer who creates ATS-optimized, tailored resumes.
Tailor this candidate's resume for the specific job below.

MASTER RESUME (JSON) — personal info, education, skills, achievements:
{self.master_resume_text}

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
3. Rewrite project bullets to use keywords from the job description, based on the real `bullets`/`highlights` given — do NOT invent functionality not listed
4. Keep summary focused on what this company wants
5. Do NOT add fake experience or skills the candidate doesn't have
6. Output a clean, professional Markdown resume
7. Avoid generic filler language ("eager to collaborate on cutting-edge projects", "fast-paced environment", "passionate about technology") — keep the summary specific and grounded in the candidate's real experience, not JD-mirroring boilerplate
8. Keep each bullet a clean, standalone achievement statement. Do NOT bolt on generic justification clauses that just restate a JD phrase (e.g. don't end a bullet about a multi-tenant SaaS with "...demonstrating strong understanding of HTML and CSS") — reword for relevant keywords using only the real details given, without padding

Keep total output under ~700 words.

Output ONLY the markdown resume, no explanations. Format:
# Aman Patel
contact info line

## Summary
...

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
        return result if result else "# Aman Patel\n\n*CV generation failed — please retry.*"

    def generate_cover_letter(self, job: dict) -> str:
        console.print(f"[cyan]Writing cover letter for: {job['title']} at {job['company']}[/cyan]")

        selected_projects = self._select_relevant_projects(job, top_n=3)
        projects_text = json.dumps(selected_projects, indent=2)

        prompt = f"""Write a personalized, genuine cover letter for this job application. Avoid generic AI-sounding language.

CANDIDATE: Aman Patel
Email: patelaman0241@gmail.com | GitHub: github.com/Aman241104 | Portfolio: portfolio-1byaman.vercel.app
Background: B.E. EC Engineering fresher, LDCE Ahmedabad, CGPA 8.0
Key skills: React, Next.js, TypeScript, Node.js, GSAP animations, Tailwind CSS, Figma
Personality: Enthusiastic builder who enjoys turning ideas into working products. Has an eye for design.

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
- Middle: pick 2 of the pre-selected projects above that are most relevant, explain what they demonstrate — use only real details from the `description`/`highlights` given, don't invent functionality
- Closing: brief, confident, clear CTA
- Tone: professional but human, not robotic
- Keep under 300 words

Output ONLY the cover letter body paragraphs — no greeting, no sign-off, no subject line."""

        result = ask_ai(prompt, max_tokens=600)
        return result if result else "Cover letter generation failed — please retry."

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

    def save_cover_letter(self, job_id: str, cover_letter: str) -> str:
        # job_applier.py wraps `cover_letter` with a greeting/sign-off for the
        # *emailed* body text, but that wrap never touched the PDF file itself
        # — anyone opening the attachment directly (not just reading the email)
        # saw a bare paragraph with no salutation or signature. Add the same
        # wrap here, PDF-only, so the standalone document reads as a complete
        # cover letter on its own.
        full_letter = f"""Dear Hiring Team,

{cover_letter}

Best regards,
{USER_PROFILE['name']}
{USER_PROFILE['phone']} | {USER_PROFILE['email']}
Portfolio: {USER_PROFILE['portfolio']} | GitHub: {USER_PROFILE['github']}"""
        path = Path(OUTPUT_DIR) / f"cover_{job_id}.pdf"
        self._markdown_to_pdf(full_letter, path)
        return str(path)

    def prepare_full_package(self, job: dict) -> dict:
        cv = self.customize_for_job(job)
        cover = self.generate_cover_letter(job)
        cv_path = self.save_tailored_cv(job["id"], cv)
        cover_path = self.save_cover_letter(job["id"], cover)
        return {
            "job_id": job["id"],
            "cv_markdown": cv,
            "cover_letter": cover,
            "cv_path": cv_path,
            "cover_letter_path": cover_path,
        }
