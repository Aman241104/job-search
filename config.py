import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Named "MODEL"/"MODEL_FALLBACK" for historical reasons, but claude_client.py's
# `quality_first` flag controls which one goes first per call site: job scoring
# and CV/cover-letter generation both use quality_first=True (try the smarter
# gemini-2.5-flash first, drop to flash-lite only once 2.5-flash is rate
# limited) since call volume is low enough that the smarter model costs
# fractions of a cent either way. quality_first=False (cheap-first) is only
# the default for the unused ask_claude/ask_claude_json/GeminiChat wrappers.
GEMINI_MODEL   = "gemini-3.1-flash-lite"  # cheap/high-quota — 500/day
GEMINI_MODEL_FALLBACK = "gemini-2.5-flash"  # smarter/low-quota — only 20/day

# NVIDIA NIM (build.nvidia.com) — free tier, OpenAI-compatible endpoint.
# claude_client.py now tries this BEFORE Gemini everywhere quality_first used to
# matter: free tier is ~40 RPM shared across models (upgradable to ~200 RPM),
# which dwarfs Gemini's 20/day quota on the smart model above. Gemini remains
# as the fallback if this key is ever unset/rate-limited, not removed.
# NOTE: "nvidia/llama-3.1-nemotron-70b-instruct" is listed in /v1/models but
# 404s ("Function not found for account") on this key — some catalog models
# aren't actually provisioned per-account. Verified working via a live test
# call on 2026-07-03: nvidia/llama-3.3-nemotron-super-49b-v1 (NVIDIA's
# "balance accuracy/compute" tier) and meta/llama-3.1-8b-instruct /
# nvidia/llama-3.1-nemotron-nano-8b-v1 (fast tier). meta/llama-3.3-70b-instruct
# timed out repeatedly — avoid it. Re-verify with a live call before changing
# this default, don't assume a catalog listing means it actually works.
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "nvidia/llama-3.3-nemotron-super-49b-v1")
NVIDIA_EMBED_MODEL = os.getenv("NVIDIA_EMBED_MODEL", "baai/bge-m3")

# AI_PROVIDER controls CV/cover-letter generation only (agents/cv_customizer.py).
# "claude_code" shells out to the local `claude` CLI, using the existing `claude login`
# OAuth session (Pro/Max subscription usage, not metered API billing) instead of Gemini.
# Only works on a machine with the CLI installed and logged in — never set this in
# Render/Vercel env vars, it will simply have no effect there since ask_ai() falls back
# to Gemini automatically when the CLI call fails (missing binary, not logged in, etc).
AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini")  # "gemini" (default) | "claude_code"
CLAUDE_CODE_BIN = os.getenv("CLAUDE_CODE_BIN", "claude")

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "patelaman0241@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID", "")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY", "")
JOOBLE_API_KEY = os.getenv("JOOBLE_API_KEY", "")
CAREERJET_API_KEY = os.getenv("CAREERJET_API_KEY", "")

# Cloudinary — persistent storage for uploaded book PDFs (Render's free-tier
# local disk is ephemeral and doesn't survive a restart/redeploy; the raw
# file matters here since the extracted text alone can't reproduce it for a
# "download the original" link). Free tier, no card needed.
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

# Telegram push for jobs that need a manual apply (no direct recruiter email —
# most of them). Sends the job link/details + generated CV/cover-letter PDFs
# so applying from a phone is just opening the link and attaching the files.
# Optional — feature no-ops if either var is unset. Get TELEGRAM_BOT_TOKEN from
# @BotFather (/newbot), get TELEGRAM_CHAT_ID by messaging your new bot once and
# then hitting https://api.telegram.org/bot<TOKEN>/getUpdates.
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
# Telegram sets this as the X-Telegram-Bot-Api-Secret-Token header on every
# webhook callback when set via setWebhook's secret_token param — the only
# real auth the public /api/telegram/webhook endpoint has, since anyone who
# finds the URL could otherwise POST arbitrary fake "applied" updates.
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")

