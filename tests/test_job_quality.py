from agents.job_quality import (required_years, annual_rupee_range, listing_is_closed,
                                red_flags, location_abroad, india_eligible)
from agents.job_finder import JobFinderAgent
from agents.cv_validator import resume_corpus, sanitize_cv, sanitize_cover_letter, unsupported_terms
from agents.application_kit import _resume_facts, _parse_json

RESUME = {
    "personal_info": {"name": "A", "linkedin": "linkedin.com/in/a", "portfolio": "a.dev", "github": "github.com/a",
                      "email": "a@x.com", "phone": "1", "location": "Ahmedabad, India"},
    "education": [{"degree": "B.E.", "institution": "LDCE", "year": "2022-2026", "cgpa": "8.67"}],
    "work_experience": [{"title": "Intern", "company": "Gravity", "start_date": "2026-01", "current": True}],
    "skills": {"frontend": ["React", "Next.js", "Three.js"], "backend": ["FastAPI", "Node.js"]},
}


# ── experience ──

def test_required_years_takes_the_strict_requirement():
    assert required_years("We need 1 year of React and 3+ years of experience with JavaScript") == 3
    assert required_years("Experience: 2 - 4 yrs") == 2
    assert required_years("minimum 1 year(s) of experience") == 1


def test_required_years_fresher_and_unrelated_numbers():
    assert required_years("No experience required. Freshers welcome") == 0
    assert required_years("0-2 years experience") == 0
    assert required_years("We have been in business for 20 years") is None
    assert required_years("Great team, React, Node") is None


# ── salary ──

def test_annual_rupee_range_formats():
    assert annual_rupee_range("₹ 2,00,000 - 3,50,000") == (200000, 350000)
    assert annual_rupee_range("₹4L - ₹5L / yr") == (400000, 500000)
    assert annual_rupee_range("₹ 30,000 - 35,000 /month") == (360000, 420000)
    assert annual_rupee_range("Not specified") is None
    assert annual_rupee_range("$80,000 - $120,000") is None
    assert annual_rupee_range("USD 90000 - 110000 / yr") is None


# ── closed listings ──

def test_listing_is_closed():
    assert listing_is_closed("… No longer accepting applications …", 200)
    assert listing_is_closed("Apply By 13 Sep Closed for applications", 200)
    assert listing_is_closed("", 404)
    assert not listing_is_closed("Apply now — 54 applicants", 200)


# ── CV validator ──

def test_sanitize_cv_removes_invented_skills_and_fixes_cgpa():
    corpus = resume_corpus(RESUME)
    cv = "\n".join([
        "## Skills",
        "**Frontend:** React, Next.js, Redux, jQuery, Three.js",
        "**Mobile:** React Native",
        "## Projects",
        "- Built a dashboard handling millions of Spark jobs daily",
        "- Built a 3D product viewer with Three.js",
        "## Education",
        "*2022-2026 · CGPA: 8.0*",
    ])
    clean, removed = sanitize_cv(cv, RESUME, corpus)
    assert removed == ["jquery", "react native", "redux", "spark"]
    assert "**Frontend:** React, Next.js, Three.js" in clean
    assert "Mobile" not in clean                 # category left empty -> dropped
    assert "Spark" not in clean                  # bullet about an invented tech -> dropped
    assert "Three.js" in clean and "CGPA: 8.67" in clean


def test_sanitize_cover_letter_drops_false_sentences():
    corpus = resume_corpus(RESUME)
    text = "I build with React and FastAPI. I have shipped Kubernetes clusters at scale. I'd love to join."
    clean, removed = sanitize_cover_letter(text, corpus)
    assert removed == ["kubernetes"]
    assert "Kubernetes" not in clean and "React and FastAPI" in clean


def test_skill_gap():
    from agents.cv_validator import skill_gap
    jd = "Frontend role: React, Next.js, TypeScript, Redux Toolkit and GraphQL. Docker is a plus."
    gap = skill_gap(jd, resume_corpus(RESUME))
    assert gap["have"] == ["next.js", "react"]
    assert gap["missing"] == ["docker", "graphql", "redux toolkit", "typescript"]


