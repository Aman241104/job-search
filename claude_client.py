"""
AI client — uses Google Gemini API (free tier).
Falls back to keyword-based scoring if API is rate-limited.

Get a free Gemini API key: https://aistudio.google.com/apikey
Add to .env:  GEMINI_API_KEY=your_key_here
"""
import json
import re
import time
import os
import sys
import requests as _requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# lazy import so config can be loaded first
def _cfg():
    from config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_MODEL_FALLBACK
    return GEMINI_API_KEY, GEMINI_MODEL, GEMINI_MODEL_FALLBACK


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_rate_limited_until = 0   # global cooldown timestamp


def ask_gemini(prompt: str, system: str = "", model: str = "",
               history: list = None, max_tokens: int = 1000,
               temperature: float = 0.7, retries: int = 3) -> str:
    """
    Call Gemini API. Returns response text or "" on failure.
    history = [{"role": "user"|"model", "parts": [{"text": "..."}]}, ...]
    """
    global _rate_limited_until
    api_key, default_model, fallback_model = _cfg()

    if not api_key:
        return _keyword_fallback(prompt)

    chosen_model = model or default_model

    # Build contents
    contents = []
    if history:
        contents.extend(history)
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    body: dict = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature,
            # Some Gemini models spend part of maxOutputTokens on invisible reasoning
            # tokens before writing the visible answer, which was silently truncating
            # CVs/cover letters (finishReason MAX_TOKENS with ~90% of the budget spent
            # on thinking). This task doesn't need multi-step reasoning, so disable it.
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    if system:
        body["system_instruction"] = {"parts": [{"text": system}]}

    for attempt in range(retries):
        # honour cooldown
        wait = _rate_limited_until - time.time()
        if wait > 0:
            time.sleep(min(wait, 30))

        try:
            resp = _requests.post(
                GEMINI_URL.format(model=chosen_model),
                headers={
                    "Content-Type": "application/json",
                    "X-goog-api-key": api_key,
                },
                json=body,
                timeout=30,
            )
            data = resp.json()

            if resp.status_code == 200:
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()

            err_code = data.get("error", {}).get("code", 0)
            err_msg  = data.get("error", {}).get("message", "")

            if err_code == 429:
                # extract retry delay from message if present
                delay_match = re.search(r"retry in ([\d.]+)s", err_msg)
                delay = float(delay_match.group(1)) if delay_match else 30
                _rate_limited_until = time.time() + delay + 2
                if attempt < retries - 1:
                    time.sleep(min(delay + 2, 60))
                    # try fallback model on second attempt
                    if attempt == 1:
                        chosen_model = fallback_model
                    continue

            if err_code in (503, 500) and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue

            # model not found → try fallback once
            if err_code == 404 and chosen_model != fallback_model:
                chosen_model = fallback_model
                continue

            break   # unrecoverable error

        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5)
            continue

    # All retries exhausted — use keyword fallback for scoring prompts
    return _keyword_fallback(prompt)


def _keyword_fallback(prompt: str) -> str:
    """
    Zero-AI fallback: if prompt looks like a scoring request, return a
    keyword-based JSON score so the rest of the pipeline keeps working.
    """
    p = prompt.lower()
    if '"score"' in p or "score this job" in p:
        good  = ["react", "next.js", "nextjs", "frontend", "javascript", "typescript",
                 "node.js", "full stack", "fullstack", "ui developer"]
        bad   = ["senior", "staff", "principal", "lead", "data science", "devops",
                 "embedded", "ruby", "php", "kotlin", "android", "ios"]
        score = 50
        for kw in good:
            if kw in p: score += 8
        for kw in bad:
            if kw in p: score = max(5, score - 15)
        score = min(score, 90)
        return json.dumps({"score": score, "reason": "keyword-based score (API unavailable)"})
    return ""


# ── Local Claude Code CLI provider (CV/cover-letter generation only) ─────────

def ask_claude_code(prompt: str, system: str = "") -> str:
    """
    Call the local Claude Code CLI in headless mode. Uses whatever `claude login`
    session is already active on this machine (Pro/Max subscription usage, not
    metered API billing) — deliberately does NOT use --bare, since bare mode
    requires ANTHROPIC_API_KEY and skips the OAuth/keychain session entirely.
    Only works where the `claude` binary is installed and logged in — returns ""
    on any failure (missing binary, not logged in, timeout, bad JSON) so the
    caller can fall back to Gemini.
    """
    import subprocess
    from config import CLAUDE_CODE_BIN

    cmd = [CLAUDE_CODE_BIN, "-p", prompt, "--output-format", "json", "--allowedTools", ""]
    if system:
        cmd += ["--append-system-prompt", system]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return ""
        data = json.loads(result.stdout)
        return (data.get("result") or "").strip()
    except Exception:
        return ""


