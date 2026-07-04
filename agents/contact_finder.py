"""Contact discovery — inspired by career-ops's "contacto" mode, scoped down
to what's actually achievable: we can't scrape LinkedIn directly (already a
documented dead end for job boards, bot-blocked same as Naukri/Indeed), so
this is a search-assist + message-draft tool rather than automated contact
scraping. The user still has to find and pick the real contact by hand.
"""
import json
import sys
import os
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import USER_PROFILE
from claude_client import ask_ai
from agents.cv_customizer import CVCustomizerAgent


def draft_contact_outreach(job: dict) -> dict:
    """Returns {"search_query": str, "search_url": str, "message_draft": str}."""
    company = job.get("company", "")
    title = job.get("title", "")

    search_query = (
        f'site:linkedin.com/in "{company}" '
        f'(recruiter OR "talent acquisition" OR "hiring manager" OR "engineering manager")'
    )
    search_url = "https://www.google.com/search?q=" + urllib.parse.quote(search_query)

    # Reuses the same project-selection logic CV/cover-letter generation
    # already uses, rather than duplicating it.
    cv_agent = CVCustomizerAgent()
    selected_projects = cv_agent._select_relevant_projects(job, top_n=1)
    projects_text = json.dumps(selected_projects, indent=2)

    prompt = f"""Write a short LinkedIn connection/outreach message (STRICT max 300 characters) for this job application.

CANDIDATE: {USER_PROFILE['name']}, {USER_PROFILE.get('degree', '')} at {USER_PROFILE.get('college', '')}
ONE relevant project to reference briefly (JSON): {projects_text}

TARGET ROLE: {title} at {company}

REQUIREMENTS:
- Reference the role and ONE concrete, specific detail from the project above — no invented details
- No greeting placeholder brackets, no generic "I'd love to connect" filler
- Confident, direct, human tone — not a form letter
- STRICT max 300 characters total, count carefully

Output ONLY the message text, nothing else."""

    message_draft = ask_ai(prompt, max_tokens=150) or "Message generation failed — try again."
    message_draft = message_draft.strip()
    if len(message_draft) > 300:
        # The model doesn't always hit the limit exactly — cut at the last
        # word boundary under 300 chars rather than slicing mid-word/mid-sentence.
        message_draft = message_draft[:300].rsplit(" ", 1)[0].rstrip(".,;:") + "..."

    return {
        "search_query": search_query,
        "search_url": search_url,
        "message_draft": message_draft,
    }
