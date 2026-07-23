"""
Batch apply — pick N jobs, apply to all of them via email or a browser
pre-fill assist, with a toggle between "automatic" (fires immediately,
gated only by MIN_APPLY_SCORE, same as today's single-job flow) and
"review" (generate everything, stage it, wait for one confirm-then-send).

Browser channel is ALWAYS pre-fill-only, in both modes — it never clicks a
final submit button. This is deliberate: ATS platforms have mixed and
sometimes explicit ToS prohibitions on automated bot-submission (Workday
explicitly prohibits scraping/bot tools without written consent), and
generic form-filling is inherently unreliable across wildly different job
board layouts. "Automatic" for the browser channel means the pre-fill runs
without you queuing each one up by hand — not that it submits unattended.
"""
import json
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import USER_PROFILE, OUTPUT_DIR, MIN_APPLY_SCORE
from agents.tracker import TrackerAgent
from agents.cv_customizer import CVCustomizerAgent
from agents.job_applier import JobApplierAgent, extract_email_from_description
from agents.telegram_notifier import TelegramNotifierAgent


def _get_job(tracker: TrackerAgent, user_id: str, job_id: str) -> dict | None:
    with tracker._get_conn() as conn:
        conn.row_factory = True
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id)).fetchone()
    return row


# ── Email channel ────────────────────────────────────────────────────────────

def run_email_batch(user_id: str, job_ids: list, mode: str, force: bool = False) -> dict:
    """mode: "automatic" (send immediately) or "review" (stage, wait for a
    separate send_staged_batch call). Returns the created batch (see
    TrackerAgent.get_batch)."""
    tracker = TrackerAgent()
    cv_agent = CVCustomizerAgent()
    applier = JobApplierAgent()
    batch_id = tracker.create_batch(user_id, mode=mode, channel="email")

    for job_id in job_ids:
        job = _get_job(tracker, user_id, job_id)
        if not job:
            continue
        if (job.get("score") or 0) < MIN_APPLY_SCORE and not force:
            tracker.add_batch_item(batch_id, job_id, status="below_score_gate")
            continue
        email = extract_email_from_description(job.get("description", ""))
        if not email:
            tracker.add_batch_item(batch_id, job_id, status="no_email", error="No email found in description")
            continue

        package = cv_agent.prepare_full_package(job)
        if "generation failed" in package.get("cv_markdown", ""):
            tracker.add_batch_item(batch_id, job_id, email=email, status="generation_failed")
            continue

        if mode == "automatic":
            sent = applier.send_email_application(user_id, job, email, package)
            tracker.add_batch_item(
                batch_id, job_id, email=email, cv_path=package["cv_path"], cover_path=package["cover_letter_path"],
                cv_markdown=package["cv_markdown"], cover_letter_text=package["cover_letter"],
                status="sent" if sent else "send_failed",
            )
        else:
            tracker.add_batch_item(
                batch_id, job_id, email=email, cv_path=package["cv_path"], cover_path=package["cover_letter_path"],
                cv_markdown=package["cv_markdown"], cover_letter_text=package["cover_letter"],
                status="staged",
            )

    tracker.update_batch_status(batch_id, "sent" if mode == "automatic" else "staged")
    return tracker.get_batch(batch_id)


def send_staged_batch(user_id: str, batch_id: str) -> dict:
    """Confirm-then-send for a review-mode batch — sends the EXACT content
    that was staged (not regenerated), only for items still marked approved."""
    tracker = TrackerAgent()
    applier = JobApplierAgent()
    batch = tracker.get_batch(user_id, batch_id)
    if not batch:
        return {"error": "Batch not found"}

    for item in batch["items"]:
        if item.get("status") != "staged" or not item.get("approved"):
            continue
        job = _get_job(tracker, user_id, item["job_id"])
        if not job:
            continue
        package = {
            "cv_path": item["cv_path"], "cover_letter_path": item["cover_path"],
            "cover_letter": item["cover_letter_text"],
        }
        sent = applier.send_email_application(user_id, job, item["email"], package)
        tracker.update_batch_item_status(item["id"], "sent" if sent else "send_failed")

    tracker.update_batch_status(batch_id, "sent")
    return tracker.get_batch(user_id, batch_id)


# ── Telegram channel ─────────────────────────────────────────────────────────

