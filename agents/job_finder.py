import json
import re
import time
import uuid
import requests
from datetime import datetime
from pathlib import Path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATA_DIR, ADZUNA_APP_ID, ADZUNA_APP_KEY, JOOBLE_API_KEY, CAREERJET_API_KEY
from claude_client import ask_claude_json, score_job_single
from bs4 import BeautifulSoup
from rich.console import Console
from rich.progress import track

console = Console()

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

INTERNSHALA_SEARCHES = [
    ("react-js-jobs",               "India"),
    ("react-js-jobs-in-ahmedabad",  "Ahmedabad"),
    ("front-end-development-jobs",  "India"),
    ("javascript-jobs",             "India"),
    ("work-from-home-react-js-jobs","Remote"),
    ("full-stack-development-jobs", "India"),
    ("next-js-jobs",                "India"),
    ("web-development-jobs",        "India"),
    ("web-development-jobs-in-ahmedabad", "Ahmedabad"),
    ("web-development-jobs-in-vadodara", "Vadodara"),
    ("node-js-jobs",                "India"),
    ("python-django-jobs",          "India"),
    ("backend-development-jobs",    "India"),
    ("artificial-intelligence-ai-jobs", "India"),
    ("data-analytics-jobs",         "India"),
    ("data-analytics-jobs-in-ahmedabad", "Ahmedabad"),
]

CUTSHORT_SEARCHES = [
    # Cutshort answers 200 for any slug but only real category pages carry
    # job data — these were verified to return listings (Sep 2026).
    "frontend-developer-jobs-in-ahmedabad",
    "fullstack-developer-jobs-in-ahmedabad",
    "frontend-developer-jobs",
]

# Ahmedabad first (most searches), then the nearby cities within commuting
# or easy-relocation range: Gandhinagar, Vadodara (Baroda), Anand, Nadiad.
TALENT_SEARCHES = [
    ("frontend developer",   "Ahmedabad"),
    ("react developer",      "Ahmedabad"),
    ("full stack developer", "Ahmedabad"),
    ("next.js developer",    "Ahmedabad"),
    ("mern developer",       "Ahmedabad"),
    ("web developer",        "Ahmedabad"),
    ("react developer",      "Gandhinagar"),
    ("react developer",      "Vadodara"),
    ("frontend developer",   "Vadodara"),
    ("react developer",      "Anand"),
    ("web developer",        "Anand"),
    ("web developer",        "Nadiad"),
    ("backend developer",    "Ahmedabad"),
    ("python developer",     "Ahmedabad"),
    ("node.js developer",    "Ahmedabad"),
    ("ai engineer",          "Ahmedabad"),
    ("data analyst",         "Ahmedabad"),
    ("python developer",     "Vadodara"),
    ("data analyst",         "Vadodara"),
    ("software engineer",    "Gandhinagar"),
]

# Shine + Freshersworld share one "<role>-jobs-in-<city>" slug scheme.
# Every role in Ahmedabad; the core dev roles in nearby cities.
GUJARAT_ROLE_SLUGS = ["react-developer", "frontend-developer", "web-developer",
                      "full-stack-developer", "node-js-developer", "python-developer",
                      "software-developer", "data-analyst"]
GUJARAT_CITY_SLUGS = ["vadodara", "gandhinagar", "anand", "nadiad"]
GUJARAT_SEARCHES = ([(r, "ahmedabad") for r in GUJARAT_ROLE_SLUGS] +
                    [(r, c) for c in GUJARAT_CITY_SLUGS
                     for r in ("web-developer", "software-developer", "react-developer")])

# Remote first, then Ahmedabad and nearby cities (commutable or easy move).
DEFAULT_LOCATIONS = ['remote', 'ahmedabad', 'gandhinagar', 'vadodara', 'baroda',
                     'anand', 'nadiad', 'kheda', 'gujarat']

SENIOR_WORDS = {"staff", "principal", "lead", "senior", "sr.", "head of",
                "director", "manager", "architect", "vp", "vice president", "cto"}


