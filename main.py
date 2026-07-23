#!/usr/bin/env python3
import argparse
import sys
from rich.console import Console
from rich.panel import Panel

console = Console()


def main():
    parser = argparse.ArgumentParser(
        description="Job Search AI System - Powered by Claude",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  find                    Find and score new jobs from all sources
  find --keywords react   Search with specific keywords
  apply                   Start apply workflow for top scored jobs
  apply --top 10          Apply to top 10 scored jobs
  apply --id <job_id>     Apply to a specific job by ID
  track                   Show application dashboard
  export                  Export to Excel (output/job_tracker.xlsx)
  train                   Start interactive interview training
  train --topic dsa       Train specific topic (react/dsa/hr/portfolio/salary/system/backend)
  status                  Quick stats overview
        """
    )
    subparsers = parser.add_subparsers(dest="command")

    # find
    find_p = subparsers.add_parser("find", help="Find new jobs")
    find_p.add_argument("--keywords", nargs="+", default=None)

    # apply
    apply_p = subparsers.add_parser("apply", help="Apply to jobs")
    apply_p.add_argument("--top", type=int, default=5)
    apply_p.add_argument("--id", dest="job_id", default=None)
    apply_p.add_argument("--min-score", type=int, default=65)

    # track
    subparsers.add_parser("track", help="Show tracker dashboard")

    # export
    subparsers.add_parser("export", help="Export to Excel")

    # train
    train_p = subparsers.add_parser("train", help="Interview training")
    train_p.add_argument("--topic", default=None, help="react/dsa/hr/portfolio/salary/system/backend")
    train_p.add_argument("--progress", action="store_true", help="Show training progress")

    # status
    subparsers.add_parser("status", help="Quick stats")

    # update
    update_p = subparsers.add_parser("update", help="Update job status")
    update_p.add_argument("job_id")
    update_p.add_argument("status", choices=["found", "applied", "interviewing", "offer", "rejected", "ghosted"])
    update_p.add_argument("--notes", default="")

    # links — show Gujarat/Ahmedabad job board links to open manually
    subparsers.add_parser("links", help="Show Ahmedabad/Gujarat job board links to open in browser")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    console.print(Panel("[bold cyan]Job Search AI System[/bold cyan] — Powered by Claude", expand=False))

    from orchestrator import JobSearchOrchestrator
    orch = JobSearchOrchestrator()

    if args.command == "find":
        jobs = orch.daily_run(keywords=args.keywords)
        if jobs:
            console.print(f"\n[bold]Top 5 matches:[/bold]")
            for j in jobs[:5]:
                console.print(f"  [{j['score']}/100] {j['title']} @ {j['company']} — {j['location']}")

    elif args.command == "apply":
        if args.job_id:
            # Apply to specific job
            finder = orch.finder
            all_jobs = finder.get_all_jobs()
            job = next((j for j in all_jobs if j["id"].startswith(args.job_id)), None)
            if not job:
                console.print(f"[red]Job ID '{args.job_id}' not found.[/red]")
                sys.exit(1)
            package = orch.applier.prepare_application(orch.user_id, job)
            orch.applier.open_apply_link(orch.user_id, job, package)
        else:
            orch.apply_to_top_jobs(n=args.top, min_score=args.min_score)

    elif args.command == "track":
        orch.show_dashboard()

    elif args.command == "export":
        path = orch.tracker.export_to_excel(orch.user_id)
        console.print(f"[green]Excel file: {path}[/green]")

    elif args.command == "train":
        if args.progress:
            orch.trainer.show_progress()
        else:
            orch.start_training(topic=args.topic)

    elif args.command == "status":
        stats = orch.tracker.get_stats(orch.user_id)
        console.print(Panel(
            f"Total Jobs Found: [bold]{stats.get('total', 0)}[/bold]\n"
            f"Applied: [blue]{stats.get('applied', 0)}[/blue]\n"
            f"Interviewing: [yellow]{stats.get('interviewing', 0)}[/yellow]\n"
            f"Offers: [green]{stats.get('offer', 0)}[/green]\n"
            f"Rejected: [red]{stats.get('rejected', 0)}[/red]\n"
            f"Ghosted: [dim]{stats.get('ghosted', 0)}[/dim]",
            title="Job Search Status"
        ))

    elif args.command == "update":
        orch.tracker.update_status(orch.user_id, args.job_id, args.status, notes=args.notes)

    elif args.command == "links":
        from agents.job_finder import JobFinderAgent
        links = JobFinderAgent().get_gujarat_job_links()
        import webbrowser
        console.print(Panel("[bold]Ahmedabad / Gujarat Job Board Links[/bold]\nOpening all in browser...", expand=False))
        for l in links:
            console.print(f"[bold cyan]{l['platform']}[/bold cyan] — {l['note']}")
            console.print(f"  [dim]{l['url']}[/dim]")
            webbrowser.open(l["url"])
        console.print("\n[green]All links opened! Apply and then run:[/green]")
        console.print("  python main.py update <job_id> applied --notes 'Applied via Naukri'")


if __name__ == "__main__":
    main()
