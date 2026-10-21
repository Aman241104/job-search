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


_FOREIGN_CURRENCY = re.compile(r"[$€£]|\b(?:usd|eur|gbp|cad|aud|sgd)\b")


def annual_rupee_range(salary: str) -> tuple[int, int] | None:
    """(low, high) annual rupees from strings like "₹ 2,00,000 - 3,50,000",
    "₹4L - ₹5L / yr", "₹30,000 - 35,000 /month". None if not parseable."""
    if not salary:
        return None
    s = salary.lower().replace(",", "")
    # "$80,000 - $120,000" is not ₹0.8-1.2L — read as rupees it scored
    # well-paid remote roles as badly underpaid.
    if _FOREIGN_CURRENCY.search(s):
        return None
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


# Red flags, scored negative-only (career-ops' "red flags" dimension): they
# pull a listing down however good its skill match is. Weighted for the Indian
# fresher market, where bonds and pay-to-join "jobs" are the common traps.
RED_FLAGS = [
    (re.compile(r"service (?:bond|agreement)|\bbond (?:of|for|period)|\d+[- ]?(?:year|yr)s? bond", re.I), -20, "service bond"),
    (re.compile(r"(?:registration|training|joining|security|processing) (?:fee|charges?|deposit)", re.I), -40, "asks candidate to pay"),
    (re.compile(r"commission[- ]only|only commission|no fixed salary|unpaid", re.I), -30, "no fixed pay"),
]


def red_flags(text: str) -> tuple[int, list[str]]:
    """(total penalty, labels) for the red flags present in a listing."""
    hits = [(pts, label) for pattern, pts, label in RED_FLAGS if pattern.search(text or "")]
    return sum(p for p, _ in hits), [label for _, label in hits]


# Remote roles locked to another country ("US-Remote", "Remote - Canada") and
# onsite roles abroad. Global ATS boards (Greenhouse/Lever/Ashby) are mostly
# these, and plain "remote" matching used to give them the full remote bonus.
# ponytail: deny-list, never complete — global boards also go through the
# india_eligible() allow-list below, which is the real guard for them.
_FOREIGN = re.compile(
    r"\b(?:us|usa|u\.s\.|united states|canada|uk|united kingdom|europe|eu|emea|"
    r"americas|latam|north america|germany|france|netherlands|ireland|australia|"
    r"spain|italy|poland|portugal|brazil|mexico|argentina|colombia|chile|japan|"
    r"israel|switzerland|sweden|"
    r"san francisco|new york|nyc|seattle|toronto|london|dublin|berlin|amsterdam|"
    r"washington|chicago|boston|austin|los angeles|denver|sf|ny|sea)\b",
    re.I,
)
# Word-bounded: a bare "india" also matched "Indiana" / "Indianapolis".
_OPEN_TO_INDIA = re.compile(
    r"\b(?:india|worldwide|anywhere|global|apac|asia|ahmedabad|gandhinagar|vadodara|"
    r"gujarat|bengaluru|bangalore|mumbai|pune|hyderabad|delhi|gurugram|gurgaon|"
    r"noida|chennai|kolkata)\b",
    re.I,
)


def location_abroad(location: str) -> bool:
    """True when the listing names somewhere outside India and nothing that
    lets an India-based candidate in. Unknown/blank locations are not abroad."""
    loc = location or ""
    return bool(_FOREIGN.search(loc)) and not _OPEN_TO_INDIA.search(loc)


# Words that describe a work model, not a place. What's left of a location
# after removing them (and punctuation) is the geography it names.
_NOT_A_PLACE = re.compile(
    r"\b(?:remote|hybrid|on-?site|in-?office|wfh|work from home|anywhere|worldwide|global|"
    r"distributed|flexible|first|friendly|fully|full|time|only|based|in|or|and|of|the)\b|[^a-z]",
    re.I,
)


def india_eligible(location: str) -> bool:
    """Allow-list for global boards: names India (or an Indian city, APAC,
    worldwide), or is remote and names no place at all. "China · Remote" or
    "Remote - Brazil" fail without needing every country in a deny-list."""
    loc = location or ""
    if _OPEN_TO_INDIA.search(loc):
        return True
    return "remote" in loc.lower() and not _NOT_A_PLACE.sub("", loc.lower())


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
