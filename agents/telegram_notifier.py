import html as _html
import os
import re
import sys
import time
from typing import Optional
import requests
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from rich.console import Console

console = Console()

TELEGRAM_MAX_MESSAGE_LEN = 4000  # Telegram's real cap is 4096 UTF-16 units; leave headroom
DIVIDER = "━━━━━━━━━━━━━━━━━━━━"


def _strip_markdown(text: str) -> str:
    """CV markdown has real docs-style formatting (##, **bold**) that would
    otherwise show as literal symbol clutter in a plain-text Telegram bubble."""
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = text.replace("**", "").replace("*", "")
    return text


def _chunk_text(text: str, size: int) -> list:
    return [text[i:i + size] for i in range(0, len(text), size)] or [""]


def _esc(text) -> str:
    """Telegram's HTML parse_mode only needs &, <, > escaped — job data can
    contain any of these ("AT&T", "C++ <-> React") and one unescaped char
    breaks the whole message, same failure mode MarkdownV2 had."""
    return _html.escape(str(text), quote=False)


_bot_username_cache: Optional[str] = None


class TelegramNotifierAgent:
    """Pushes a job (link + details), the CV as both text and PDF, and the
    cover-letter PDF to Telegram — for the majority of listings that have no
    direct recruiter email and can only be applied to by hand on the original
    job board. Lets that manual apply happen from a phone: open the link,
    everything needed is already sitting in the chat.

    Each alert is wrapped in clearly labeled, emoji-tagged sections (job info,
    CV text, PDFs, end-of-alert divider) so a chat with many alerts back to
    back stays easy to scroll through and tell apart.

    One shared bot (TELEGRAM_BOT_TOKEN) serves every user — each user's own
    chat_id (captured via the Profile page's "Connect Telegram" deep-link
    flow, see app.py's /api/telegram/connect-link + webhook) is passed in per
    call, not read from a global. TELEGRAM_CHAT_ID stays as a fallback only
    for CLI-only callers that predate multi-tenancy.
    """

    def __init__(self):
        self.enabled = bool(TELEGRAM_BOT_TOKEN)

    def _api(self, method: str) -> str:
        return f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"

    def get_bot_username(self) -> str:
        """Cached — same bot/token for the life of the process, so getMe only
        needs to happen once, not on every connect-link request."""
        global _bot_username_cache
        if _bot_username_cache is None:
            resp = requests.get(self._api("getMe"), timeout=10)
            resp.raise_for_status()
            _bot_username_cache = resp.json()["result"]["username"]
        return _bot_username_cache

    def _post_with_retry(self, url: str, **kwargs):
        """One retry on Telegram's 429, honoring the `retry_after` it returns
        — matters here because a big batch send hammers the same chat_id far
        past the ~1 msg/sec Telegram recommends for a single chat."""
        resp = requests.post(url, **kwargs)
        if resp.status_code == 429:
            retry_after = resp.json().get("parameters", {}).get("retry_after", 3)
            time.sleep(retry_after + 1)
            resp = requests.post(url, **kwargs)
        resp.raise_for_status()
        return resp

    def _send_message(self, text: str, chat_id: str = "", disable_preview: bool = True) -> Optional[int]:
        """Never raises — the webhook fires this straight from inbound
        Telegram callbacks with no surrounding try/except, and a downstream
        Telegram-side failure (chat not found, bot blocked, message too long)
        must not 500 the whole webhook request."""
        try:
            resp = self._post_with_retry(self._api("sendMessage"), data={
                "chat_id": chat_id or TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": disable_preview,
            }, timeout=15)
        except Exception as e:
            console.print(f"[red]Telegram sendMessage failed: {e}[/red]")
            return None
        time.sleep(0.7)  # stay well under Telegram's per-chat rate limit across a big batch
        try:
            return resp.json()["result"]["message_id"]
        except Exception:
            return None

    def send_job_alert(self, user_id: str, job: dict, cv_path: str = "", cover_path: str = "", cv_markdown: str = "", chat_id: str = "") -> bool:
        chat_id = chat_id or TELEGRAM_CHAT_ID
        if not self.enabled or not chat_id:
            console.print("[yellow]Telegram not configured — connect Telegram in Profile, or set TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID in .env[/yellow]")
            return False
        try:
            job_msg = (
                f"🆕 <b>NEW JOB MATCH</b>\n{DIVIDER}\n\n"
                f"<b>{_esc(job.get('title', ''))}</b>\n"
                f"{_esc(job.get('company', ''))} — {_esc(job.get('location', ''))}\n\n"
                f"📊 Score: <b>{_esc(job.get('score', 0))}/100</b>\n"
                f"💰 Salary: {_esc(job.get('salary') or 'Not specified')}\n"
                f"🔗 Source: {_esc(job.get('source', ''))}\n\n"
                f"👉 {job.get('url', '')}\n\n"
                f"Apply using the link above — CV text next, then CV + cover letter PDFs below.\n\n"
                f"💬 Reply to THIS message with \"applied\" or \"emailed you@company.com\" to update the tracker."
            )
            alert_message_id = self._send_message(job_msg, chat_id=chat_id, disable_preview=False)
            if alert_message_id and job.get("id"):
                try:
                    from agents.tracker import TrackerAgent
                    TrackerAgent().record_telegram_alert(user_id, alert_message_id, job["id"])
                except Exception:
                    pass  # non-fatal — reply-matching just falls back to text search

            if cv_markdown:
                plain_cv = _esc(_strip_markdown(cv_markdown))
                chunks = _chunk_text(plain_cv, TELEGRAM_MAX_MESSAGE_LEN)
                total = len(chunks)
                for i, chunk in enumerate(chunks, start=1):
                    part_label = f" (part {i}/{total})" if total > 1 else ""
                    header = f"📄 <b>CV — TEXT VERSION</b>{part_label}\n{DIVIDER}\n\n"
                    self._send_message(header + chunk, chat_id=chat_id)

            for path, label in [(cv_path, "📎 Tailored CV (PDF)"), (cover_path, "📎 Cover Letter (PDF)")]:
                if path and os.path.exists(path):
                    with open(path, "rb") as f:
                        self._post_with_retry(
                            self._api("sendDocument"),
                            data={"chat_id": chat_id, "caption": label},
                            files={"document": f},
                            timeout=30,
                        )
                    time.sleep(0.7)

            self._send_message(f"✅ <b>End of alert</b> — scroll up ⬆️ for the job link\n{DIVIDER}", chat_id=chat_id)
            return True
        except Exception as e:
            console.print(f"[red]Telegram notify failed: {e}[/red]")
            return False

    def send_followup_digest(self, jobs: list, chat_id: str = "") -> bool:
        """Digest of applications sitting 7+ days with no status update —
        /api/followups already surfaces this list in the dashboard, this
        pushes the same data to Telegram so checking on it doesn't depend on
        remembering to open the dashboard."""
        chat_id = chat_id or TELEGRAM_CHAT_ID
        if not self.enabled or not chat_id:
            console.print("[yellow]Telegram not configured — connect Telegram in Profile, or set TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID in .env[/yellow]")
            return False
        if not jobs:
            return True  # nothing to report, not a failure
        try:
            lines = [f"📋 <b>FOLLOW-UP REMINDER</b> — {len(jobs)} application(s) 7+ days old, no update\n{DIVIDER}\n"]
            for j in jobs[:20]:
                lines.append(
                    f"• <b>{_esc(j.get('title', ''))}</b> @ {_esc(j.get('company', ''))}\n"
                    f"  Applied: {_esc((j.get('date_applied') or '')[:10])} | Score: {_esc(j.get('score', 0))}\n"
                    f"  {j.get('url', '')}\n"
                )
            if len(jobs) > 20:
                lines.append(f"...and {len(jobs) - 20} more — check the dashboard for the full list.")
            self._send_message("\n".join(lines), chat_id=chat_id, disable_preview=True)
            return True
        except Exception as e:
            console.print(f"[red]Telegram followup digest failed: {e}[/red]")
            return False
