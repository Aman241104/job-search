import json
from pathlib import Path
from agents.job_finder import JobFinderAgent
from agents.cv_customizer import CVCustomizerAgent
from agents.tracker import TrackerAgent
from agents.trainer import TrainerAgent
from agents.job_applier import JobApplierAgent
from config import DATA_DIR, SMTP_EMAIL
from rich.console import Console
from rich.panel import Panel

console = Console()


class JobSearchOrchestrator:
    """CLI entry point — always resolves to the CLI owner's own account
    (matched by SMTP_EMAIL), since only that person has terminal access to
    run this locally. Multi-tenancy (separate Google-logged-in accounts)
    only applies to the web dashboard in app.py."""

    def __init__(self):
        console.print("[bold cyan]Initializing Job Search System...[/bold cyan]")
        self.finder = JobFinderAgent()
        self.customizer = CVCustomizerAgent()
        self.tracker = TrackerAgent()
        self.trainer = TrainerAgent()
        self.applier = JobApplierAgent()
        owner = self.tracker.get_user_by_email(SMTP_EMAIL)
        if not owner:
            raise RuntimeError(
                f"No account found for {SMTP_EMAIL} — log in once via the web dashboard "
                "(Google login) before using the CLI."
            )
        self.user_id = owner["id"]

    def daily_run(self, keywords: list = None):
        console.print(Panel("[bold]Daily Job Search Run[/bold]", expand=False))
        jobs = self.finder.find_jobs(keywords=keywords)
        added = 0
        for job in jobs:
            if self.tracker.add_job(self.user_id, job):
                added += 1
        console.print(f"\n[green]Added {added} new jobs to tracker.[/green]")
        stats = self.tracker.get_stats(self.user_id)
        console.print(
            f"Total in DB: {stats.get('total', 0)} | "
            f"Applied: {stats.get('applied', 0)} | "
            f"Offers: {stats.get('offer', 0)}"
        )
        return jobs

    def apply_to_top_jobs(self, n: int = 5, min_score: int = 70):
        top_jobs = self.tracker.get_unapplied_top_jobs(self.user_id, min_score=min_score, limit=n)
        if not top_jobs:
            console.print(
                f"[yellow]No unapplied jobs with score >= {min_score}. "
                "Try running 'find' first.[/yellow]"
            )
            return
        self.applier.bulk_apply_queue(self.user_id, top_jobs)

    def show_dashboard(self):
        self.tracker.print_dashboard(self.user_id)

    def start_training(self, topic: str = None):
        if topic:
            topic_map = {
                "react": "1", "js": "1", "frontend": "1",
                "node": "2", "backend": "2",
                "dsa": "3", "arrays": "3",
                "trees": "4",
                "system": "5", "design": "5",
                "hr": "6", "behavioral": "6",
                "portfolio": "7",
                "salary": "8",
            }
            key = topic_map.get(topic.lower(), None)
            self.trainer.run_session(key)
        else:
            self.trainer.run_session()