def test_resume_match_suggestions():
    from agents.cv_validator import resume_match
    resume = {**RESUME, "skills": {"frontend": ["React"]},
              "projects": [{"name": "Shop", "tech_stack": ["Next.js"],
                            "bullets": ["Built checkout in Next.js and React", "Wrote docs"]}]}
    m = resume_match("React, Next.js and Docker", resume)
    assert m["match_pct"] == 67
    assert m["add_to_skills"] == ["next.js"]
    assert m["lead_with"] == [{"where": "Shop", "bullet": "Built checkout in Next.js and React",
                               "skills": ["next.js", "react"]}]


def test_unsupported_terms_respects_word_boundaries():
    corpus = resume_corpus(RESUME)
    assert unsupported_terms("React and Next.js", corpus) == []
    assert unsupported_terms("Rustic design", corpus) == []   # "rust" inside a word is not Rust


# ── application kit ──

def test_resume_facts_are_deterministic():
    facts = _resume_facts(RESUME)
    assert facts["linkedin"] == "https://linkedin.com/in/a"
    assert "CGPA 8.67" in facts["education"]
    assert facts["experience"].startswith("About ") and "Gravity" in facts["experience"]


def test_parse_json_tolerates_prose():
    assert _parse_json('Sure! {"a": 1} hope that helps') == {"a": 1}
    assert _parse_json("nothing here") is None


# ── red flags / location eligibility ──

def test_red_flags():
    pts, labels = red_flags("Freshers welcome. 2 year bond. Refundable security deposit of Rs 5000.")
    assert labels == ["service bond", "asks candidate to pay"] and pts == -60
    assert red_flags("React developer, 6 LPA, hybrid") == (0, [])


def test_location_abroad():
    for loc in ["US-Remote", "Remote in Canada", "San Francisco, Seattle, New York", "London"]:
        assert location_abroad(loc), loc
    for loc in ["Remote", "Remote (India)", "Ahmedabad", "Worldwide", "Remote - US or India", "", "Bengaluru"]:
        assert not location_abroad(loc), loc


def test_india_eligible():
    for loc in ["India", "Remote", "Bengaluru · Remote", "Worldwide", "Remote - APAC", "Remote, Global",
                "Remote (Anywhere)", "Fully remote"]:
        assert india_eligible(loc), loc
    for loc in ["Remote - Brazil", "Spain · Remote", "Zurich", "Washington, DC", "US-Remote", "",
                "Indianapolis, IN", "Indiana", "China · Remote", "Bogota · Remote"]:
        assert not india_eligible(loc), loc


def test_ats_stale():
    from datetime import datetime, timedelta, timezone
    recent = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    old = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    assert not JobFinderAgent._ats_stale(recent)
    assert JobFinderAgent._ats_stale(old)
    assert JobFinderAgent._ats_stale("2026-01-01T00:00:00Z")
    assert not JobFinderAgent._ats_stale("") and not JobFinderAgent._ats_stale(None)


def test_is_repost_needs_two_weeks():
    from datetime import datetime, timedelta
    a = JobFinderAgent.__new__(JobFinderAgent)
    assert a._is_repost((datetime.now() - timedelta(days=20)).isoformat())
    assert not a._is_repost((datetime.now() - timedelta(days=3)).isoformat())   # cross-post, not repost
    assert not a._is_repost("") and not a._is_repost(None)


def test_breaker_skips_provider_after_repeated_failures(monkeypatch):
    import claude_client as c
    monkeypatch.setattr(c, "_fails", {})
    for _ in range(c.BREAKER_FAILS):
        assert not c._breaker_open("x")
        c._record("x", False)
    assert c._breaker_open("x")
    c._record("x", True)
    assert not c._breaker_open("x")


def test_keyword_score_no_remote_bonus_for_us_only_roles():
    a = JobFinderAgent.__new__(JobFinderAgent)
    a.profile = {}
    job = {"title": "Frontend Engineer", "description": "React, TypeScript", "salary": ""}
    us, _ = a.keyword_score({**job, "location": "US-Remote"})
    anywhere, _ = a.keyword_score({**job, "location": "Remote"})
    assert anywhere - us >= 40


def test_required_years_ignores_dash_dropped_ranges():
    # Shine renders "1–3 Years"; scraped text sometimes loses the dash
    assert required_years("Experience: 13 Years") is None