class JobFinderAgent:
    def __init__(self, profile: dict = None, user_id: str = None):
        """profile: the calling user's `profiles` row (skills, skill_weights,
        location_preference, target_lpa, salary_weight, location_weight,
        min_score_threshold, enabled_sources) — scoring/source-selection was
        hardcoded to Aman's own profile as class constants before per-user
        accounts existed. None (e.g. CLI/legacy callers) falls back to those
        original defaults.

        user_id: when set (the web app's real call sites), existing-job
        dedup checks the user's actual Postgres `jobs` rows instead of the
        flat `found_jobs.json` cache — that cache lives on Cloud Run's
        per-container ephemeral filesystem and is effectively always empty
        there, which silently defeated this dedup check for every web user
        since the multi-tenant migration (same failure mode already caught
        once for /api/stats, see app.py's comment near its score-breakdown
        query — never fixed at the root here until now). CLI/legacy callers
        (user_id=None) keep using the flat file, since main.py's CLI flow
        was never migrated to Postgres-backed persistence."""
        self.profile = profile or {}
        self.user_id = user_id
        self.jobs_file = Path(DATA_DIR) / "found_jobs.json"
        self.existing_urls, self.existing_title_company = self._load_existing()

    @staticmethod
    def _normalize_key(text: str) -> str:
        """Loose fuzzy-match key for cross-source dedup — the same posting
        cross-posted to two source APIs typically has an identical title and
        company string modulo case/whitespace/punctuation, even though the
        URLs are completely different."""
        return re.sub(r"[^a-z0-9]+", "", (text or "").lower())

    def _title_company_key(self, title: str, company: str) -> str:
        return f"{self._normalize_key(title)}|{self._normalize_key(company)}"

    def _load_existing(self) -> tuple:
        if self.user_id:
            from agents.tracker import TrackerAgent
            with TrackerAgent()._get_conn() as conn:
                conn.row_factory = True
                rows = conn.execute(
                    "SELECT url, title, company FROM jobs WHERE user_id = ?", (self.user_id,)
                ).fetchall()
            urls = {r["url"] for r in rows if r.get("url")}
            title_company = {self._title_company_key(r.get("title", ""), r.get("company", "")) for r in rows}
            return urls, title_company

        if self.jobs_file.exists():
            with open(self.jobs_file) as f:
                existing = json.load(f)
            urls = {j["url"] for j in existing}
            title_company = {self._title_company_key(j.get("title", ""), j.get("company", "")) for j in existing}
            return urls, title_company
        return set(), set()

    def _load_all_jobs(self) -> list:
        if self.jobs_file.exists():
            with open(self.jobs_file) as f:
                return json.load(f)
        return []

    def _save_jobs(self, new_jobs: list) -> int:
        existing = self._load_all_jobs()
        existing_urls = {j["url"] for j in existing}
        added = 0
        for job in new_jobs:
            if job["url"] and job["url"] not in existing_urls:
                existing.append(job)
                existing_urls.add(job["url"])
                added += 1
        with open(self.jobs_file, "w") as f:
            json.dump(existing, f, indent=2, default=str)
        return added

    @staticmethod
    def _is_senior(title: str) -> bool:
        tl = title.lower()
        return any(w in tl for w in SENIOR_WORDS)

    # ── Source 1: Internshala scraper (best for Indian freshers) ──────────────

    def _scrape_internshala(self, slug: str, default_location: str) -> list:
        url = f"https://internshala.com/jobs/{slug}/"
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
        except Exception as e:
            console.print(f"[yellow]Internshala [{slug}] failed: {e}[/yellow]")
            return []

        soup = BeautifulSoup(r.text, "lxml")
        jobs = []
        for card in soup.select(".individual_internship"):
            try:
                title_el  = card.select_one(".job-title-href")
                company_el = card.select_one(".company-name")
                loc_el    = card.select_one(".locations span")
                salary_el = card.select_one(".row-1-item .desktop")
                desc_el   = card.select_one(".about_job .text")
                href      = card.get("data-href", "")

                title   = title_el.get_text(strip=True)   if title_el   else ""
                company = company_el.get_text(strip=True) if company_el else ""
                loc     = loc_el.get_text(strip=True)     if loc_el     else default_location
                salary  = salary_el.get_text(strip=True)  if salary_el  else "Not specified"
                desc    = desc_el.get_text(strip=True)    if desc_el    else ""
                full_url = f"https://internshala.com{href}" if href else ""

                if not title or not full_url:
                    continue

                jobs.append({
                    "id":           str(uuid.uuid4()),
                    "title":        title,
                    "company":      company,
                    "description":  desc[:2000],
                    "url":          full_url,
                    "source":       "Internshala",
                    "location":     loc,
                    "salary":       salary,
                    "date_posted":  "",
                    "tags":         [],
                    "score":        0,
                    "score_reason": "",
                    "date_found":   datetime.now().isoformat(),
                })
            except Exception:
                continue
        return jobs

    # ── Cutshort (Indian startups — search pages embed full job JSON) ──────────

    def _fetch_cutshort(self, slug: str) -> list:
        """Reads the job list from the page's __NEXT_DATA__ blob rather than
        the rendered cards — it carries expRange, which matters here: most
        Cutshort Ahmedabad listings want 3+ years, so anything whose minimum
        experience is above 1 year is dropped before it ever gets scored."""
        url = f"https://cutshort.io/jobs/{slug}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
            data = json.loads(m.group(1)) if m else {}
            raw = data["props"]["pageProps"]["dehydratedState"]["queries"][0]["state"]["data"]["data"]["pageData"]["jobs"]
        except Exception as e:
            console.print(f"[yellow]Cutshort [{slug}] failed: {e}[/yellow]")
            return []

        jobs = []
        for j in raw:
            title = (j.get("headline") or "").strip()
            link = j.get("publicUrl") or ""
            exp_min = (j.get("expRange") or {}).get("min")
            if not title or not link or self._is_senior(title):
                continue
            if exp_min is not None and exp_min > 1:
                continue
            desc = BeautifulSoup(j.get("sanitizedComment") or "", "lxml").get_text(" ", strip=True)
            remote = j.get("remoteType") not in (None, "remote_not_okay")
            location = j.get("locationsText") or ""
            jobs.append({
                "id":           str(uuid.uuid4()),
                "title":        title,
                "company":      (j.get("companyDetails") or {}).get("name", ""),
                "description":  desc[:2000],
                "url":          link,
                "source":       "Cutshort",
                "location":     f"{location} (Remote OK)" if remote and location else (location or "Remote"),
                "salary":       j.get("salaryRangeText") or "Not specified",
                "date_posted":  "",
                "tags":         (j.get("allSkills") or [])[:10],
                "score":        0,
                "score_reason": "",
                "date_found":   datetime.now().isoformat(),
            })
        return jobs

    # ── Talent.com (aggregator — strong Gujarat coverage) ──────────────────────

    def _fetch_talent(self, keyword: str, location: str) -> list:
        """Parses the server-rendered search cards. Class names carry a build
        hash suffix (JobCard_title__X32Qk), so match on the stable prefix."""
        try:
            r = requests.get("https://in.talent.com/jobs",
                             params={"k": keyword, "l": location},
                             headers=HEADERS, timeout=20)
            r.raise_for_status()
        except Exception as e:
            console.print(f"[yellow]Talent.com [{keyword} / {location}] failed: {e}[/yellow]")
            return []

        soup = BeautifulSoup(r.text, "lxml")
        pick = lambda card, name: card.select_one(f'[class*="JobCard_{name}__"]')
        jobs = []
        for card in soup.select('[class*="JobCard_card__"]'):
            link = card.find("a", href=re.compile(r"/view\?id="))
            title_el, company_el = pick(card, "title"), pick(card, "company")
            if not link or not title_el:
                continue
            title = title_el.get_text(strip=True)
            if self._is_senior(title):
                continue
            # "Last updated: 30+ days ago" listings are usually already filled
            age = (pick(card, "timeText").get_text(strip=True) if pick(card, "timeText") else "")
            if "30+" in age:
                continue
            loc_el, snippet_el = pick(card, "location"), pick(card, "snippet")
            href = link["href"]
            jobs.append({
                "id":           str(uuid.uuid4()),
                "title":        title,
                "company":      company_el.get_text(strip=True) if company_el else "",
                "description":  snippet_el.get_text(" ", strip=True)[:2000] if snippet_el else "",
                # strip tracking params — the id alone is the canonical listing
                "url":          "https://in.talent.com" + href.split("&")[0] if href.startswith("/") else href.split("&")[0],
                "source":       "Talent.com",
                "location":     loc_el.get_text(strip=True) if loc_el else location,
                "salary":       "Not specified",
                "date_posted":  "",
                "tags":         [],
                "score":        0,
                "score_reason": "",
                "date_found":   datetime.now().isoformat(),
            })
        return jobs

    @staticmethod
    def _min_years(text: str):
        """'0 to 4 Yrs' / '1-3 years' / '0 Years' -> lower bound, or None."""
        m = re.search(r"(\d+)\s*(?:to|-|–)?\s*\d*\s*(?:yrs?|years?)", text or "", re.I)
        return int(m.group(1)) if m else None

    # ── Shine.com (HT Media board — large Gujarat inventory) ───────────────────

    def _fetch_shine(self, role: str, city: str) -> list:
        url = f"https://www.shine.com/job-search/{role}-jobs-in-{city}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
        except Exception as e:
            console.print(f"[yellow]Shine [{role} / {city}] failed: {e}[/yellow]")
            return []
        soup = BeautifulSoup(r.text, "lxml")
        pick = lambda card, name: card.select(f'[class*="result-card_{name}__"]')
        jobs = []
        for card in soup.select('[class*="result-card_card__"]'):
            role_el, link = pick(card, "role"), card.find("a", href=re.compile(r"^/jobs/"))
            if not role_el or not link:
                continue
            title = role_el[0].get_text(" ", strip=True)
            meta = [m.get_text(" ", strip=True) for m in pick(card, "meta-text")]  # [exp, salary, location]
            exp_min = self._min_years(meta[0] if meta else "")
            if self._is_senior(title) or (exp_min is not None and exp_min > 1):
                continue
            company = pick(card, "company")
            jobs.append({
                "id":           str(uuid.uuid4()),
                "title":        title,
                "company":      company[0].get_text(strip=True) if company else "",
                "description":  f"Experience: {meta[0] if meta else 'n/a'}",
                "url":          "https://www.shine.com" + link["href"].split("?")[0],
                "source":       "Shine",
                "location":     meta[2] if len(meta) > 2 else city.title(),
                "salary":       meta[1] if len(meta) > 1 and "disclosed" not in meta[1].lower() else "Not specified",
                "date_posted":  "",
                "tags":         [],
                "score":        0,
                "score_reason": "",
                "date_found":   datetime.now().isoformat(),
            })
        return jobs

    # ── Freshersworld (fresher-only board, lots of Gujarat service companies) ──

    def _fetch_freshersworld(self, role: str, city: str) -> list:
        url = f"https://www.freshersworld.com/jobs/jobsearch/{role}-jobs-in-{city}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
        except Exception as e:
            console.print(f"[yellow]Freshersworld [{role} / {city}] failed: {e}[/yellow]")
            return []
        soup = BeautifulSoup(r.text, "lxml")
        text = lambda card, sel: (card.select_one(sel).get_text(" ", strip=True) if card.select_one(sel) else "")
        jobs = []
        for card in soup.select(".job-container[job_display_url]"):
            # ".job-new-title" reads "<Role> Jobs Opening in <Company> at <City> Less More"
            raw_title = text(card, ".job-new-title")
            title = re.split(r"\s+Jobs? Opening in\s+", raw_title)[0].strip()
            if not title or self._is_senior(title):
                continue
            exp_min = self._min_years(text(card, ".experience"))
            if exp_min is not None and exp_min > 1:
                continue
            salary = text(card, ".qualifications")  # the site's own class name for the salary line
            jobs.append({
                "id":           str(uuid.uuid4()),
                "title":        title,
                "company":      text(card, ".company-name"),
                "description":  f"Experience: {text(card, '.experience') or 'n/a'}. Fresher-focused listing (Freshersworld).",
                "url":          card["job_display_url"],
                "source":       "Freshersworld",
                "location":     text(card, ".job-location") or city.title(),
                "salary":       salary if salary and "not disclosed" not in salary.lower() else "Not specified",
                "date_posted":  "",
                "tags":         [],
                "score":        0,
                "score_reason": "",
                "date_found":   datetime.now().isoformat(),
            })
        return jobs

    # ── Source 2: Jobicy (free remote job API) ─────────────────────────────────

    SENIOR_LEVELS = {"senior", "lead", "staff", "principal", "director", "head", "vp", "manager"}

    def _fetch_jobicy(self, tag: str) -> list:
        try:
            r = requests.get(
                "https://jobicy.com/api/v2/remote-jobs",
                params={"count": 20, "tag": tag},
                headers=HEADERS,
                timeout=15,
            )
            r.raise_for_status()
            jobs = []
            for j in r.json().get("jobs", []):
                level = (j.get("jobLevel") or "").lower()
                if any(w in level for w in self.SENIOR_LEVELS):
                    continue
                jobs.append({
                    "id":           str(uuid.uuid4()),
                    "title":        j.get("jobTitle", ""),
                    "company":      j.get("companyName", ""),
                    "description":  (j.get("jobDescription") or j.get("jobExcerpt") or "")[:2000],
                    "url":          j.get("url", ""),
                    "source":       "Jobicy",
                    "location":     j.get("jobGeo", "Remote"),
                    "salary":       "",
                    "date_posted":  j.get("pubDate", ""),
                    "tags":         j.get("jobType", []),
                    "score":        0,
                    "score_reason": "",
                    "date_found":   datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f"[yellow]Jobicy [{tag}] failed: {e}[/yellow]")
            return []

    # ── Source 3b: WeWorkRemotely (remote programming jobs RSS) ───────────────

    def _fetch_weworkremotely(self) -> list:
        try:
            r = requests.get(
                "https://weworkremotely.com/categories/remote-programming-jobs.rss",
                headers=HEADERS, timeout=15,
            )
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "lxml-xml")
            jobs = []
            seen: set = set()
            for item in soup.find_all("item"):
                try:
                    title_raw = item.find("title").get_text() if item.find("title") else ""
                    company, title = (title_raw.split(": ", 1) if ": " in title_raw else ("", title_raw))
                    guid = item.find("guid")
                    url = guid.get_text().strip() if guid else ""
                    if not url or url in seen:
                        continue
                    seen.add(url)
                    desc_el = item.find("description")
                    desc = BeautifulSoup(desc_el.get_text(), "html.parser").get_text(separator=" ")[:2000] if desc_el else ""
                    region_el = item.find("region")
                    location = region_el.get_text().strip() if region_el else "Remote"
                    pub = item.find("pubDate")
                    jobs.append({
                        "id": str(uuid.uuid4()),
                        "title": title.strip(),
                        "company": company.strip(),
                        "description": desc,
                        "url": url,
                        "source": "WeWorkRemotely",
                        "location": location,
                        "salary": "",
                        "date_posted": pub.get_text() if pub else "",
                        "tags": [],
                        "score": 0, "score_reason": "",
                        "date_found": datetime.now().isoformat(),
                    })
                except Exception:
                    continue
            return jobs
        except Exception as e:
            console.print(f"[yellow]WeWorkRemotely failed: {e}[/yellow]")
            return []

    # ── Source 3c: Arbeitnow (free API — remote & worldwide tech) ─────────────

    def _fetch_arbeitnow(self) -> list:
        try:
            r = requests.get("https://arbeitnow.com/api/job-board-api", headers=HEADERS, timeout=15)
            r.raise_for_status()
            jobs = []
            TECH_KW = {"react", "javascript", "typescript", "frontend", "front-end",
                       "fullstack", "full-stack", "full stack", "node", "next.js", "nextjs"}
            for j in r.json().get("data", []):
                tags_lower = " ".join(j.get("tags", [])).lower()
                title_lower = j.get("title", "").lower()
                if not any(kw in tags_lower or kw in title_lower for kw in TECH_KW):
                    continue
                jobs.append({
                    "id": str(uuid.uuid4()),
                    "title": j.get("title", ""),
                    "company": j.get("company_name", ""),
                    "description": j.get("description", "")[:2000],
                    "url": j.get("url", ""),
                    "source": "Arbeitnow",
                    "location": "Remote" if j.get("remote") else (j.get("location") or ""),
                    "salary": "",
                    "date_posted": j.get("created_at", ""),
                    "tags": j.get("tags", []),
                    "score": 0, "score_reason": "",
                    "date_found": datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f"[yellow]Arbeitnow failed: {e}[/yellow]")
            return []

    # ── Source: LinkedIn Jobs Guest API (no auth needed) ─────────────────────

    LINKEDIN_SEARCHES = [
        {"keywords": "React Developer",      "location": "India",      "f_E": "2"},
        {"keywords": "Frontend Developer",   "location": "India",      "f_E": "2"},
        {"keywords": "Full Stack Developer", "location": "India",      "f_E": "2"},
        {"keywords": "Next.js Developer",    "location": "India",      "f_E": "2"},
        {"keywords": "React Developer",      "location": "Ahmedabad"},
        {"keywords": "Frontend Developer",   "location": "Ahmedabad"},
        {"keywords": "Web Developer",        "location": "Ahmedabad"},
        {"keywords": "Backend Developer",    "location": "India",      "f_E": "2"},
        {"keywords": "Python Developer",     "location": "Ahmedabad"},
        {"keywords": "AI Engineer",          "location": "India",      "f_E": "2"},
        {"keywords": "Data Analyst",         "location": "Ahmedabad"},
        {"keywords": "Software Engineer",    "location": "Vadodara"},
        {"keywords": "Software Engineer",    "location": "Gandhinagar"},
    ]

    def _fetch_linkedin(self) -> list:
        jobs = []
        seen: set = set()
        for search in self.LINKEDIN_SEARCHES:
            try:
                params = {**search, "start": 0}
                r = requests.get(
                    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
                    params=params, headers=HEADERS, timeout=20,
                )
                r.raise_for_status()
                soup = BeautifulSoup(r.text, "html.parser")
                for card in soup.select(".job-search-card"):
                    try:
                        link_el = card.select_one("a.base-card__full-link")
                        url = (link_el.get("href", "") or "").split("?")[0]  # strip tracking
                        if not url or url in seen:
                            continue
                        title_el = card.select_one(".base-search-card__title")
                        company_el = card.select_one(".base-search-card__subtitle")
                        loc_el = card.select_one(".job-search-card__location")
                        date_el = card.select_one("time")
                        title = title_el.get_text(strip=True) if title_el else ""
                        if not title or self._is_senior(title):
                            continue
                        seen.add(url)
                        jobs.append({
                            "id": str(uuid.uuid4()),
                            "title": title,
                            "company": company_el.get_text(strip=True) if company_el else "",
                            "description": "",
                            "url": url,
                            "source": "LinkedIn",
                            "location": loc_el.get_text(strip=True) if loc_el else search.get("location", "India"),
                            "salary": "",
                            "date_posted": date_el.get("datetime", "") if date_el else "",
                            "tags": [],
                            "score": 0, "score_reason": "",
                            "date_found": datetime.now().isoformat(),
                        })
                    except Exception:
                        continue
            except Exception as e:
                console.print(f"[yellow]LinkedIn [{search.get('keywords')}] failed: {e}[/yellow]")
        # NOT calling _enrich_linkedin_descriptions() here by default — live
        # testing 2026-07-04 showed repeated use escalates LinkedIn's
        # anti-bot system (explicit [ANTIBOT] errors, success rate dropped
        # from 15/15 to 4/43 across two sessions minutes apart). The real
        # risk isn't the enrichment failing gracefully (it does) — it's that
        # continued individual-page visits could get this IP flagged broadly
        # enough to also break the guest search API above, which already
        # works reliably today. Call self._enrich_linkedin_descriptions(jobs)
        # manually/locally if you want to try it anyway, with max_jobs kept low.
        return jobs

    def _enrich_linkedin_descriptions(self, jobs: list, max_jobs: int = 15) -> None:
        """
        The guest search API above never includes the job description — only
        the individual job page has it, and that page is JS-rendered and more
        aggressively bot-protected than the search API. Uses Crawl4AI
        (headless browser, concurrency=1) to fetch real description text for
        up to `max_jobs` of the found postings, paced 2s apart. Deliberately
        NOT applied to Himalayas (see its own comment) — that source is
        blocked by a Cloudflare TLS-fingerprint check, not a JS-rendering
        gap, so a headless browser doesn't reliably help there anyway.
        Any per-job failure just leaves that job's description empty (today's
        behavior) — never crashes the rest of the scrape run over this.
        """
        if not jobs:
            return
        try:
            import asyncio
            from crawl4ai import AsyncWebCrawler
        except ImportError:
            return  # crawl4ai not installed in this environment — descriptions just stay empty

        # LinkedIn gates the full description behind a login wall for guests
        # on some postings (varies per-company/posting, not predictable up
        # front) — when that happens the "content" after the title heading is
        # actually the sign-in prompt, not a real description. Reject text
        # dominated by these tells rather than storing login-wall junk as if
        # it were a job description.
        LOGIN_WALL_TELLS = ("forgot password", "join or sign in to find your next job", "email or phone")

        def _looks_like_login_wall(text: str) -> bool:
            lowered = text[:600].lower()
            return sum(1 for tell in LOGIN_WALL_TELLS if tell in lowered) >= 2

        async def _fetch_all():
            async with AsyncWebCrawler() as crawler:
                for job in jobs[:max_jobs]:
                    try:
                        result = await crawler.arun(url=job["url"])
                        if result.success and result.markdown:
                            md = result.markdown
                            marker = f"### {job['title']}"
                            idx = md.find(marker)
                            text = (md[idx + len(marker):] if idx != -1 else md).strip()
                            if text and not _looks_like_login_wall(text):
                                job["description"] = text[:3000]
                    except Exception:
                        continue  # this job's description stays empty, not fatal
                    await asyncio.sleep(2)  # pacing — avoid hammering LinkedIn

        try:
            asyncio.run(_fetch_all())
        except Exception as e:
            console.print(f"[yellow]LinkedIn description enrichment failed: {e}[/yellow]")

    # ── Source: Remotive (free REST API — curated remote tech jobs) ──────────

    REMOTIVE_TITLE_KW = {
        "developer", "engineer", "frontend", "front-end", "full stack", "fullstack",
        "react", "javascript", "typescript", "node", "next.js", "software", "web",
        "ui ", "ux ", "ui/ux", "devops", "backend", "back-end", "python", "java ",
    }

    def _fetch_remotive(self) -> list:
        jobs = []
        seen: set = set()
        for cat in ["software-dev", "frontend"]:
            try:
                r = requests.get(
                    "https://remotive.com/api/remote-jobs",
                    params={"category": cat, "limit": 50},
                    headers=HEADERS, timeout=15,
                )
                r.raise_for_status()
                for j in r.json().get("jobs", []):
                    url = j.get("url", "")
                    if not url or url in seen:
                        continue
                    title_lower = j.get("title", "").lower()
                    if not any(kw in title_lower for kw in self.REMOTIVE_TITLE_KW):
                        continue
                    seen.add(url)
                    desc_raw = j.get("description", "")
                    desc = BeautifulSoup(desc_raw, "html.parser").get_text(separator=" ")[:2000] if desc_raw else ""
                    jobs.append({
                        "id": str(uuid.uuid4()),
                        "title": j.get("title", ""),
                        "company": j.get("company_name", ""),
                        "description": desc,
                        "url": url,
                        "source": "Remotive",
                        "location": j.get("candidate_required_location", "Remote") or "Remote",
                        "salary": j.get("salary", ""),
                        "date_posted": j.get("publication_date", ""),
                        "tags": j.get("tags", []),
                        "score": 0, "score_reason": "",
                        "date_found": datetime.now().isoformat(),
                    })
            except Exception as e:
                console.print(f"[yellow]Remotive [{cat}] failed: {e}[/yellow]")
        return jobs

    # ── Source: RemoteOK (tag-specific JSON API — remote dev jobs) ───────────

    def _fetch_remoteok(self) -> list:
        jobs = []
        seen: set = set()
        for tag in ["react", "javascript", "typescript", "frontend"]:
            try:
                r = requests.get(
                    f"https://remoteok.com/api?tag={tag}",
                    headers={**HEADERS, "Accept": "application/json"},
                    timeout=15,
                )
                r.raise_for_status()
                data = r.json()
                for j in data[1:]:  # first item is a notice object
                    if not isinstance(j, dict):
                        continue
                    title = j.get("position", "")
                    if self._is_senior(title):
                        continue
                    if not any(kw in title.lower() for kw in self.REMOTIVE_TITLE_KW):
                        continue
                    url = j.get("url", "") or f"https://remoteok.com/remote-jobs/{j.get('slug', '')}"
                    if not url or url in seen:
                        continue
                    seen.add(url)
                    desc_raw = j.get("description", "")
                    desc = BeautifulSoup(desc_raw, "html.parser").get_text(separator=" ")[:2000] if desc_raw else ""
                    jobs.append({
                        "id": str(uuid.uuid4()),
                        "title": j.get("position", ""),
                        "company": j.get("company", ""),
                        "description": desc,
                        "url": url,
                        "source": "RemoteOK",
                        "location": j.get("location", "Remote") or "Remote",
                        "salary": j.get("salary", ""),
                        "date_posted": j.get("date", ""),
                        "tags": j.get("tags", []),
                        "score": 0, "score_reason": "",
                        "date_found": datetime.now().isoformat(),
                    })
            except Exception as e:
                console.print(f"[yellow]RemoteOK [{tag}] failed: {e}[/yellow]")
        return jobs

    # ── Source: The Muse (free REST API — entry-level engineering jobs) ────────

    def _fetch_themuse(self) -> list:
        TECH_TITLES = {"react", "javascript", "typescript", "frontend", "full stack",
                       "fullstack", "software engineer", "web developer", "node", "ui developer"}
        try:
            jobs = []
            seen: set = set()
            for page in range(3):
                r = requests.get(
                    "https://www.themuse.com/api/public/jobs",
                    params={
                        "category": "Engineering",
                        "level": "Entry Level",
                        "page": page,
                        "descending": "true",
                    },
                    headers=HEADERS, timeout=15,
                )
                r.raise_for_status()
                results = r.json().get("results", [])
                if not results:
                    break
                for j in results:
                    url = j.get("refs", {}).get("landing_page", "")
                    if not url or url in seen:
                        continue
                    title = j.get("name", "").lower()
                    if not any(t in title for t in TECH_TITLES):
                        continue
                    seen.add(url)
                    locs = j.get("locations", [])
                    location = locs[0]["name"] if locs else "Remote"
                    desc = BeautifulSoup(j.get("contents", ""), "html.parser").get_text(separator=" ")[:2000]
                    jobs.append({
                        "id": str(uuid.uuid4()),
                        "title": j.get("name", ""),
                        "company": j.get("company", {}).get("name", ""),
                        "description": desc,
                        "url": url,
                        "source": "TheMuse",
                        "location": location,
                        "salary": "",
                        "date_posted": j.get("publication_date", ""),
                        "tags": [cat["name"] for cat in j.get("categories", [])],
                        "score": 0, "score_reason": "",
                        "date_found": datetime.now().isoformat(),
                    })
            return jobs
        except Exception as e:
            console.print(f"[yellow]TheMuse failed: {e}[/yellow]")
            return []

    # ── Source: Remote.co (RSS feed — developer remote jobs) ─────────────────

    def _fetch_remoteco(self) -> list:
        try:
            r = requests.get(
                "https://remote.co/remote-jobs/developer/feed/",
                headers=HEADERS, timeout=15,
            )
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "lxml-xml")
            jobs = []
            seen: set = set()
            for item in soup.find_all("item"):
                try:
                    title_el = item.find("title")
                    link_el = item.find("link")
                    desc_el = item.find("description")
                    pub_el = item.find("pubDate")
                    title = title_el.get_text().strip() if title_el else ""
                    url = link_el.get_text().strip() if link_el else ""
                    if not url or url in seen or not title:
                        continue
                    seen.add(url)
                    desc = BeautifulSoup(desc_el.get_text(), "html.parser").get_text(separator=" ")[:2000] if desc_el else ""
                    # title format: "Job Title at Company"
                    company = ""
                    if " at " in title:
                        parts = title.rsplit(" at ", 1)
                        title, company = parts[0].strip(), parts[1].strip()
                    jobs.append({
                        "id": str(uuid.uuid4()),
                        "title": title,
                        "company": company,
                        "description": desc,
                        "url": url,
                        "source": "Remote.co",
                        "location": "Remote",
                        "salary": "",
                        "date_posted": pub_el.get_text() if pub_el else "",
                        "tags": [],
                        "score": 0, "score_reason": "",
                        "date_found": datetime.now().isoformat(),
                    })
                except Exception:
                    continue
            return jobs
        except Exception as e:
            console.print(f"[yellow]Remote.co RSS failed: {e}[/yellow]")
            return []

    # ── Source: Himalayas (free API — remote-first job board) ────────────────
    # Cloudflare-protected: this endpoint 403s a JS-challenge page consistently
    # when hit via Python `requests` (tested repeatedly), even though the same
    # URL works fine from plain curl — a TLS/client-fingerprint block, not a
    # header problem. Left in as best-effort since it fails safe to [] and
    # Render's IP reputation may differ from this test environment's, but
    # don't expect real results from it without a browser-based fetch.

    HIMALAYAS_TECH_KW = {
        "react", "javascript", "typescript", "frontend", "front-end", "full stack",
        "fullstack", "next.js", "nextjs", "node", "software engineer", "web developer",
        "ui developer",
    }

    def _fetch_himalayas(self) -> list:
        try:
            r = requests.get(
                "https://himalayas.app/jobs/api",
                params={"limit": 60},
                headers=HEADERS, timeout=15,
            )
            r.raise_for_status()
            jobs = []
            for j in r.json().get("jobs", []):
                title = j.get("title", "")
                title_lower = title.lower()
                if not any(kw in title_lower for kw in self.HIMALAYAS_TECH_KW):
                    continue
                if self._is_senior(title):
                    continue
                restrictions = j.get("locationRestrictions") or []
                # keep worldwide-open roles, or roles that explicitly allow India
                if restrictions and "India" not in restrictions:
                    continue
                seniority = j.get("seniority") or []
                salary = ""
                if j.get("minSalary"):
                    salary = f"{j['minSalary']}-{j.get('maxSalary', '')} {j.get('currency', '')}".strip()
                jobs.append({
                    "id": str(uuid.uuid4()),
                    "title": title,
                    "company": j.get("companyName", ""),
                    "description": BeautifulSoup(j.get("description") or j.get("excerpt", ""), "html.parser").get_text(separator=" ")[:2000],
                    "url": j.get("applicationLink") or j.get("guid", ""),
                    "source": "Himalayas",
                    "location": "Remote (Worldwide)" if not restrictions else f"Remote ({', '.join(restrictions[:3])})",
                    "salary": salary,
                    "date_posted": str(j.get("pubDate", "")),
                    "tags": seniority,
                    "score": 0, "score_reason": "",
                    "date_found": datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f"[yellow]Himalayas failed: {e}[/yellow]")
            return []

    # ── Source: Hacker News "Who is hiring" (monthly thread, real startups) ──

    HN_TECH_KW = {
        "react", "javascript", "typescript", "frontend", "front-end", "full stack",
        "fullstack", "next.js", "nextjs", "node", "software engineer", "web developer",
        "ui developer", "junior", "entry level", "entry-level", "new grad",
    }
    HN_JUNIOR_OVERRIDE_KW = {"junior", "entry level", "entry-level", "new grad", "no experience"}

    def _fetch_hn_hiring(self) -> list:
        try:
            search = requests.get(
                "https://hn.algolia.com/api/v1/search_by_date",
                params={"tags": "story,author_whoishiring", "query": "Who is hiring"},
                headers=HEADERS, timeout=15,
            )
            search.raise_for_status()
            hits = search.json().get("hits", [])
            thread = next(
                (h for h in hits if (h.get("title") or "").lower().startswith("ask hn: who is hiring")),
                None,
            )
            if not thread:
                return []

            r = requests.get(
                f"https://hn.algolia.com/api/v1/items/{thread['objectID']}",
                headers=HEADERS, timeout=20,
            )
            r.raise_for_status()

            jobs = []
            for c in r.json().get("children", []) or []:
                raw = c.get("text") or ""
                if not raw or c.get("dead") or c.get("deleted"):
                    continue

                split_idx = raw.find("<p>")
                header_html = raw if split_idx == -1 else raw[:split_idx]
                body_html   = "" if split_idx == -1 else raw[split_idx:]
                header = BeautifulSoup(header_html, "html.parser").get_text(separator=" ").strip()
                body   = BeautifulSoup(body_html, "html.parser").get_text(separator=" ").strip()
                combined_lower = (header + " " + body).lower()

                if "remote" not in combined_lower:
                    continue
                if not any(kw in combined_lower for kw in self.HN_TECH_KW):
                    continue
                if self._is_senior(header) and not any(kw in combined_lower for kw in self.HN_JUNIOR_OVERRIDE_KW):
                    continue

                company = header.split("|")[0].strip() if "|" in header else ""
                jobs.append({
                    "id": str(uuid.uuid4()),
                    "title": header[:150] or "Remote Software Role",
                    "company": company,
                    "description": (body or header)[:2000],
                    "url": f"https://news.ycombinator.com/item?id={c.get('id')}",
                    "source": "HN Who's Hiring",
                    "location": "Remote",
                    "salary": "",
                    "date_posted": thread.get("created_at", ""),
                    "tags": [],
                    "score": 0, "score_reason": "",
                    "date_found": datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f"[yellow]HN Who's Hiring failed: {e}[/yellow]")
            return []

    # ── Source 3: Adzuna (optional, needs free API key) ───────────────────────

    def _fetch_adzuna(self, keyword: str, where: str = "") -> list:
        if not ADZUNA_APP_ID or not ADZUNA_APP_KEY:
            return []
        try:
            params = {
                "app_id": ADZUNA_APP_ID, "app_key": ADZUNA_APP_KEY,
                "results_per_page": 15, "what": keyword,
                "content-type": "application/json",
            }
            if where:
                params["where"] = where
            r = requests.get("https://api.adzuna.com/v1/api/jobs/in/search/1", params=params, timeout=15)
            r.raise_for_status()
            jobs = []
            for j in r.json().get("results", []):
                sal_min = j.get("salary_min", "")
                sal_max = j.get("salary_max", "")
                jobs.append({
                    "id":           str(uuid.uuid4()),
                    "title":        j.get("title", ""),
                    "company":      j.get("company", {}).get("display_name", ""),
                    "description":  j.get("description", "")[:2000],
                    "url":          j.get("redirect_url", ""),
                    "source":       f"Adzuna ({where or 'India'})",
                    "location":     j.get("location", {}).get("display_name", where or "India"),
                    "salary":       f"₹{sal_min} - ₹{sal_max}".strip("₹ -") or "Not specified",
                    "date_posted":  j.get("created", ""),
                    "tags":         [],
                    "score":        0,
                    "score_reason": "",
                    "date_found":   datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f"[yellow]Adzuna failed: {e}[/yellow]")
            return []

    # ── Source: Jooble (free REST API, key-based — official, no bot-detection
    # surface at all, same trust tier as Adzuna) ──────────────────────────────

    def _fetch_jooble(self, keyword: str, location: str = "India") -> list:
        if not JOOBLE_API_KEY:
            return []
        try:
            r = requests.post(
                f"https://jooble.org/api/{JOOBLE_API_KEY}",
                json={"keywords": keyword, "location": location},
                headers={"Content-Type": "application/json"},
                timeout=15,
            )
            r.raise_for_status()
            jobs = []
            for j in r.json().get("jobs", []):
                title = j.get("title", "")
                if self._is_senior(title):
                    continue
                jobs.append({
                    "id":           str(uuid.uuid4()),
                    "title":        title,
                    "company":      j.get("company", ""),
                    "description":  BeautifulSoup(j.get("snippet", ""), "html.parser").get_text(separator=" ")[:2000],
                    "url":          j.get("link", ""),
                    "source":       "Jooble",
                    "location":     j.get("location", location),
                    "salary":       j.get("salary", "") or "Not specified",
                    "date_posted":  j.get("updated", ""),
                    "tags":         [],
                    "score":        0,
                    "score_reason": "",
                    "date_found":   datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f"[yellow]Jooble failed: {e}[/yellow]")
            return []

    # ── Source: Careerjet (free REST API, key-based — official, 1000 req/hr) ─

    def _fetch_careerjet(self, keyword: str, location: str = "India") -> list:
        if not CAREERJET_API_KEY:
            return []
        try:
            r = requests.get(
                "http://public.api.careerjet.net/search",
                params={
                    "keywords": keyword, "location": location,
                    "affid": CAREERJET_API_KEY, "user_ip": "1.1.1.1",
                    "user_agent": HEADERS["User-Agent"], "url": "https://job-serach.local/",
                    "pagesize": 20,
                },
                timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            if data.get("type") != "JOBS":
                return []
            jobs = []
            for j in data.get("jobs", []):
                title = j.get("title", "")
                if self._is_senior(title):
                    continue
                jobs.append({
                    "id":           str(uuid.uuid4()),
                    "title":        title,
                    "company":      j.get("company", ""),
                    "description":  BeautifulSoup(j.get("description", ""), "html.parser").get_text(separator=" ")[:2000],
                    "url":          j.get("url", ""),
                    "source":       "Careerjet",
                    "location":     j.get("locations", "") or location,
                    "salary":       j.get("salary", "") or "Not specified",
                    "date_posted":  j.get("date", ""),
                    "tags":         [],
                    "score":        0,
                    "score_reason": "",
                    "date_found":   datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f"[yellow]Careerjet failed: {e}[/yellow]")
            return []

    # Fallback only — real values now come from the calling user's profile
    # (see _profile_summary/_skill_weights/etc below). Kept so a caller with
    # no profile (CLI, legacy code) still gets a sane default instead of an
    # empty/broken scorer.
    DEFAULT_PROFILE_SUMMARY = (
        "Fresher, 2026 grad. Skills: React Next.js TypeScript JavaScript Tailwind Node.js Express MongoDB MySQL GSAP Figma. "
        "Target 8-12 LPA. Prefers remote or Ahmedabad/Gujarat. "
        "NOT for: senior 3+yr, DevOps, embedded, data science, non-tech."
    )

    DEFAULT_SKILL_WEIGHTS = {
        'react': 18, 'next.js': 15, 'nextjs': 15, 'next js': 15,
        'typescript': 10, 'javascript': 12, 'tailwind': 7,
        'node.js': 9, 'nodejs': 9, 'express': 6,
        'mongodb': 6, 'mysql': 5, 'postgresql': 5, 'firebase': 4,
        'gsap': 7, 'figma': 4, 'git': 3, 'vite': 4,
        'frontend': 12, 'full stack': 10, 'fullstack': 10, 'full-stack': 10,
        'ui developer': 12, 'ui/ux': 6, 'mern': 10,
        'react native': 8, 'redux': 5, 'graphql': 5,
        'html': 3, 'css': 3, 'sass': 3, 'webpack': 3,
        # Backend / AI / data — roles Aman can do or grow into (Python/FastAPI,
        # LLM + RAG projects, SQL). Lower than the core React weights so a
        # frontend job with the same match still ranks first.
        'python': 8, 'fastapi': 8, 'rest api': 5, 'backend': 6, 'supabase': 5,
        'llm': 8, 'generative ai': 8, 'genai': 8, 'rag': 6, 'openai': 5, 'langchain': 5,
        'prompt engineering': 5, 'ai engineer': 6,
        'sql': 5, 'data analyst': 6, 'power bi': 4, 'excel': 3, 'pandas': 4, 'tableau': 3,
        'wordpress': 3, 'web developer': 8,
    }

    PENALTY_SKILLS = {
        'ruby': -15, 'rails': -15, 'php': -15, 'laravel': -15,
        'kotlin': -15, 'android': -15, 'ios': -15, 'swift': -15,
        # 'machine learning' / 'ai engineer' / 'data science' used to be
        # penalised here — removed Sep 2026 once AI-engineer and data-analyst
        # roles became targets. Research-heavy ML is still filtered by the
        # experience patterns (most want 3+ years).
        'devops': -15, 'embedded': -20, 'firmware': -20, 'c#': -10,
        '.net': -10, 'java ': -8, 'spring': -10,
    }

    EXPERIENCE_PATTERNS = [
        (r'0[- ]?(?:to[- ]?)?1\s*year', 20),
        (r'fresher', 20), (r'fresh graduate', 20), (r'entry.?level', 18),
        (r'no experience', 20), (r'0 years', 20),
        (r'1[- ]?(?:to[- ]?)?2\s*year', 10),
        (r'2[- ]?(?:to[- ]?)?3\s*year', -5),
        (r'3[+]?\s*years', -15), (r'4[+]?\s*years', -20),
        (r'5[+]?\s*years', -25), (r'senior', -20), (r'lead', -15),
    ]

    # ── Per-user scoring inputs — all fall back to Aman's original hardcoded
    # defaults if self.profile is empty (CLI/legacy callers). ────────────────

    def _profile_summary(self) -> str:
        p = self.profile
        if not p:
            return self.DEFAULT_PROFILE_SUMMARY
        skills = ', '.join(p.get('skills') or []) or 'general software development'
        roles = ', '.join(p.get('target_roles') or []) or 'developer roles'
        locs = ', '.join(p.get('location_preference') or []) or 'remote'
        lpa = p.get('target_lpa') or {'min': 8, 'max': 12}
        return (
            f"{p.get('name') or 'Candidate'}. Skills: {skills}. Target roles: {roles}. "
            f"Target {lpa.get('min', 8)}-{lpa.get('max', 12)} LPA. Prefers: {locs}. "
            "NOT for: senior 3+yr, DevOps, embedded, data science, non-tech."
        )

    def _skill_weights(self) -> dict:
        custom = self.profile.get('skill_weights')
        return custom if custom else self.DEFAULT_SKILL_WEIGHTS

    def _location_preference(self) -> list:
        return [l.lower() for l in (self.profile.get('location_preference') or [])] or DEFAULT_LOCATIONS

    def _location_weight(self) -> float:
        """0-100 slider -> multiplier, 50 = baseline (matches the original
        hardcoded point values exactly when unset)."""
        return self.profile.get('location_weight', 50) / 50

    def _salary_weight(self) -> float:
        return self.profile.get('salary_weight', 50) / 50

    def _target_lpa(self) -> dict:
        return self.profile.get('target_lpa') or {'min': 8, 'max': 12}

    def keyword_score(self, job: dict) -> tuple:
        """Fast keyword-based scorer — no API needed."""
        import re
        text = (job.get('title', '') + ' ' + job.get('description', '')).lower()
        title = job.get('title', '').lower()
        location = job.get('location', '').lower()
        salary_str = job.get('salary', '').lower()
        score = 30  # base

        # Skills — weights come from the user's own profile if they've set
        # any, otherwise the original React/frontend-leaning defaults.
        skill_weights = self._skill_weights()
        skill_score = 0
        for kw, w in skill_weights.items():
            if kw.lower() in text:
                skill_score += w
        skill_score = min(skill_score, 45)
        score += skill_score

        for kw, w in self.PENALTY_SKILLS.items():
            if kw in text:
                score += w

        # Experience
        for pattern, pts in self.EXPERIENCE_PATTERNS:
            if re.search(pattern, text):
                score += pts
                break

        # Location — weighted by location_weight (50 = baseline, matches the
        # original point values). far_cities is still an India-specific
        # generic penalty list (not user-configurable) — ponytail: fine
        # while the userbase is India-focused, revisit if that changes.
        loc_weight = self._location_weight()
        preferred = self._location_preference()
        far_cities = ['bangalore', 'bengaluru', 'mumbai', 'pune', 'delhi', 'hyderabad', 'chennai', 'kolkata']
        if any(w in location for w in ['remote', 'anywhere', 'worldwide', 'work from home', 'wfh']):
            score += round(20 * loc_weight)
        elif any(c in location for c in preferred):
            score += round(15 * loc_weight)
        elif any(c in location for c in far_cities) and not any(c in location for c in preferred):
            score -= round(12 * loc_weight)

        # Salary — weighted by salary_weight, bands derived from the user's
        # own target_lpa instead of a fixed 6/8/10 LPA scale.
        salary_weight = self._salary_weight()
        target = self._target_lpa()
        lo, hi = target.get('min', 8) or 8, target.get('max', 12) or 12
        salary_match = re.search(r'(\d+)[,.]?(\d*)\s*(?:lpa|lakh|lac|l\.p\.a)', salary_str)
        if salary_match:
            try:
                lpa = float(salary_match.group(1) + ('.' + salary_match.group(2)[:1] if salary_match.group(2) else ''))
                if lpa >= hi: score += round(15 * salary_weight)
                elif lpa >= lo: score += round(10 * salary_weight)
                elif lpa >= lo * 0.75: score += round(5 * salary_weight)
                elif lpa < lo * 0.5: score -= round(10 * salary_weight)
            except Exception:
                pass
        rupee_match = re.search(r'[₹\$]?\s*(\d+)[,\s]*(\d{3})?\s*[-–]\s*[₹\$]?\s*(\d+)[,\s]*(\d{3})?', salary_str)
        if rupee_match and not salary_match:
            try:
                low = int(rupee_match.group(1).replace(',', '') + (rupee_match.group(2) or ''))
                lo_rupees = lo * 100000
                if low >= lo_rupees * 0.75: score += round(15 * salary_weight)
                elif low >= lo_rupees * 0.5: score += round(8 * salary_weight)
            except Exception:
                pass

        # Title relevance bonus
        title_good = ['react', 'frontend', 'front end', 'full stack', 'javascript', 'ui developer', 'next.js', 'nextjs']
        title_ok = ['web developer', 'software engineer', 'software developer', 'backend', 'back end',
                    'node', 'python', 'mern', 'ai engineer', 'ai developer', 'genai', 'llm',
                    'data analyst', 'business analyst', 'sql', 'wordpress', 'shopify']
        if any(t in title for t in title_good):
            score += 10
        elif any(t in title for t in title_ok):
            score += 6

        reason_parts = []
        if skill_score > 20: reason_parts.append('strong skill match')
        if 'fresher' in text or 'entry' in text: reason_parts.append('fresher-friendly')
        if 'remote' in location: reason_parts.append('remote')
        reason = ', '.join(reason_parts) or 'keyword match'

        return min(max(score, 0), 98), reason

    # Hard ceiling on AI re-scoring calls per find_jobs() run — this now runs
    # unattended once a day per opted-in user (see app.py's auto-find cron),
    # not just on a manual click, so an unusually large uncertain-band day
    # (broad search, permissive profile) can't silently balloon into an
    # unbounded number of LLM calls. Jobs past the cap keep their (less
    # precise but free) keyword score rather than being dropped.
    MAX_AI_RESCORE_PER_RUN = 100

    def score_jobs(self, jobs: list) -> list:
        results = []
        uncertain = []
        uncertain_idx = []

        # Phase 1: fast keyword scoring
        for i, job in enumerate(jobs):
            score, reason = self.keyword_score(job)
            results.append({'score': score, 'reason': reason})
            if 35 <= score <= 65:
                uncertain.append(job)
                uncertain_idx.append(i)

        if len(uncertain) > self.MAX_AI_RESCORE_PER_RUN:
            console.print(
                f'  [yellow]{len(uncertain)} uncertain jobs exceeds the {self.MAX_AI_RESCORE_PER_RUN}/run '
                f'AI re-score cap — scoring the first {self.MAX_AI_RESCORE_PER_RUN}, rest keep their keyword score.[/yellow]'
            )
            uncertain = uncertain[:self.MAX_AI_RESCORE_PER_RUN]
            uncertain_idx = uncertain_idx[:self.MAX_AI_RESCORE_PER_RUN]

        # Phase 2: AI re-scores only uncertain jobs, individually. Used to
        # batch 10-per-call to conserve Gemini's 20/day smart-model quota —
        # NVIDIA's ~40 RPM headroom removes that constraint, so each job now
        # gets the model's full attention instead of sharing a prompt with 9
        # others (should score more accurately). The 1.5s pacing keeps this
        # comfortably under NVIDIA's shared-across-models RPM cap.
        if uncertain:
            console.print(f'  [dim]AI re-scoring {len(uncertain)} uncertain jobs (individually)...[/dim]')
            for i, (idx, job) in enumerate(zip(uncertain_idx, uncertain)):
                results[idx] = score_job_single(job, self._profile_summary(), location_preference=self.profile.get('location_preference'))
                if i < len(uncertain) - 1:
                    time.sleep(1.5)

        return results

    # ── Gujarat manual links ──────────────────────────────────────────────────

    def get_gujarat_job_links(self) -> list:
        return [
            {"platform": "Naukri.com",    "url": "https://www.naukri.com/react-developer-jobs-in-ahmedabad?jobAge=7",                                                                  "note": "React Developer — Ahmedabad, last 7 days"},
            {"platform": "LinkedIn",       "url": "https://www.linkedin.com/jobs/search/?keywords=React%20Developer&location=Ahmedabad%2C%20Gujarat&f_E=1&f_WT=1%2C2",                 "note": "React — Ahmedabad, Entry Level, Hybrid/Onsite"},
            {"platform": "Internshala",    "url": "https://internshala.com/jobs/react-js-jobs-in-ahmedabad/",                                                                          "note": "React jobs — Ahmedabad"},
            {"platform": "Indeed India",   "url": "https://in.indeed.com/jobs?q=react+developer+fresher&l=Ahmedabad%2C+Gujarat",                                                       "note": "React fresher — Ahmedabad"},
            {"platform": "Glassdoor",      "url": "https://www.glassdoor.co.in/Job/ahmedabad-react-developer-jobs-SRCH_IL.0,9_IC2940658_KO10,25.htm",                                "note": "React Developer — Ahmedabad"},
            {"platform": "Cutshort",       "url": "https://cutshort.io/jobs/react-js?location=ahmedabad",                                                                             "note": "React.js — Ahmedabad on Cutshort"},
            {"platform": "Wellfound",      "url": "https://wellfound.com/jobs?role=frontend-engineer&remote=true",                                                                     "note": "Frontend Engineer — Remote startups"},
        ]

    # All source keys find_jobs() knows about — used both for the
    # enabled_sources filter and to build the Profile page's source
    # checkboxes list (frontend hardcodes matching labels/keys).
    ALL_SOURCE_KEYS = [
        'internshala', 'jobicy', 'adzuna', 'jooble', 'careerjet',
        'weworkremotely', 'arbeitnow', 'linkedin', 'remotive', 'remoteok',
        'remoteco', 'themuse', 'himalayas', 'hn_hiring', 'cutshort', 'talent', 'shine', 'freshersworld',
    ]

    def _source_enabled(self, key: str) -> bool:
        enabled = self.profile.get('enabled_sources')
        return key in enabled if enabled is not None else True

    # ── Main entry point ──────────────────────────────────────────────────────

    def find_jobs(self, keywords: list = None, limit: int = 500) -> list:
        all_jobs: list = []
        console.print("[bold cyan]Fetching jobs from multiple sources...[/bold cyan]")

        # ── Internshala (primary — best for Indian freshers) ──
        if self._source_enabled('internshala'):
            for slug, loc in INTERNSHALA_SEARCHES:
                console.print(f"  [dim]Internshala: {slug}[/dim]")
                all_jobs.extend(self._scrape_internshala(slug, loc))

        # ── Jobicy (remote international jobs) ──
        if self._source_enabled('jobicy'):
            for tag in ["react", "javascript", "frontend", "typescript"]:
                console.print(f"  [dim]Jobicy remote: '{tag}'[/dim]")
                all_jobs.extend(self._fetch_jobicy(tag))

        # ── Adzuna (optional — needs free key) ──
        if ADZUNA_APP_ID and self._source_enabled('adzuna'):
            for kw in ["react developer fresher", "frontend developer fresher"]:
                console.print(f"  [dim]Adzuna India: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_adzuna(kw))
                console.print(f"  [dim]Adzuna Ahmedabad: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_adzuna(kw, where="Ahmedabad"))

        # ── Jooble (optional — needs free key) ──
        if JOOBLE_API_KEY and self._source_enabled('jooble'):
            for kw in ["react developer", "frontend developer"]:
                console.print(f"  [dim]Jooble: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_jooble(kw))

        # ── Careerjet (optional — needs free key) ──
        if CAREERJET_API_KEY and self._source_enabled('careerjet'):
            for kw in ["react developer", "frontend developer"]:
                console.print(f"  [dim]Careerjet: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_careerjet(kw))

        # ── WeWorkRemotely (remote programming jobs) ──
        if self._source_enabled('weworkremotely'):
            console.print("  [dim]WeWorkRemotely: remote programming jobs[/dim]")
            all_jobs.extend(self._fetch_weworkremotely())

        # ── Arbeitnow (free API — worldwide remote tech jobs) ──
        if self._source_enabled('arbeitnow'):
            console.print("  [dim]Arbeitnow: worldwide remote tech jobs[/dim]")
            all_jobs.extend(self._fetch_arbeitnow())

        # ── LinkedIn (guest API — no auth) ──
        if self._source_enabled('linkedin'):
            console.print("  [dim]LinkedIn: React/Frontend/FullStack jobs India + Ahmedabad[/dim]")
            all_jobs.extend(self._fetch_linkedin())

        # ── Remotive (curated remote tech jobs API) ──
        if self._source_enabled('remotive'):
            console.print("  [dim]Remotive: curated remote tech jobs[/dim]")
            all_jobs.extend(self._fetch_remotive())

        # ── RemoteOK (remote dev jobs JSON API) ──
        if self._source_enabled('remoteok'):
            console.print("  [dim]RemoteOK: remote dev jobs[/dim]")
            all_jobs.extend(self._fetch_remoteok())

        # ── Remote.co (vetted remote developer jobs RSS) ──
        if self._source_enabled('remoteco'):
            console.print("  [dim]Remote.co: vetted remote developer jobs[/dim]")
            all_jobs.extend(self._fetch_remoteco())

        # ── The Muse (entry-level engineering jobs API) ──
        if self._source_enabled('themuse'):
            console.print("  [dim]TheMuse: entry-level engineering jobs[/dim]")
            all_jobs.extend(self._fetch_themuse())

        # ── Himalayas (remote-first job board, India-eligible filter) ──
        if self._source_enabled('himalayas'):
            console.print("  [dim]Himalayas: remote-first jobs[/dim]")
            all_jobs.extend(self._fetch_himalayas())

        # ── HN "Who is hiring" (monthly thread, real startups posting directly) ──
        if self._source_enabled('hn_hiring'):
            console.print("  [dim]HN Who's Hiring: this month's thread[/dim]")
            all_jobs.extend(self._fetch_hn_hiring())

        # ── Cutshort (startups; only ≤1-year-experience listings kept) ──
        if self._source_enabled('cutshort'):
            for slug in CUTSHORT_SEARCHES:
                console.print(f"  [dim]Cutshort: {slug}[/dim]")
                all_jobs.extend(self._fetch_cutshort(slug))

        # ── Talent.com (aggregator with good Ahmedabad/Gujarat coverage) ──
        if self._source_enabled('talent'):
            for kw, loc in TALENT_SEARCHES:
                console.print(f"  [dim]Talent.com: {kw} / {loc}[/dim]")
                all_jobs.extend(self._fetch_talent(kw, loc))

        # ── Shine + Freshersworld (Ahmedabad + nearby Gujarat cities) ──
        if self._source_enabled('shine'):
            for role, city in GUJARAT_SEARCHES:
                console.print(f"  [dim]Shine: {role} / {city}[/dim]")
                all_jobs.extend(self._fetch_shine(role, city))
        if self._source_enabled('freshersworld'):
            for role, city in GUJARAT_SEARCHES:
                console.print(f"  [dim]Freshersworld: {role} / {city}[/dim]")
                all_jobs.extend(self._fetch_freshersworld(role, city))

        # ── Deduplicate + filter ──
        # Two dedup checks: exact URL (handles the same source returning a
        # posting twice) and a normalized title+company key (handles the
        # same posting cross-posted to two different sources under two
        # different URLs — e.g. a company's own listing mirrored on both
        # LinkedIn and Remotive — which the URL check alone can't catch).
        seen_urls:    set  = set()
        seen_title_company: set = set()
        company_count: dict = {}
        unique_jobs:  list = []

        for j in all_jobs:
            url = j.get("url", "")
            if not url or url in seen_urls or url in self.existing_urls:
                continue
            if self._is_senior(j.get("title", "")):
                continue
            company = j.get("company", "unknown")
            if company_count.get(company, 0) >= 3:
                continue
            tc_key = self._title_company_key(j.get("title", ""), company)
            if tc_key in seen_title_company or tc_key in self.existing_title_company:
                continue
            company_count[company] = company_count.get(company, 0) + 1
            seen_urls.add(url)
            seen_title_company.add(tc_key)
            unique_jobs.append(j)

        console.print(f"\n[green]Found {len(unique_jobs)} new jobs. Scoring with Gemini (batched)...[/green]")

        # `limit` used to silently starve scoring for whichever source is
        # fetched last (HN Who's Hiring, currently) on any run finding more
        # unique jobs than the cap — those jobs kept their scrape-time
        # score:0 placeholder forever, since score_jobs()'s own two-phase
        # filter (cheap keyword scoring for everyone, Gemini only for the
        # 35-65 "uncertain" subset) already bounds real API cost regardless
        # of how many jobs are passed in. Raised the default well above any
        # realistic single-run volume rather than truncating silently.
        to_score = unique_jobs[:limit]
        scores   = self.score_jobs(to_score)
        for job, result in zip(to_score, scores):
            job["score"]        = result.get("score", 40)
            job["score_reason"] = result.get("reason", "")

        unique_jobs.sort(key=lambda x: x["score"], reverse=True)

        added = self._save_jobs(unique_jobs)
        console.print(f"[green]Saved {added} new jobs to database.[/green]")
        return unique_jobs

    def filter_and_rank(self, min_score: int = 60) -> list:
        return sorted(
            [j for j in self._load_all_jobs() if j.get("score", 0) >= min_score],
            key=lambda x: x["score"], reverse=True
        )

    def get_all_jobs(self) -> list:
        return self._load_all_jobs()
