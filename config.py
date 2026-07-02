import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-3.1-flash-lite"  # primary — no thinking-token overhead, 500/day quota
GEMINI_MODEL_FALLBACK = "gemini-2.5-flash"  # fallback if primary rate-limited (only 20/day)

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

USER_PROFILE = {
    "name": "Aman Patel",
    "email": "patelaman0241@gmail.com",
    "phone": "+919558009550",
    "linkedin": "linkedin.com/in/aman-patel",
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
