"""
Everything around an application that isn't the CV itself:

  form_answers()  — ready-to-paste answers for the questions job-board forms
                    ask every time (why hire you, links, availability, ...).
                    Factual fields come straight from the resume; only the
                    "why should we hire you" answer is AI-written, and it goes
                    through the same fabrication check as cover letters.
  followup_draft() — a short LinkedIn note + email for an application that
                    has gone quiet.
  prep_pack()     — interview prep grounded in the job description, the
                    resume, and the user's own STAR story bank.
"""
import json
import re
from datetime import datetime

from claude_client import ask_ai
from agents.cv_validator import resume_corpus, sanitize_cover_letter


def _parse_json(raw: str):
    if not raw:
        return None
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _clean(text: str) -> str:
    """No leading whitespace on any line — these get pasted into forms."""
    return "\n".join(line.strip() for line in (text or "").strip().splitlines())


def _months_experience(resume: dict) -> int:
    total = 0
    now = datetime.now()
    for w in resume.get("work_experience", []) or []:
        try:
            start = datetime.strptime(str(w.get("start_date"))[:7], "%Y-%m")
            end = now if w.get("current") or not w.get("end_date") else datetime.strptime(str(w["end_date"])[:7], "%Y-%m")
            total += max(0, (end.year - start.year) * 12 + end.month - start.month)
        except (ValueError, TypeError):
            continue
    return total


def _link(url: str) -> str:
    if not url:
        return ""
    return url if url.startswith("http") else f"https://{url}"


def _resume_facts(resume: dict) -> dict:
    info = resume.get("personal_info", {}) or {}
    edu = (resume.get("education") or [{}])[0]
    months = _months_experience(resume)
    work = (resume.get("work_experience") or [{}])[0]
    exp_line = (
        f"About {months} months of professional experience as {work.get('title')} at {work.get('company')}"
        f" ({work.get('start_date')} to {'present' if work.get('current') else work.get('end_date')}), "
        f"plus production projects I built and deployed myself."
        if months and work.get("title") else
        "Fresher — production projects I built and deployed myself, listed on my portfolio."
    )
    return {
        "linkedin": _link(info.get("linkedin", "")),
        "portfolio": _link(info.get("portfolio", "")),
        "github": _link(info.get("github", "")),
        "email": info.get("email", ""),
        "phone": info.get("phone", ""),
        "experience": exp_line,
        "education": f"{edu.get('degree', '')}, {edu.get('institution', '')} ({edu.get('year', '')}), CGPA {edu.get('cgpa', '')}".strip(", "),
        "location": f"Based in {info.get('location', 'India')}. Open to remote work, and to relocating for the right role.",
    }


def form_answers(job: dict, resume: dict, projects: list, profile: dict | None = None) -> dict:
    """projects: the resume projects most relevant to this job (already
    selected by CVCustomizerAgent._select_relevant_projects)."""
    facts = _resume_facts(resume)
    target = (profile or {}).get("target_lpa") or {}
    lo, hi = target.get("min"), target.get("max")

    samples = []
    for p in projects[:3]:
        url = p.get("live_url") or p.get("github_url")
        if url:
            samples.append(f"{p.get('name')}: {_link(url)}")
    samples.append(f"Portfolio (all projects): {facts['portfolio']}")

    prompt = f"""Write the answer to a job application form's question "Why should you be hired for this role?".

CANDIDATE RESUME (JSON — the only source of facts you may use):
{json.dumps(resume)[:6000]}

MOST RELEVANT PROJECTS:
{json.dumps(projects[:3])[:3000]}

JOB: {job.get('title')} at {job.get('company')}
DESCRIPTION: {(job.get('description') or '')[:2500]}

RULES:
- 110-170 words, 2 short paragraphs, first person, plain text (no markdown, no bullet points, no greeting)
- Open with the specific overlap between this job and the candidate's real work
- Name 1-2 concrete projects or experiences with real details from the resume
- Never claim a technology, number or responsibility that isn't in the resume
- If the job asks for something the candidate lacks, don't mention it
- No filler ("passionate", "fast-paced", "cutting-edge", "I am writing to", "proven track record", "strong problem-solving mindset", "aligns perfectly", "extensive experience")
- Do NOT start by restating the question ("I should be hired because...") — start with the substance
Output only the answer text."""
    why = ask_ai(prompt, max_tokens=500, temperature=0.5) or ""
    # Models overshoot word limits; one tightening pass keeps it form-sized.
    if len(why.split()) > 180:
        why = ask_ai(
            f"Shorten this to at most 150 words. Keep every fact, change none, add nothing, plain text only:\n\n{why}",
            max_tokens=400, temperature=0.2,
        ) or why
    # Hard ceiling if the tightening pass failed or ignored the limit:
    # keep whole sentences up to ~170 words.
    if len(why.split()) > 180:
        kept, count = [], 0
        for sentence in re.split(r"(?<=[.!?])\s+", why.strip()):
            words = len(sentence.split())
            if kept and count + words > 170:
                break
            kept.append(sentence)
            count += words
        why = " ".join(kept)
    why = re.sub(r"^\s*(I should be hired|You should hire me|I am the right fit)[^.,]*(because|as)\s+", "", why, flags=re.I)
    why = re.sub(r"\b(aligns|align) perfectly\b", r"\1 closely", why, flags=re.I)
    why = why[:1].upper() + why[1:]
    why, removed = sanitize_cover_letter(why, resume_corpus(resume))

    answers = {
        "why_hire": _clean(why),
        "work_samples": "\n".join(samples),
        "links": "\n".join(x for x in [f"LinkedIn: {facts['linkedin']}", f"Portfolio: {facts['portfolio']}",
                                         f"GitHub: {facts['github']}"] if not x.endswith(": ")),
        "experience": facts["experience"],
        "availability": "Available to join immediately — no notice period.",
        "education": facts["education"],
        "location": facts["location"],
        "expected_ctc": f"{lo}-{hi} LPA, negotiable based on the role and growth opportunity." if lo and hi else "",
        "contact": f"{facts['email']} | {facts['phone']}",
        "removed_claims": removed,
        "generated_at": datetime.now().isoformat(),
    }
    return answers


