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


def _nvidia_cfg():
    from config import NVIDIA_API_KEY, NVIDIA_MODEL
    return NVIDIA_API_KEY, NVIDIA_MODEL


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Per-model cooldown timestamps, persisted to disk so a Render restart (or a
# fresh local process) doesn't forget a model was rate-limited today and waste
# a call re-discovering it.
_COOLDOWN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "gemini_cooldowns.json")


def _load_cooldowns() -> dict:
    try:
        with open(_COOLDOWN_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


_rate_limited_until = _load_cooldowns()   # {model_name: unix_ts}


def _cooldown_remaining(model: str) -> float:
    return _rate_limited_until.get(model, 0) - time.time()


def _set_cooldown(model: str, until_ts: float) -> None:
    _rate_limited_until[model] = until_ts
    try:
        os.makedirs(os.path.dirname(_COOLDOWN_FILE), exist_ok=True)
        with open(_COOLDOWN_FILE, "w") as f:
            json.dump(_rate_limited_until, f)
    except Exception:
        pass


def ask_gemini(prompt: str, system: str = "", model: str = "",
               history: list = None, max_tokens: int = 1000,
               temperature: float = 0.7, retries: int = 3,
               quality_first: bool = False) -> str:
    """
    Call Gemini API. Returns response text or "" on failure.
    history = [{"role": "user"|"model", "parts": [{"text": "..."}]}, ...]

    quality_first: try the smarter/lower-quota model first and drop to the
    cheap/high-quota model only once the smart one is rate-limited. Default
    (False) is cheap-first, for high-volume low-stakes calls like batch job
    scoring where the cheap model's answer is good enough and the point is
    quota, not quality.
    """
    api_key, default_model, fallback_model = _cfg()

    if not api_key:
        return _keyword_fallback(prompt)

    if model:
        models_order = [model]
    elif quality_first:
        models_order = [fallback_model, default_model]
    else:
        models_order = [default_model, fallback_model]

    model_idx = 0
    chosen_model = models_order[0]

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
        # skip straight past any model we already know is cooling down today
        while _cooldown_remaining(chosen_model) > 0 and model_idx < len(models_order) - 1:
            model_idx += 1
            chosen_model = models_order[model_idx]

        wait = _cooldown_remaining(chosen_model)
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
                _set_cooldown(chosen_model, time.time() + delay + 2)
                if model_idx < len(models_order) - 1:
                    model_idx += 1
                    chosen_model = models_order[model_idx]
                    continue
                if attempt < retries - 1:
                    time.sleep(min(delay + 2, 60))
                    continue

            if err_code in (503, 500) and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue

            # model not found → try the next one in the order, if any
            if err_code == 404 and model_idx < len(models_order) - 1:
                model_idx += 1
                chosen_model = models_order[model_idx]
                continue

            break   # unrecoverable error

        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5)
            continue

    # All retries exhausted — use keyword fallback for scoring prompts
    return _keyword_fallback(prompt)


