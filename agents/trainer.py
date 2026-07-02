import json
import re
from datetime import datetime
from pathlib import Path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATA_DIR
from claude_client import GeminiChat
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown

console = Console()

TRAINING_TOPICS = {
    "1": ("Technical - React/JS/TS", "react_js"),
    "2": ("Technical - Node.js/Backend", "backend"),
    "3": ("DSA - Arrays & Strings", "dsa_arrays"),
    "4": ("DSA - Trees & Graphs", "dsa_trees"),
    "5": ("System Design Basics", "system_design"),
    "6": ("HR & Behavioral (STAR method)", "behavioral"),
    "7": ("Portfolio Walkthrough Practice", "portfolio"),
    "8": ("Salary Negotiation", "salary"),
}

SYSTEM_PROMPTS = {
    "react_js": """You are a senior frontend engineer interviewing Aman Patel, a fresher, for a React/Next.js role.
Ask one technical question at a time. After the candidate answers, give a score /10, specific feedback on what was good/missing,
and a model answer. Then ask the next question. Cover: React hooks, state management, component lifecycle, TypeScript basics,
Next.js SSR vs SSG, Tailwind, performance optimization, API integration.""",

    "backend": """You are interviewing Aman Patel, a fresher, for a Node.js/Express backend role.
Ask one question at a time. Score answers /10 with feedback and model answer. Cover: REST API design, Express middleware,
MongoDB queries, authentication (JWT), async/await, error handling, basic SQL.""",

    "dsa_arrays": """You are a technical interviewer testing DSA skills of Aman Patel who has solved 58 LeetCode problems (mix of easy/medium).
Give one coding problem at a time (pseudocode or explanation is fine, no IDE). After answer: score /10, explain optimal solution,
time/space complexity. Focus on: arrays, strings, two pointers, sliding window, hash maps, sorting.""",

    "dsa_trees": """You are a technical interviewer testing DSA - Trees and Graphs for Aman Patel, a fresher.
Ask one problem at a time. Score /10 with feedback and optimal solution. Cover: BST operations, BFS, DFS, binary tree traversals,
recursion patterns.""",

    "system_design": """You are interviewing Aman Patel, a fresher, on basic system design. Keep questions appropriate for 0 years experience.
Ask about: URL shortener design, designing a simple REST API, database schema design, caching basics,
what is CDN/load balancer. Score /10 with guidance.""",

    "behavioral": """You are an HR interviewer using STAR method evaluation for Aman Patel, a fresh EC Engineering graduate.
Ask one behavioral question at a time. After the candidate answers, evaluate: did they give Situation, Task, Action, Result?
Score /10. Give model answer framework. Cover: tell me about yourself, biggest challenge, team conflict, failure and learning,
why this company, strengths/weaknesses.""",

    "portfolio": """You are a hiring manager. Aman Patel will walk you through their projects.
Ask probing questions about: DevEvents (Next.js event discovery app), Awwwards Clone (GSAP animations), SaaS Landing Page, Stock App (TypeScript).
Ask: why did you build this? what was the hardest part? how would you scale it? what would you do differently?
Score their explanation /10.""",

    "salary": """You are playing an HR negotiator in a salary discussion with Aman Patel, a fresher with a TCS Digital offer of 7 LPA.
Help them practice negotiating for 8-12 LPA at a product startup. As a fresher in India: product startups pay 7-12 LPA,
service companies 4-7 LPA. Practice the negotiation conversation, then give tips on what they did well/poorly.""",
}


