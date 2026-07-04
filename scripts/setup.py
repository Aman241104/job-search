#!/usr/bin/env python3
"""
Guided setup for a fresh clone of job-serach — walks you through every
account/key you need, writes your .env file, and optionally deploys.

Run from the repo root: python scripts/setup.py

Everything here is free-tier. Nothing costs money unless you explicitly
choose to deploy to a platform that requires a payment method on file
(Google Cloud Run does, due to India/some-region billing rules — you won't
be charged unless you exceed the free tier).
"""
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / ".env"


def ask(prompt: str, default: str = "", secret: bool = False) -> str:
    suffix = f" [{default}]" if default else " (press Enter to skip)"
    value = input(f"{prompt}{suffix}: ").strip()
    return value or default


def section(title: str):
    print()
    print("=" * 60)
    print(title)
    print("=" * 60)


def main():
    print(__doc__)
    input("Press Enter to begin...")
    env = {}

    section("1/7 — Database (required)")
    print("Create a free Supabase project at https://supabase.com")
    print("Project Settings -> Database -> Connection string -> URI (pooled, port 6543)")
    print("Tables are created automatically the first time the app runs — no manual SQL needed.")
    env["DATABASE_URL"] = ask("Paste your Supabase connection string")

    section("2/7 — AI provider (required)")
    print("NVIDIA NIM is the primary provider — free tier, ~40 requests/min, no card needed.")
    print("Sign up at https://build.nvidia.com, open any model, click 'Get API Key'.")
    env["NVIDIA_API_KEY"] = ask("Paste your NVIDIA API key")
    env["NVIDIA_MODEL"] = "nvidia/llama-3.3-nemotron-super-49b-v1"
    print()
    print("Gemini is used as a fallback if NVIDIA is ever rate-limited.")
    print("Free key at https://aistudio.google.com/apikey")
    env["GEMINI_API_KEY"] = ask("Paste your Gemini API key (optional)")

    section("3/7 — Email (for the email-apply feature)")
    print("Use a Gmail App Password, not your real password:")
    print("https://myaccount.google.com/apppasswords (needs 2-Factor Auth enabled first)")
    env["SMTP_EMAIL"] = ask("Your Gmail address")
    env["SMTP_PASSWORD"] = ask("Your Gmail App Password")

    section("4/7 — Extra job sources (optional, all free)")
    print("These add more scraped job sources. The app works fine without them.")
    env["ADZUNA_APP_ID"] = ask("Adzuna App ID (developer.adzuna.com/signup)")
    env["ADZUNA_APP_KEY"] = ask("Adzuna App Key")
    env["JOOBLE_API_KEY"] = ask("Jooble API key (jooble.org/api/about)")

    section("5/7 — Telegram bot (optional — job alerts + reply-to-mark-applied)")
    want_telegram = ask("Set up Telegram? (y/n)", "n").lower() == "y"
    if want_telegram:
        print("1. Message @BotFather on Telegram, send /newbot, follow the prompts")
        print("2. Message your new bot once (anything), then visit:")
        print("   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates")
        print("   Your chat_id is in the JSON response under message.chat.id")
        env["TELEGRAM_BOT_TOKEN"] = ask("Bot token")
        env["TELEGRAM_CHAT_ID"] = ask("Your chat ID")
        import secrets
        env["TELEGRAM_WEBHOOK_SECRET"] = secrets.token_urlsafe(32)
        print(f"Generated a random webhook secret for you: {env['TELEGRAM_WEBHOOK_SECRET']}")
    else:
        env["TELEGRAM_BOT_TOKEN"] = ""
        env["TELEGRAM_CHAT_ID"] = ""
        env["TELEGRAM_WEBHOOK_SECRET"] = ""

    section("6/7 — Cloudinary (optional — persists uploaded book/PDF files)")
    want_cloudinary = ask("Set up Cloudinary? (y/n)", "n").lower() == "y"
    if want_cloudinary:
        print("Free tier at https://cloudinary.com — after signup, your Cloud Name/API")
        print("Key/API Secret are all shown on your dashboard homepage.")
        print("IMPORTANT: make sure your API key has the 'Master Admin' role (or at least")
        print("'create' permission) under Settings -> API Keys, or uploads will fail with")
        print("a 403 even though the key 'works' for read-only calls.")
        env["CLOUDINARY_CLOUD_NAME"] = ask("Cloud Name")
        env["CLOUDINARY_API_KEY"] = ask("API Key")
        env["CLOUDINARY_API_SECRET"] = ask("API Secret")
    else:
        env["CLOUDINARY_CLOUD_NAME"] = ""
        env["CLOUDINARY_API_KEY"] = ""
        env["CLOUDINARY_API_SECRET"] = ""

    # Write .env
    if ENV_PATH.exists():
        overwrite = ask(f"\n{ENV_PATH} already exists. Overwrite? (y/n)", "n").lower() == "y"
        if not overwrite:
            print("Skipped writing .env — printing values below instead so you can merge them by hand:")
            for k, v in env.items():
                print(f"{k}={v}")
            return
    with open(ENV_PATH, "w") as f:
        for k, v in env.items():
            f.write(f"{k}={v}\n")
    print(f"\nWrote {ENV_PATH}")

    section("7/7 — Deploy (optional)")
    print("You can run this locally first (recommended) with:")
    print("  pip install -r requirements.txt && uvicorn app:app --reload")
    print()
    deploy = ask("Deploy to Google Cloud Run now? Requires the gcloud CLI + a GCP project with billing enabled (y/n)", "n").lower() == "y"
    if deploy:
        project_id = ask("Your GCP project ID (create one first with: gcloud projects create <id>)")
        region = ask("Region", "asia-south1")
        if not project_id:
            print("No project ID given — skipping deploy. Run this again once you have one.")
        else:
            env_vars = ",".join(f"{k}={v}" for k, v in env.items() if v)
            cmd = [
                "gcloud", "run", "deploy", "job-serach-api",
                "--source", ".", "--region", region, "--project", project_id,
                "--allow-unauthenticated", "--memory", "2Gi",
                "--set-env-vars", env_vars,
            ]
            print("\nRunning:", " ".join(cmd[:6]), "...")
            subprocess.run(cmd, cwd=REPO_ROOT)

    print()
    print("Done. If you skipped the deploy step, come back to this script anytime — it's idempotent.")
    print("Frontend: cd web && npm install && npm run dev (set NEXT_PUBLIC_API_URL in web/.env.local")
    print("to your backend URL — http://localhost:8000 for local, or your deployed URL).")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nSetup cancelled.")
        sys.exit(1)
