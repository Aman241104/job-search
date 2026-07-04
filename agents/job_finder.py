import json
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
]

SENIOR_WORDS = {"staff", "principal", "lead", "senior", "sr.", "head of",
                "director", "manager", "architect", "vp", "vice president", "cto"}


class JobFinderAgent:
    def __init__(self):
        self.jobs_file = Path(DATA_DIR) / "found_jobs.json"
        self.existing_urls = self._load_existing_urls()

    def _load_existing_urls(self) -> set:
        if self.jobs_file.exists():
            with open(self.jobs_file) as f:
                return {j["url"] for j in json.load(f)}
        return set()

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

    PROFILE = (
        "Aman Patel, fresher 2026, B.E. EC Engineering LDCE Ahmedabad CGPA 8.0. "
        "Skills: React Next.js TypeScript JavaScript Tailwind Node.js Express MongoDB MySQL GSAP Figma. "
        "TCS Digital 7 LPA offer. Target 8-12 LPA. Prefers remote or Ahmedabad/Gujarat. "
        "NOT for: senior 3+yr, DevOps, embedded, data science, non-tech."
    )

    SKILL_WEIGHTS = {
        'react': 18, 'next.js': 15, 'nextjs': 15, 'next js': 15,
        'typescript': 10, 'javascript': 12, 'tailwind': 7,
        'node.js': 9, 'nodejs': 9, 'express': 6,
        'mongodb': 6, 'mysql': 5, 'postgresql': 5, 'firebase': 4,
        'gsap': 7, 'figma': 4, 'git': 3, 'vite': 4,
        'frontend': 12, 'full stack': 10, 'fullstack': 10, 'full-stack': 10,
        'ui developer': 12, 'ui/ux': 6, 'mern': 10,
        'react native': 8, 'redux': 5, 'graphql': 5,
        'html': 3, 'css': 3, 'sass': 3, 'webpack': 3,
    }

    PENALTY_SKILLS = {
        'ruby': -15, 'rails': -15, 'php': -15, 'laravel': -15,
        'kotlin': -15, 'android': -15, 'ios': -15, 'swift': -15,
        'data science': -20, 'machine learning': -15, 'ai engineer': -10,
        'devops': -15, 'embedded': -20, 'firmware': -20, 'c#': -10,
        '.net': -10, 'java ': -8, 'spring': -10, 'django': -5, 'flask': -5,
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

    def keyword_score(self, job: dict) -> tuple:
        """Fast keyword-based scorer — no API needed."""
        import re
        text = (job.get('title', '') + ' ' + job.get('description', '')).lower()
        title = job.get('title', '').lower()
        location = job.get('location', '').lower()
        salary_str = job.get('salary', '').lower()
        score = 30  # base

        # Skills
        skill_score = 0
        for kw, w in self.SKILL_WEIGHTS.items():
            if kw in text:
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

        # Location
        gujarat = ['ahmedabad', 'gujarat', 'gandhinagar', 'surat', 'vadodara', 'rajkot']
        far_cities = ['bangalore', 'bengaluru', 'mumbai', 'pune', 'delhi', 'hyderabad', 'chennai', 'kolkata']
        if any(w in location for w in ['remote', 'anywhere', 'worldwide', 'work from home', 'wfh']):
            score += 20
        elif any(c in location for c in gujarat):
            score += 15
        elif any(c in location for c in far_cities):
            score -= 12

        # Salary parsing (Indian format)
        salary_match = re.search(r'(\d+)[,.]?(\d*)\s*(?:lpa|lakh|lac|l\.p\.a)', salary_str)
        if salary_match:
            try:
                lpa = float(salary_match.group(1) + ('.' + salary_match.group(2)[:1] if salary_match.group(2) else ''))
                if lpa >= 10: score += 15
                elif lpa >= 8: score += 10
                elif lpa >= 6: score += 5
                elif lpa < 4: score -= 10
            except Exception:
                pass
        rupee_match = re.search(r'[₹\$]?\s*(\d+)[,\s]*(\d{3})?\s*[-–]\s*[₹\$]?\s*(\d+)[,\s]*(\d{3})?', salary_str)
        if rupee_match and not salary_match:
            try:
                low = int(rupee_match.group(1).replace(',', '') + (rupee_match.group(2) or ''))
                if low >= 600000: score += 15
                elif low >= 400000: score += 8
            except Exception:
                pass

        # Title relevance bonus
        title_good = ['react', 'frontend', 'front end', 'full stack', 'javascript', 'ui developer', 'next.js', 'nextjs']
        if any(t in title for t in title_good):
            score += 10

        reason_parts = []
        if skill_score > 20: reason_parts.append('strong skill match')
        if 'fresher' in text or 'entry' in text: reason_parts.append('fresher-friendly')
        if 'remote' in location: reason_parts.append('remote')
        reason = ', '.join(reason_parts) or 'keyword match'

        return min(max(score, 0), 98), reason

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

        # Phase 2: AI re-scores only uncertain jobs, individually. Used to
        # batch 10-per-call to conserve Gemini's 20/day smart-model quota —
        # NVIDIA's ~40 RPM headroom removes that constraint, so each job now
        # gets the model's full attention instead of sharing a prompt with 9
        # others (should score more accurately). The 1.5s pacing keeps this
        # comfortably under NVIDIA's shared-across-models RPM cap.
        if uncertain:
            console.print(f'  [dim]AI re-scoring {len(uncertain)} uncertain jobs (individually)...[/dim]')
            for i, (idx, job) in enumerate(zip(uncertain_idx, uncertain)):
                results[idx] = score_job_single(job, self.PROFILE)
                if i < len(uncertain) - 1:
                    time.sleep(1.5)

        return results

    # ── Source 4: Naukri.com scraper ─────────────────────────────────────────

    def _scrape_naukri(self, keyword: str = 'react developer', location: str = 'ahmedabad') -> list:
        """Scrape Naukri.com job listings."""
        import urllib.parse
        url = f"https://www.naukri.com/{urllib.parse.quote(keyword.replace(' ', '-'))}-jobs-in-{location}"
        try:
            r = requests.get(url, headers={**HEADERS,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            }, timeout=20)
            soup = BeautifulSoup(r.text, 'lxml')
            jobs = []
            for card in soup.select('article.jobTuple, .job-tuple-wrapper, [class*="jobTuple"]')[:20]:
                title_el = card.select_one('.title, [class*="title"] a, h2 a')
                comp_el  = card.select_one('.company-name, [class*="companyName"], .comp-name')
                loc_el   = card.select_one('.loc, [class*="location"], .loc-name')
                sal_el   = card.select_one('.salary, [class*="salary"]')
                exp_el   = card.select_one('.exp, [class*="experience"]')
                href_el  = card.select_one('a[href*="/job-listings"]') or title_el
                if not title_el: continue
                href = href_el.get('href', '') if href_el else ''
                if href and not href.startswith('http'): href = 'https://www.naukri.com' + href
                desc = (exp_el.get_text(strip=True) if exp_el else '') + ' ' + (sal_el.get_text(strip=True) if sal_el else '')
                jobs.append({
                    'id': str(uuid.uuid4()),
                    'title': title_el.get_text(strip=True),
                    'company': comp_el.get_text(strip=True) if comp_el else '',
                    'description': desc[:2000],
                    'url': href,
                    'source': 'Naukri.com',
                    'location': loc_el.get_text(strip=True) if loc_el else location.title(),
                    'salary': sal_el.get_text(strip=True) if sal_el else 'Not specified',
                    'date_posted': '',
                    'tags': [],
                    'score': 0, 'score_reason': '',
                    'date_found': datetime.now().isoformat(),
                })
            return jobs
        except Exception as e:
            console.print(f'[yellow]Naukri scrape failed: {e}[/yellow]')
            return []

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

    # ── Main entry point ──────────────────────────────────────────────────────

    def find_jobs(self, keywords: list = None, limit: int = 500) -> list:
        all_jobs: list = []
        console.print("[bold cyan]Fetching jobs from multiple sources...[/bold cyan]")

        # ── Internshala (primary — best for Indian freshers) ──
        for slug, loc in INTERNSHALA_SEARCHES:
            console.print(f"  [dim]Internshala: {slug}[/dim]")
            all_jobs.extend(self._scrape_internshala(slug, loc))

        # ── Jobicy (remote international jobs) ──
        for tag in ["react", "javascript", "frontend", "typescript"]:
            console.print(f"  [dim]Jobicy remote: '{tag}'[/dim]")
            all_jobs.extend(self._fetch_jobicy(tag))

        # ── Adzuna (optional — needs free key) ──
        if ADZUNA_APP_ID:
            for kw in ["react developer fresher", "frontend developer fresher"]:
                console.print(f"  [dim]Adzuna India: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_adzuna(kw))
                console.print(f"  [dim]Adzuna Ahmedabad: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_adzuna(kw, where="Ahmedabad"))

        # ── Jooble (optional — needs free key) ──
        if JOOBLE_API_KEY:
            for kw in ["react developer", "frontend developer"]:
                console.print(f"  [dim]Jooble: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_jooble(kw))

        # ── Careerjet (optional — needs free key) ──
        if CAREERJET_API_KEY:
            for kw in ["react developer", "frontend developer"]:
                console.print(f"  [dim]Careerjet: '{kw}'[/dim]")
                all_jobs.extend(self._fetch_careerjet(kw))

        # ── WeWorkRemotely (remote programming jobs) ──
        console.print("  [dim]WeWorkRemotely: remote programming jobs[/dim]")
        all_jobs.extend(self._fetch_weworkremotely())

        # ── Arbeitnow (free API — worldwide remote tech jobs) ──
        console.print("  [dim]Arbeitnow: worldwide remote tech jobs[/dim]")
        all_jobs.extend(self._fetch_arbeitnow())

        # ── LinkedIn (guest API — no auth) ──
        console.print("  [dim]LinkedIn: React/Frontend/FullStack jobs India + Ahmedabad[/dim]")
        all_jobs.extend(self._fetch_linkedin())

        # ── Remotive (curated remote tech jobs API) ──
        console.print("  [dim]Remotive: curated remote tech jobs[/dim]")
        all_jobs.extend(self._fetch_remotive())

        # ── RemoteOK (remote dev jobs JSON API) ──
        console.print("  [dim]RemoteOK: remote dev jobs[/dim]")
        all_jobs.extend(self._fetch_remoteok())

        # ── Remote.co (vetted remote developer jobs RSS) ──
        console.print("  [dim]Remote.co: vetted remote developer jobs[/dim]")
        all_jobs.extend(self._fetch_remoteco())

        # ── The Muse (entry-level engineering jobs API) ──
        console.print("  [dim]TheMuse: entry-level engineering jobs[/dim]")
        all_jobs.extend(self._fetch_themuse())

        # ── Himalayas (remote-first job board, India-eligible filter) ──
        console.print("  [dim]Himalayas: remote-first jobs[/dim]")
        all_jobs.extend(self._fetch_himalayas())

        # ── HN "Who is hiring" (monthly thread, real startups posting directly) ──
        console.print("  [dim]HN Who's Hiring: this month's thread[/dim]")
        all_jobs.extend(self._fetch_hn_hiring())

        # ── Deduplicate + filter ──
        seen_urls:    set  = set()
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
            company_count[company] = company_count.get(company, 0) + 1
            seen_urls.add(url)
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