class TrainerAgent:
    def __init__(self):
        self.log_file = Path(DATA_DIR) / "training_log.json"

    def _load_log(self) -> list:
        if self.log_file.exists():
            with open(self.log_file) as f:
                return json.load(f)
        return []

    def _save_session(self, topic: str, scores: list, weak_areas: list):
        log = self._load_log()
        log.append({
            "date": datetime.now().isoformat(),
            "topic": topic,
            "avg_score": sum(scores) / len(scores) if scores else 0,
            "num_questions": len(scores),
            "scores": scores,
            "weak_areas": weak_areas,
        })
        with open(self.log_file, "w") as f:
            json.dump(log, f, indent=2)

    def show_menu(self) -> str:
        console.print(Panel("[bold cyan]Interview Training Coach[/bold cyan]\nChoose a topic:", expand=False))
        for key, (label, _) in TRAINING_TOPICS.items():
            console.print(f"  [bold]{key}[/bold]. {label}")
        console.print("  [bold]q[/bold]. Quit")
        return input("\nChoose topic: ").strip()

    def run_session(self, topic_key: str = None, job: dict = None):
        if topic_key is None:
            choice = self.show_menu()
            if choice == "q":
                return
            topic_key = choice

        if topic_key not in TRAINING_TOPICS:
            console.print("[red]Invalid topic.[/red]")
            return

        topic_name, topic_id = TRAINING_TOPICS[topic_key]
        system_prompt = SYSTEM_PROMPTS.get(topic_id, SYSTEM_PROMPTS["behavioral"])

        if job:
            system_prompt += f"\n\nThis interview is for: {job.get('title')} at {job.get('company')}. Tailor questions to this role."

        console.print(Panel(
            f"[bold green]Starting: {topic_name}[/bold green]\n"
            "Type your answers. Commands: 'quit' to end, 'skip' to skip question.",
            expand=False
        ))
        console.print("[dim]Powered by Gemini AI[/dim]\n")

        chat = GeminiChat(system=system_prompt, temperature=0.8)
        scores = []
        weak_areas = []
        question_count = 0
        max_questions = 8

        # First question
        first_q = chat.send("Start the interview. Greet me briefly and ask your first question.")
        if not first_q:
            console.print("[red]Gemini not responding. Check your GEMINI_API_KEY in .env[/red]")
            return

        console.print(Panel(Markdown(first_q), title="[bold blue]Interviewer[/bold blue]", border_style="blue"))

        while question_count < max_questions:
            user_input = input("\nYour answer (or 'skip'/'quit'): ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("quit", "q", "exit"):
                break
            if user_input.lower() == "skip":
                user_input = "I'm not confident about this one — please show me the model answer and move on."

            question_count += 1
            suffix = " This was the last question — give a final overall assessment after feedback." if question_count >= max_questions else ""
            feedback = chat.send(
                f"{user_input}\n\n[Score my answer /10, give specific feedback, provide the model answer, then ask the next question.{suffix}]",
                max_tokens=700,
            )
            if not feedback:
                console.print("[red]No response from Gemini. Check your API key / quota.[/red]")
                break

            console.print(Panel(Markdown(feedback), title="[bold yellow]Feedback & Next Question[/bold yellow]", border_style="yellow"))

            score_match = re.search(r'(\d+)\s*/\s*10', feedback)
            if score_match:
                score = int(score_match.group(1))
                scores.append(score)
                if score < 6:
                    weak_areas.append(f"Q{question_count} ({score}/10)")

        # Summary
        if scores:
            avg = sum(scores) / len(scores)
            color = "green" if avg >= 7 else "yellow" if avg >= 5 else "red"
            console.print(Panel(
                f"[bold]Session Complete![/bold]\n"
                f"Questions answered: {len(scores)}\n"
                f"Average Score: [{color}]{avg:.1f}/10[/{color}]\n"
                f"Weak areas: {', '.join(weak_areas) if weak_areas else 'None — great job!'}",
                title="Session Summary", border_style="green"
            ))
            self._save_session(topic_name, scores, weak_areas)
            console.print(f"[dim]Session saved to data/training_log.json[/dim]")
        else:
            console.print("[yellow]Session ended with no completed questions.[/yellow]")

    def show_progress(self):
        log = self._load_log()
        if not log:
            console.print("[yellow]No training sessions recorded yet. Run 'python main.py train' to start.[/yellow]")
            return
        from rich.table import Table
        t = Table(title="Training History (last 10 sessions)")
        t.add_column("Date")
        t.add_column("Topic")
        t.add_column("Avg Score", justify="right")
        t.add_column("Questions", justify="right")
        t.add_column("Weak Areas")
        for entry in log[-10:]:
            avg = entry.get("avg_score", 0)
            color = "green" if avg >= 7 else "yellow" if avg >= 5 else "red"
            t.add_row(
                entry["date"][:10],
                entry["topic"],
                f"[{color}]{avg:.1f}/10[/{color}]",
                str(entry["num_questions"]),
                ", ".join(entry.get("weak_areas", [])[:2]) or "—",
            )
        console.print(t)