# Quality gate (ROADMAP.md Phase 1 item, previously never built): don't
# tailor a CV/cover letter for a job scoring below this without an explicit
# override. /api/apply, /api/email-apply, /api/telegram-notify all check this.
MIN_APPLY_SCORE = int(os.getenv("MIN_APPLY_SCORE", "40"))

# Learning track — the exact curated list from ~/personal-project/next-18-months/ROADMAP.md's
# "Learning Core Track" section. Deliberately NOT a new curriculum, book library, or PDF
# ingestion pipeline — this just tracks progress + gives each item an AI tutor chat.
# Order matches the roadmap's stated reading order; don't reorder without updating that file too.
LEARNING_TRACK = [
    {"id": "pragmatic-programmer", "title": "The Pragmatic Programmer — Hunt & Thomas", "type": "book", "phase": 2, "order": 1},
    {"id": "hands-on-llms", "title": "Hands-On Large Language Models — Alammar & Grootendorst", "type": "book", "phase": 2, "order": 2},
    {"id": "learning-langchain", "title": "Learning LangChain — Oshin & Campos", "type": "book", "phase": 2, "order": 3},
    {"id": "gpt4-chatgpt-apps", "title": "Developing Apps with GPT-4 and ChatGPT, 2nd Ed — Caelen & Blete", "type": "book", "phase": 2, "order": 4},
    {"id": "prompt-engineering-llms", "title": "Prompt Engineering for LLMs — Berryman & Ziegler", "type": "book", "phase": 2, "order": 5},
    {"id": "agentic-ai-course", "title": "Course: The Complete Agentic AI Engineering Course (2025)", "type": "course", "phase": 2, "order": 6},
    {"id": "ai-agents-n8n-course", "title": "Course: The Complete AI Agents & AI Automation Course (n8n) (2025)", "type": "course", "phase": 2, "order": 7},
    {"id": "ml-interviews", "title": "Machine Learning Interviews — Shu", "type": "book", "phase": 3, "order": 8},
    {"id": "systems-book-pick-one", "title": "Pick one: SICP, Computer Systems: A Programmer's Perspective, or Code (Petzold)", "type": "book", "phase": 3, "order": 9},
]

USER_PROFILE = {
    "name": "Aman Patel",
    "email": "patelaman0241@gmail.com",
    "phone": "+919558009550",
    "linkedin": "linkedin.com/in/aman-patel-88847a265",
    "github": "github.com/Aman241104",
    "portfolio": "portfolio-1byaman.vercel.app",
    "location": "Ahmedabad, India",
    "cgpa": "8.00",
    "college": "LDCE Ahmedabad",
    "degree": "B.E. EC Engineering",
    "grad_year": "2026",
    "experience_years": 0,
}

JOB_PREFERENCES = {
    "target_roles": [
        "Frontend Developer",
        "React Developer",
        "Next.js Developer",
        "Full Stack Developer",
        "UI Developer",
        "Junior Software Engineer",
        "JavaScript Developer",
    ],
    "remote_preferred": True,
    # Remote is first preference, but Ahmedabad / anywhere in Gujarat is also fine
    "locations": ["Remote", "Ahmedabad", "Gujarat", "India"],
    "preferred_onsite": ["Ahmedabad", "Gujarat", "Gandhinagar", "Surat", "Vadodara"],
    "experience_level": "Entry Level",
    "tech_keywords": [
        "React", "Next.js", "TypeScript", "JavaScript", "Node.js",
        "Tailwind", "Frontend", "Full Stack", "MERN", "UI"
    ],
    # Minimum package to consider (in LPA). TCS Digital offered 7 LPA — target higher.
    "min_package_lpa": 7,
    "target_package_lpa": 10,
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
AGENTS_DIR = os.path.join(BASE_DIR, "agents")

# Generated PDFs inside OUTPUT_DIR are gitignored, and git doesn't track empty
# directories — so OUTPUT_DIR itself never existed in a fresh clone/deploy,
# only ever appearing to work locally because it already existed on disk from
# earlier runs. Caused a real production 500 (FileNotFoundError) on first
# real PDF generation on Render. Don't assume it exists — create it.
os.makedirs(OUTPUT_DIR, exist_ok=True)