def ask_nvidia(prompt: str, system: str = "", model: str = "",
               history: list = None, max_tokens: int = 1000,
               temperature: float = 0.7, retries: int = 2) -> str:
    """
    Call NVIDIA NIM's OpenAI-compatible chat completions endpoint
    (build.nvidia.com, free tier ~40 RPM shared across models — dwarfs
    Gemini's 20/day quota on its smart model). This is now the first choice
    everywhere quality_first used to matter; Gemini is the fallback, not
    removed, in case this key is ever unset/rate-limited.

    history = [{"role": "user"|"assistant", "content": "..."}, ...] (OpenAI
    format — different from ask_gemini's "model"/"parts" format).

    Returns "" on any failure (no key, network error, non-200) so callers can
    fall back to Gemini/keyword scoring, same contract as ask_gemini.
    """
    api_key, default_model = _nvidia_cfg()
    if not api_key:
        return ""

    chosen_model = model or default_model
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": chosen_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }

    for attempt in range(retries):
        try:
            resp = _requests.post(
                NVIDIA_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=body,
                timeout=60,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
            if resp.status_code == 429 and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            break
        except Exception:
            if attempt < retries - 1:
                time.sleep(3)
            continue
    return ""


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
    Provider-agnostic entry point for CV/cover-letter generation. Order:
    Claude Code CLI (if AI_PROVIDER=claude_code) -> NVIDIA NIM -> Gemini ->
    keyword fallback (inside ask_gemini). Fails OPEN at every step, never
    closed — a stray AI_PROVIDER=claude_code or missing NVIDIA_API_KEY on a
    deployed host is harmless, each provider just returns "" and the next one
    is tried.
    """
    from config import AI_PROVIDER
    if AI_PROVIDER == "claude_code":
        result = ask_claude_code(prompt, system=system)
        if result:
            return result
    result = ask_nvidia(prompt, system=system, max_tokens=max_tokens, temperature=temperature)
    if result:
        return result
    return ask_gemini(prompt, system=system, max_tokens=max_tokens, temperature=temperature,
                       quality_first=True)


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


# ── Single-job scorer ──────────────────────────────────────────────────────
# Previously batched 10 jobs per call to conserve Gemini's 20/day smart-model
# quota. NVIDIA's ~40 RPM (shared across models, no meaningful daily cap for
# this project's volume) removes that constraint, so each uncertain job now
# gets the model's full attention in its own prompt instead of sharing
# context with 9 others — should score more accurately, at the cost of one
# call per job instead of one per 10 (fine, since calls are no longer scarce).

def score_job_single(job: dict, profile_summary: str) -> dict:
    """
    Score a single job. Returns {"score": int, "reason": str}.
    NVIDIA first, Gemini fallback, keyword fallback if both fail — same
    provider chain as everywhere else in this module.
    """
    loc = job.get("location", "")
    prompt = f"""Score this job 0-100 for this candidate. Return ONLY a JSON object:
{{"score": <int>, "reason": "<10 words max>"}}

Candidate: {profile_summary}

Job: "{job['title']}" @ {job['company']} | {loc} | Salary: {job.get('salary','?')} | Desc: {job.get('description','')[:300]}

Rules:
- 80-100: React/Next.js/frontend, fresher-friendly, remote or Gujarat/Ahmedabad
- 60-79: Full stack JS, acceptable location
- 40-59: Some overlap but not ideal
- 0-39: Wrong domain, senior-only, no relevant skills
- Penalise 15pts if onsite in Bangalore/Mumbai/Delhi/Pune (far from Ahmedabad)
- Bonus 10pts if location says Remote/WFH/Anywhere

Return ONLY the JSON object, nothing else."""

    raw = ask_nvidia(prompt, max_tokens=100, temperature=0.2)
    if not raw:
        raw = ask_gemini(prompt, max_tokens=100, temperature=0.2, quality_first=True)
    if not raw:
        fb = _keyword_fallback(job.get("title", "") + " " + job.get("description", "")[:200])
        return json.loads(fb) if fb else {"score": 40, "reason": "fallback"}

    obj_match = re.search(r'\{.*\}', raw, re.DOTALL)
    if obj_match:
        try:
            obj = json.loads(obj_match.group())
            return {"score": int(obj.get("score", 40)), "reason": obj.get("reason", "")}
        except Exception:
            pass

    return {"score": 40, "reason": "parse error"}


def check_legitimacy(job: dict) -> dict:
    """
    Text-based posting-legitimacy check (inspired by career-ops's "Block G"),
    scoped down from that project's version — no live re-navigation/liveness
    recheck, purely analyzing the JD text and metadata already in our DB.
    Returns {"score": int (0-100, higher = more likely a real, well-formed
    posting), "flags": [str, ...]} — flags are neutral observations, not
    accusations (a posting can legitimately be missing salary, etc.).
    """
    prompt = f"""Analyze this job posting for signals of legitimacy — is it a real, well-specified opening, or does it look generic/low-effort/potentially fake? Return ONLY a JSON object:
{{"score": <int 0-100>, "flags": ["<short flag>", ...]}}

Job: "{job.get('title','')}" @ {job.get('company','')} | {job.get('location','')} | Salary: {job.get('salary') or 'not specified'}
Description: {job.get('description','')[:2000]}

Check for (add a flag only when the signal is actually present, don't force-fit unrelated ones):
- Generic boilerplate ratio (JD reads like a template vs describes real day-to-day work)
- Specific technologies/tools named vs vague buzzwords only
- Realistic experience requirements (years asked vs how long the named tech has existed)
- Internal contradictions (e.g. entry-level title paired with staff/lead-level asks)
- Salary/compensation mentioned or not
- Clear scope for the role vs a vague catch-all description

Score 80-100: specific, consistent, well-scoped posting. 50-79: some genuine content but generic in places. 0-49: mostly boilerplate, vague, or contradictory.
Return ONLY the JSON object, nothing else."""

    raw = ask_nvidia(prompt, max_tokens=250, temperature=0.2)
    if not raw:
        raw = ask_gemini(prompt, max_tokens=250, temperature=0.2, quality_first=True)
    if not raw:
        return {"score": None, "flags": []}

    obj_match = re.search(r'\{.*\}', raw, re.DOTALL)
    if obj_match:
        try:
            obj = json.loads(obj_match.group())
            flags = obj.get("flags", [])
            return {
                "score": int(obj.get("score", 50)),
                "flags": [str(f) for f in flags] if isinstance(flags, list) else [],
            }
        except Exception:
            pass

    return {"score": None, "flags": []}


def draft_star_story(rough_notes: str) -> dict:
    """
    Structures a rough, informally-described experience into a STAR+Reflection
    story for the interview story bank (career-ops's "Story Bank" idea) — the
    Reflection field (what was learned / what would be done differently) is
    what separates a senior-sounding answer from a junior one.
    Returns {"situation": str, "task": str, "action": str, "result": str,
    "reflection": str, "tags": [str, ...]}, or empty strings on failure.
    """
    prompt = f"""Structure this rough description of a past experience into a STAR+Reflection interview story. Return ONLY a JSON object:
{{"situation": "...", "task": "...", "action": "...", "result": "...", "reflection": "...", "tags": ["...", ...]}}

Rough notes from the candidate:
{rough_notes[:2000]}

Guidance:
- Situation: brief context, 1-2 sentences
- Task: what specifically needed to be done/decided
- Action: what the candidate concretely did (first person, specific — not vague)
- Result: the concrete outcome, with a number/metric if the notes mention one
- Reflection: what was learned or what would be done differently — this is what signals seniority, don't skip it
- tags: 2-4 short competency tags (e.g. "leadership", "conflict resolution", "technical challenge", "failure recovery", "ownership")
- Use ONLY details present in the rough notes — do not invent facts, numbers, or outcomes not mentioned

Return ONLY the JSON object, nothing else."""

    raw = ask_ai(prompt, max_tokens=500)
    if not raw:
        return {"situation": "", "task": "", "action": "", "result": "", "reflection": "", "tags": []}

    obj_match = re.search(r'\{.*\}', raw, re.DOTALL)
    if obj_match:
        try:
            obj = json.loads(obj_match.group())
            tags = obj.get("tags", [])
            return {
                "situation": obj.get("situation", ""),
                "task": obj.get("task", ""),
                "action": obj.get("action", ""),
                "result": obj.get("result", ""),
                "reflection": obj.get("reflection", ""),
                "tags": [str(t) for t in tags] if isinstance(tags, list) else [],
            }
        except Exception:
            pass

    return {"situation": "", "task": "", "action": "", "result": "", "reflection": "", "tags": []}


# ── Multi-turn conversation for trainer ──────────────────────────────────────

class GeminiChat:
    """
    Stateful multi-turn chat for the interview trainer. Despite the name (kept
    for backward compat — trainer.py and app.py both import `GeminiChat`
    directly), tries NVIDIA first each turn and only falls back to Gemini if
    NVIDIA is unavailable/rate-limited. History is kept in OpenAI format
    (role: user/assistant) since that's NVIDIA's native format; converted to
    Gemini's (role: user/model, parts:[{text}]) only on the fallback path.
    """

    def __init__(self, system: str = "", temperature: float = 0.8):
        self.system      = system
        self.temperature = temperature
        self.history: list = []   # [{"role": "user"|"assistant", "content": "..."}]

    def send(self, message: str, max_tokens: int = 600) -> str:
        response = ask_nvidia(
            message,
            system=self.system,
            history=self.history,
            max_tokens=max_tokens,
            temperature=self.temperature,
        )
        if not response:
            gemini_history = [
                {"role": "user" if m["role"] == "user" else "model",
                 "parts": [{"text": m["content"]}]}
                for m in self.history
            ]
            response = ask_gemini(
                message,
                system=self.system,
                history=gemini_history,
                max_tokens=max_tokens,
                temperature=self.temperature,
            )
        if response:
            self.history.append({"role": "user", "content": message})
            self.history.append({"role": "assistant", "content": response})
        return response

    def reset(self):
        self.history = []
