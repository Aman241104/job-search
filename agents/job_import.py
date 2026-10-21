"""Save a job from any page or pasted text (Naukri, a WhatsApp/Telegram
group post, a referral link) - the sources no scraper covers.

Order of trust: the page's own schema.org JobPosting JSON-LD (what Google
Jobs reads, so most boards ship it), then an AI read of the page text, then
the page title.
"""
import ipaddress
import json
import re
import socket
import uuid
from datetime import datetime
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from claude_client import ask_ai

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
MAX_BYTES = 3_000_000


class JobImportError(ValueError):
    pass


def _public_host(host: str) -> bool:
    """Refuse anything that resolves to a private, loopback, link-local
    (169.254.169.254 = cloud metadata) or otherwise non-public address."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    return all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def fetch_page(url: str) -> tuple[str, str]:
    """(final url, html). Redirects are followed by hand so every hop is
    re-checked against _public_host."""
    for _ in range(5):
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname or not _public_host(p.hostname):
            raise JobImportError("That link can't be fetched (only public http/https pages).")
        r = requests.get(url, headers=HEADERS, timeout=15, allow_redirects=False, stream=True)
        if r.is_redirect:
            url = urljoin(url, r.headers.get("location", ""))
            continue
        body = r.raw.read(MAX_BYTES, decode_content=True)
        return url, body.decode(r.encoding or "utf-8", errors="replace")
    raise JobImportError("Too many redirects.")


def _text(value) -> str:
    if isinstance(value, dict):
        value = value.get("name") or value.get("value") or ""
    if isinstance(value, list):
        return ", ".join(_text(v) for v in value if v)
    return BeautifulSoup(str(value or ""), "html.parser").get_text(" ", strip=True)


def _location(posting: dict) -> str:
    if str(posting.get("jobLocationType", "")).upper() == "TELECOMMUTE":
        return "Remote"
    locs = posting.get("jobLocation") or []
    locs = locs if isinstance(locs, list) else [locs]
    parts = []
    for loc in locs:
        addr = (loc or {}).get("address") or {}
        if isinstance(addr, dict):
            parts.append(", ".join(_text(addr.get(k)) for k in ("addressLocality", "addressRegion", "addressCountry") if addr.get(k)))
    return "; ".join(p for p in parts if p)


def _salary(posting: dict) -> str:
    s = posting.get("baseSalary") or {}
    if not isinstance(s, dict):
        return _text(s)
    v = s.get("value") or {}
    cur = s.get("currency", "")
    if isinstance(v, dict):
        lo, hi, unit = v.get("minValue"), v.get("maxValue"), v.get("unitText", "")
        if lo or hi:
            if cur == "INR" and str(unit).upper() == "YEAR":
                return f"₹{float(lo or hi) / 1e5:.1f}L - ₹{float(hi or lo) / 1e5:.1f}L / yr"
            return f"{cur} {lo or ''} - {hi or ''} / {unit}".strip()
    return ""


def from_json_ld(html: str) -> dict | None:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (ValueError, TypeError):
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        for item in items:
            kind = item.get("@type") if isinstance(item, dict) else None
            if kind == "JobPosting" or (isinstance(kind, list) and "JobPosting" in kind):
                return {
                    "title": _text(item.get("title")),
                    "company": _text(item.get("hiringOrganization")),
                    "description": _text(item.get("description"))[:4000],
                    "location": _location(item),
                    "salary": _salary(item),
                    "date_posted": str(item.get("datePosted") or ""),
                }
    return None


def from_text(text: str) -> dict | None:
    """AI read of free text (a page, or a pasted WhatsApp post)."""
    raw = ask_ai(
        "Extract the job from this text. Return ONLY JSON: "
        '{"title": "", "company": "", "location": "", "salary": "", "apply_url": "", "description": ""}. '
        "description = the requirements and responsibilities, under 120 words. "
        "Use \"\" for anything not stated; never guess.\n\nTEXT:\n" + text[:6000],
        max_tokens=600, temperature=0.1,
    )
    m = re.search(r"\{.*\}", raw or "", re.S)
    try:
        data = json.loads(m.group()) if m else None
    except ValueError:
        return None
    return data if data and data.get("title") else None


def import_job(url: str = "", text: str = "") -> dict:
    """Returns a job dict ready for TrackerAgent.add_job (unscored)."""
    if not url and not text.strip():
        raise JobImportError("Give a link or paste the job text.")
    found = None
    if url:
        url, html = fetch_page(url)
        found = from_json_ld(html)
        if not found:
            soup = BeautifulSoup(html, "html.parser")
            page_text = soup.get_text(" ", strip=True)
            found = from_text(page_text) or {
                "title": _text((soup.find("meta", property="og:title") or {}).get("content")) or _text(soup.title),
                "company": _text((soup.find("meta", property="og:site_name") or {}).get("content")),
                "description": page_text[:2000],
            }
    else:
        found = from_text(text)
        if not found:
            first = text.strip().splitlines()[0][:120]
            found = {"title": first, "description": text[:4000]}
        links = re.findall(r"https?://\S+", text)
        url = found.get("apply_url") or (links[0] if links else "")
    if not found.get("title"):
        raise JobImportError("Couldn't find a job on that page. Paste the job text instead.")
    return {
        "id": str(uuid.uuid4()),
        "title": found["title"][:200],
        "company": found.get("company") or (urlparse(url).hostname if url else "") or "Unknown",
        "description": found.get("description", ""),
        # The unique (user, url) index needs a url; pasted posts without a link get their own.
        "url": url or f"manual://{uuid.uuid4()}",
        "source": "Saved",
        "location": found.get("location", ""),
        "salary": found.get("salary", ""),
        "date_posted": found.get("date_posted", ""),
        "tags": ["saved"],
        "score": 0, "score_reason": "",
        "date_found": datetime.now().isoformat(),
    }