def run_telegram_batch(user_id: str, job_ids: list, force: bool = False) -> dict:
    """Generates CV+cover for each job and pushes the alert to Telegram —
    same underlying send_job_alert as the single-job /api/telegram-notify
    endpoint, just looped over a picked batch (e.g. top 50 by score)."""
    tracker = TrackerAgent()
    cv_agent = CVCustomizerAgent()
    notifier = TelegramNotifierAgent()
    batch_id = tracker.create_batch(user_id, mode="automatic", channel="telegram")

    for job_id in job_ids:
        job = _get_job(tracker, user_id, job_id)
        if not job:
            continue
        if (job.get("score") or 0) < MIN_APPLY_SCORE and not force:
            tracker.add_batch_item(batch_id, job_id, status="below_score_gate")
            continue
        if not notifier.enabled:
            tracker.add_batch_item(batch_id, job_id, status="telegram_not_configured")
            continue

        package = cv_agent.prepare_full_package(job)
        if "generation failed" in package.get("cv_markdown", ""):
            tracker.add_batch_item(batch_id, job_id, status="generation_failed")
            continue

        sent = notifier.send_job_alert(user_id, job, package["cv_path"], package["cover_letter_path"], package["cv_markdown"])
        if sent:
            tracker.update_status(user_id, job_id, "found", notes="Telegram alert sent (batch)",
                                   cv_path=package["cv_path"], cover_path=package["cover_letter_path"])
        tracker.add_batch_item(
            batch_id, job_id, cv_path=package["cv_path"], cover_path=package["cover_letter_path"],
            status="sent" if sent else "send_failed",
        )

    tracker.update_batch_status(batch_id, "sent")
    return tracker.get_batch(user_id, batch_id)


# ── Browser pre-fill channel (never submits) ────────────────────────────────

# Common form field name/id/placeholder/aria-label fragments -> USER_PROFILE value.
# Best-effort only — ATS platforms vary too widely for this to be reliable
# everywhere; unmatched fields are reported, not guessed at.
_FIELD_MAP_KEYS = ["name", "full_name", "email", "phone", "mobile", "linkedin", "github", "portfolio", "location"]


def _field_map() -> dict:
    return {
        "name": USER_PROFILE["name"], "full_name": USER_PROFILE["name"],
        "email": USER_PROFILE["email"],
        "phone": USER_PROFILE["phone"], "mobile": USER_PROFILE["phone"],
        "linkedin": USER_PROFILE["linkedin"], "github": USER_PROFILE["github"],
        "portfolio": USER_PROFILE["portfolio"], "location": USER_PROFILE["location"],
    }


def prefill_browser_form(job: dict, cv_path: str = "") -> dict:
    """
    Navigates to the job's own URL and fills whatever common fields it can
    match — NEVER clicks submit/next. Returns which fields were filled vs
    not, plus a screenshot path so the user finishes and submits by hand.
    """
    result = {"fields_filled": [], "fields_missing": [], "screenshot_path": "", "error": ""}
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        result["error"] = "Playwright not installed"
        return result

    field_map = _field_map()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(job["url"], timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)

            for el in page.query_selector_all("input, textarea"):
                try:
                    el_type = (el.get_attribute("type") or "").lower()
                    if el_type == "file":
                        if cv_path and Path(cv_path).exists():
                            el.set_input_files(cv_path)
                            result["fields_filled"].append("resume_upload")
                        continue
                    attrs = " ".join(filter(None, [
                        (el.get_attribute("name") or "").lower(),
                        (el.get_attribute("id") or "").lower(),
                        (el.get_attribute("placeholder") or "").lower(),
                        (el.get_attribute("aria-label") or "").lower(),
                    ]))
                    for key, value in field_map.items():
                        if key in attrs and key not in result["fields_filled"]:
                            el.fill(value)
                            result["fields_filled"].append(key)
                            break
                except Exception:
                    continue

            result["fields_missing"] = [k for k in _FIELD_MAP_KEYS if k not in result["fields_filled"]]

            screenshot_dir = Path(OUTPUT_DIR) / "batch_screenshots"
            screenshot_dir.mkdir(parents=True, exist_ok=True)
            screenshot_path = screenshot_dir / f"{job['id']}.png"
            page.screenshot(path=str(screenshot_path), full_page=True)
            result["screenshot_path"] = str(screenshot_path)

            browser.close()
    except Exception as e:
        result["error"] = str(e)

    return result


def run_browser_batch(user_id: str, job_ids: list, force: bool = False) -> dict:
    """Runs prefill_browser_form for each job (generating a CV first so the
    resume-upload field has something real to attach), stages results for
    review — the browser channel has no "automatic send" concept since it
    never submits regardless of mode."""
    tracker = TrackerAgent()
    cv_agent = CVCustomizerAgent()
    batch_id = tracker.create_batch(user_id, mode="review", channel="browser")

    for job_id in job_ids:
        job = _get_job(tracker, user_id, job_id)
        if not job:
            continue
        if (job.get("score") or 0) < MIN_APPLY_SCORE and not force:
            tracker.add_batch_item(batch_id, job_id, status="below_score_gate")
            continue

        package = cv_agent.prepare_full_package(job)
        prefill = prefill_browser_form(job, cv_path=package.get("cv_path", ""))
        tracker.add_batch_item(
            batch_id, job_id, cv_path=package.get("cv_path", ""), cover_path=package.get("cover_letter_path", ""),
            cv_markdown=package.get("cv_markdown", ""), cover_letter_text=package.get("cover_letter", ""),
            screenshot_url=prefill["screenshot_path"],
            fields_filled=json.dumps(prefill["fields_filled"]),
            fields_missing=json.dumps(prefill["fields_missing"]),
            status="prefilled" if not prefill["error"] else "prefill_failed",
            error=prefill["error"],
        )

    tracker.update_batch_status(batch_id, "staged")
    return tracker.get_batch(user_id, batch_id)
