"""
Signals about a listing's real fit that keyword scoring used to miss:
how much experience it actually asks for, what it actually pays, and
whether it is still open. Shared by the scorer (agents/job_finder.py) and
the listing re-checker (agents/listing_checker.py).
"""
import re

# Points by the listing's stated minimum years of experience (5 = 5+).
EXPERIENCE_POINTS = {0: 20, 1: 8, 2: -10, 3: -25, 4: -30, 5: -35}

# "3+ years", "2-4 yrs", "2 to 4 years", "minimum 1 year(s)", "1 year(s)"
_YEARS_RE = re.compile(
    r"(?<![\d.])(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:years?|yrs?)(?:\(s\))?",
    re.I,
)
# Only count numbers that are about experience, not "5 years in business"
_EXPERIENCE_CONTEXT = re.compile(r"experience|exp\b|minimum|at least|required|relevant", re.I)
_NO_EXPERIENCE = re.compile(r"no experience required|freshers? (?:can|may|are welcome)|0\s*(?:-|to)\s*\d+\s*(?:years?|yrs?)", re.I)


def required_years(text: str) -> int | None:
    """Smallest experience requirement stated in the listing, or None if it
    doesn't say. Uses the *largest* of the stated minimums when a listing
    names several (e.g. "1 year React, 3+ years JavaScript" -> 3), since the
    stricter line is the real filter."""
    if not text:
        return None
    if _NO_EXPERIENCE.search(text):
        return 0
    found = []
    for m in _YEARS_RE.finditer(text):
        window = text[max(0, m.start() - 60): m.end() + 60]
        if _EXPERIENCE_CONTEXT.search(window):
            years = int(m.group(1))
            # >10 is almost always noise: company age ("20 years of excellence") or
            # a range whose dash the page dropped ("1–3 Years" scraped as "13 Years").
            if years <= 10:
                found.append(years)
    return max(found) if found else None


def annual_rupee_range(salary: str) -> tuple[int, int] | None:
    """(low, high) annual rupees from strings like "₹ 2,00,000 - 3,50,000",
    "₹4L - ₹5L / yr", "₹30,000 - 35,000 /month". None if not parseable."""
    if not salary:
        return None
    s = salary.lower().replace(",", "")
    per_month = "month" in s or "/mo" in s
    lakhs = re.findall(r"(\d+(?:\.\d+)?)\s*l\b", s)
    if lakhs:
        vals = [float(v) * 100000 for v in lakhs]
    else:
        vals = [float(v) for v in re.findall(r"\d{4,}", s)]
    if not vals:
        return None
    if per_month:
        vals = [v * 12 for v in vals]
    return int(min(vals)), int(max(vals))


# Phrases job boards show on a listing that no longer takes applications.
CLOSED_MARKERS = [
    "no longer accepting applications",      # LinkedIn
    "closed for applications",               # Internshala
    "this job has expired",
    "this job is no longer available",
    "job is closed",
    "position has been filled",
    "this position is no longer available",
    "job not found",
    "the job you are looking for is no longer",
]


def listing_is_closed(page_text: str, status_code: int) -> bool:
    if status_code in (404, 410):
        return True
    low = page_text.lower()
    return any(marker in low for marker in CLOSED_MARKERS)