def followup_draft(job: dict, resume: dict, days_since: int) -> dict:
    name = (resume.get("personal_info") or {}).get("name", "")
    prompt = f"""The candidate applied to "{job.get('title')}" at {job.get('company')} {days_since} days ago and heard nothing.
Candidate resume (facts only from here): {json.dumps(resume)[:3000]}

Write two short follow-ups. Output JSON only:
{{"linkedin_note": "<= 280 characters, for a recruiter/engineer at the company, polite, specific, no pleading",
  "email": "60-110 words, subject line first as 'Subject: ...', then the body, signed {name}"}}
Mention one concrete, relevant thing the candidate built. No filler, no "just following up to check"."""
    data = _parse_json(ask_ai(prompt, max_tokens=500, temperature=0.5)) or {}
    fallback_note = (f"Hi — I applied for the {job.get('title')} role at {job.get('company')} {days_since} days ago "
                     f"and I'm still very interested. Happy to share more about my work if it helps. — {name}")
    return {
        "linkedin_note": _clean(data.get("linkedin_note") or fallback_note)[:300],
        "email": _clean(data.get("email") or ""),
        "generated_at": datetime.now().isoformat(),
    }


def prep_pack(job: dict, resume: dict, stories: list) -> dict | None:
    story_list = [{"id": s.get("id"), "situation": (s.get("situation") or "")[:200], "result": (s.get("result") or "")[:150],
                   "tags": s.get("tags")} for s in stories[:25]]
    prompt = f"""Build an interview prep pack for this candidate and this job.

JOB: {job.get('title')} at {job.get('company')} ({job.get('location', '')})
DESCRIPTION: {(job.get('description') or '')[:3500]}

CANDIDATE RESUME (JSON): {json.dumps(resume)[:5000]}
CANDIDATE'S STAR STORIES (JSON, may be empty): {json.dumps(story_list)[:3000]}

Output JSON only, with exactly these keys:
{{
 "likely_questions": [{{"question": "...", "why_they_ask": "one line", "answer_outline": "2-3 lines using the candidate's real experience"}}],  // 8 items: mix of technical (from the JD's stack) and behavioral
 "topics_to_revise": ["specific topic from the JD the candidate should brush up on", ...],   // 5-8 items, most likely gaps first
 "stories_to_use": [{{"story_id": "id from the story list or null", "use_for": "which question/competency"}}],  // up to 4; [] if no stories
 "questions_to_ask_them": ["...", ...],   // 4 thoughtful questions specific to this role/company
 "company_research": ["what to look up about this company before the interview", ...]   // 3-4 items
}}
Answer outlines may only use facts from the resume. Be specific to this job, not generic."""
    data = _parse_json(ask_ai(prompt, max_tokens=2500, temperature=0.4))
    if not data or not data.get("likely_questions"):
        return None
    data["generated_at"] = datetime.now().isoformat()
    return data
