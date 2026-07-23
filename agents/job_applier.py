import json
import re
import smtplib
import webbrowser
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import SMTP_EMAIL, SMTP_PASSWORD, SMTP_HOST, SMTP_PORT, USER_PROFILE, OUTPUT_DIR
from agents.cv_customizer import CVCustomizerAgent
from agents.tracker import TrackerAgent
from rich.console import Console
from rich.panel import Panel

console = Console()

# Matches a plain email address inside a job description, e.g. "send your resume
# to hr@company.com" — many company-posted (non-platform-form) listings include
# one directly in the text. Platform listings (Internshala's own apply flow,
# LinkedIn Easy Apply, etc.) generally don't, so this simply won't match there.
#
# TLD is bounded to 2-24 letters (unbounded `[a-zA-Z0-9-.]+` previously let the
# match run on past the real TLD into the next word whenever job_finder.py's
# HTML-to-text conversion glued two paragraphs together with no space —
# produced real garbage like "ryan@vitalize.careStack" from "vitalize.care"
# + "Stack is hiring...". Root cause fixed at the source (get_text(separator=" ")
# in job_finder.py); this bound is defense-in-depth, not the primary fix.
EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,24}")


def extract_email_from_description(description: str) -> str | None:
    if not description:
        return None
    match = EMAIL_RE.search(description)
    return match.group(0) if match else None


class JobApplierAgent:
    def __init__(self):
        self.cv_agent = CVCustomizerAgent()
        self.tracker = TrackerAgent()

    def prepare_application(self, user_id: str, job: dict) -> dict:
        console.print(f"[cyan]Preparing application package for: {job['title']} at {job['company']}[/cyan]")
        package = self.cv_agent.prepare_full_package(job)
        self.tracker.update_status(
            user_id, job["id"], "found",
            cv_path=package["cv_path"],
            cover_path=package["cover_letter_path"]
        )
        return package

    def open_apply_link(self, user_id: str, job: dict, package: dict = None) -> bool:
        detail_lines = (
            f"[bold]Job:[/bold] {job['title']} at {job['company']}\n"
            f"[bold]URL:[/bold] {job['url']}\n"
            f"[bold]Score:[/bold] {job.get('score', 0)}/100"
        )
        if package:
            detail_lines += (
                f"\n[bold]CV:[/bold] {package['cv_path']}"
                f"\n[bold]Cover Letter:[/bold] {package['cover_letter_path']}"
            )
        console.print(Panel(detail_lines, title="Ready to Apply", border_style="cyan"))

        if package:
            console.print("\n[bold yellow]Your tailored CV (preview):[/bold yellow]")
            console.print(package["cv_markdown"][:500] + "...\n")

        confirm = input("Open apply link in browser? (y/n): ").strip().lower()
        if confirm == "y":
            webbrowser.open(job["url"])
            applied = input("Did you submit the application? (y/n): ").strip().lower()
            if applied == "y":
                notes = input("Any notes? (press Enter to skip): ").strip()
                self.tracker.update_status(
                    user_id, job["id"], "applied", notes=notes,
                    cv_path=package["cv_path"] if package else "",
                    cover_path=package["cover_letter_path"] if package else ""
                )
                console.print("[green]Marked as Applied![/green]")
                return True
        return False

    def send_email_application(self, user_id: str, job: dict, to_email: str, package: dict) -> bool:
        if not SMTP_PASSWORD:
            console.print("[red]SMTP password not set. Add SMTP_PASSWORD to .env[/red]")
            return False

        subject = f"Application for {job['title']} - Aman Patel | React/Next.js Developer"
        body = f"""Dear Hiring Team,

{package['cover_letter']}

Best regards,
Aman Patel
{USER_PROFILE['phone']} | {USER_PROFILE['email']}
Portfolio: {USER_PROFILE['portfolio']} | GitHub: {USER_PROFILE['github']}
"""
        try:
            msg = MIMEMultipart()
            msg["From"] = SMTP_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            # Attach the actual generated PDF files (cv_customizer.py now outputs
            # PDF, not markdown — attaching package['cv_markdown'] as fake .md
            # text here would silently send stale/wrong content).
            for path_key, filename in [
                ("cv_path", "Aman_Patel_Resume.pdf"),
                ("cover_letter_path", "Aman_Patel_Cover_Letter.pdf"),
            ]:
                file_path = package.get(path_key)
                if not file_path or not Path(file_path).exists():
                    continue
                with open(file_path, "rb") as f:
                    attachment = MIMEBase("application", "pdf")
                    attachment.set_payload(f.read())
                encoders.encode_base64(attachment)
                attachment.add_header("Content-Disposition", "attachment", filename=filename)
                msg.attach(attachment)

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.ehlo()
                server.starttls()
                server.login(SMTP_EMAIL, SMTP_PASSWORD)
                server.sendmail(SMTP_EMAIL, to_email, msg.as_string())

            console.print(f"[green]Email sent to {to_email}![/green]")
            self.tracker.update_status(
                user_id, job["id"], "applied",
                notes=f"Email sent to {to_email}",
                cv_path=package["cv_path"],
                cover_path=package["cover_letter_path"]
            )
            return True
        except Exception as e:
            console.print(f"[red]Email failed: {e}[/red]")
            return False

    def bulk_apply_queue(self, user_id: str, jobs: list):
        console.print(f"[bold]Processing {len(jobs)} jobs in apply queue...[/bold]\n")
        applied = 0
        skipped = 0
        for i, job in enumerate(jobs, 1):
            console.print(f"\n[bold]--- Job {i}/{len(jobs)} ---[/bold]")
            console.print(f"[cyan]{job['title']}[/cyan] at [bold]{job['company']}[/bold]")
            console.print(
                f"Score: {job.get('score', 0)}/100 | "
                f"{job.get('location', '')} | "
                f"{job.get('url', '')}"
            )

            action = input("Prepare & apply (a), Skip (s), Quit (q): ").strip().lower()
            if action == "q":
                break
            if action == "s":
                skipped += 1
                continue
            if action == "a":
                package = self.prepare_application(user_id, job)
                result = self.open_apply_link(user_id, job, package)
                if result:
                    applied += 1

        console.print(f"\n[green]Session complete: {applied} applied, {skipped} skipped.[/green]")
