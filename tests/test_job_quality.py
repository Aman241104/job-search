from agents.job_quality import required_years, annual_rupee_range, listing_is_closed
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


def test_required_years_ignores_dash_dropped_ranges():
    # Shine renders "1–3 Years"; scraped text sometimes loses the dash
    assert required_years("Experience: 13 Years") is None