def ask_ai(prompt: str, system: str = "", max_tokens: int = 1000, temperature: float = 0.7) -> str:
    """
    Provider-agnostic entry point for CV/cover-letter generation. Routes to the
    local Claude Code CLI when AI_PROVIDER=claude_code, otherwise (or on any
    Claude Code failure) uses Gemini. Fails OPEN to Gemini, never closed —
    even a stray AI_PROVIDER=claude_code on a deployed host is harmless, since
    the CLI simply won't be there and ask_claude_code() returns "".
    """
    from config import AI_PROVIDER
    if AI_PROVIDER == "claude_code":
        result = ask_claude_code(prompt, system=system)
        if result:
            return result
    return ask_gemini(prompt, system=system, max_tokens=max_tokens, temperature=temperature)


# ── Convenience wrappers (same interface as before) ───────────────────────────

def ask_claude(prompt: str, system: str = "", timeout: int = 60, retries: int = 2) -> str:
    """Drop-in replacement — now calls Gemini."""
    return ask_gemini(prompt, system=system, retries=retries)


def ask_claude_json(prompt: str, system: str = "", timeout: int = 60) -> dict:
    """Ask and parse JSON from response."""
    raw = ask_gemini(prompt, system=system, max_tokens=300)
    if not raw:
        return {}
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


# ── Batch scorer — 10 jobs per API call instead of 1 ─────────────────────────

def score_jobs_batch(jobs: list, profile_summary: str) -> list[dict]:
    """
    Score up to 10 jobs in a single Gemini call.
    Returns list of {"score": int, "reason": str} in the same order.
    """
    if not jobs:
        return []

    lines = []
    for i, j in enumerate(jobs):
        loc = j.get("location", "")
        lines.append(
            f'{i+1}. "{j["title"]}" @ {j["company"]} | {loc} | '
            f'Salary: {j.get("salary","?")} | '
            f'Desc: {j.get("description","")[:200]}'
        )

    prompt = f"""Score each job 0-100 for this candidate. Return ONLY a JSON array of objects in order:
[{{"score": <int>, "reason": "<10 words max>"}}, ...]

Candidate: {profile_summary}

Jobs to score:
{chr(10).join(lines)}

Rules:
- 80-100: React/Next.js/frontend, fresher-friendly, remote or Gujarat/Ahmedabad
- 60-79: Full stack JS, acceptable location
- 40-59: Some overlap but not ideal
- 0-39: Wrong domain, senior-only, no relevant skills
- Penalise 15pts if onsite in Bangalore/Mumbai/Delhi/Pune (far from Ahmedabad)
- Bonus 10pts if location says Remote/WFH/Anywhere

Return ONLY the JSON array, nothing else."""

    raw = ask_gemini(prompt, max_tokens=800, temperature=0.2)
    if not raw:
        # fallback: score individually
        results = []
        for j in jobs:
            fb = _keyword_fallback(j.get("title","") + " " + j.get("description","")[:200])
            d  = json.loads(fb) if fb else {"score": 40, "reason": "fallback"}
            results.append(d)
        return results

    # parse array
    arr_match = re.search(r'\[.*\]', raw, re.DOTALL)
    if arr_match:
        try:
            arr = json.loads(arr_match.group())
            if isinstance(arr, list) and len(arr) == len(jobs):
                return [{"score": int(x.get("score", 40)), "reason": x.get("reason", "")} for x in arr]
        except Exception:
            pass

    # partial parse failure — return fallback scores
    return [{"score": 40, "reason": "parse error"} for _ in jobs]


# ── Multi-turn conversation for trainer ──────────────────────────────────────

class GeminiChat:
    """Stateful multi-turn chat using Gemini's native conversation history."""

    def __init__(self, system: str = "", temperature: float = 0.8):
        self.system      = system
        self.temperature = temperature
        self.history: list = []

    def send(self, message: str, max_tokens: int = 600) -> str:
        response = ask_gemini(
            message,
            system=self.system,
            history=self.history,
            max_tokens=max_tokens,
            temperature=self.temperature,
        )
        if response:
            self.history.append({"role": "user",  "parts": [{"text": message}]})
            self.history.append({"role": "model", "parts": [{"text": response}]})
        return response

    def reset(self):
        self.history = []
