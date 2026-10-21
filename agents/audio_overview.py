"""NotebookLM-style audio overview: a two-host conversation written only
from the user's own notes. The browser speaks it (Web Speech API), so there
is no TTS service, key or audio file to store."""
import json
import re

from claude_client import ask_ai


def write_script(title: str, notes: list[str]) -> list[dict]:
    """[{"speaker": "A"|"B", "text": str}, ...] or [] if generation failed."""
    material = "\n\n".join(n for n in notes if n)[:12000]
    if not material:
        return []
    raw = ask_ai(
        f'Write a 4-6 minute two-host podcast conversation that teaches "{title}" from these study notes.\n'
        "Host A explains, host B is a curious learner who asks the questions an interview candidate would and "
        "pushes for concrete examples. Use ONLY facts in the notes; if the notes don't cover something, don't add it. "
        "Short spoken turns, no markdown, no stage directions.\n"
        'Return ONLY JSON: [{"speaker": "A", "text": "..."}, {"speaker": "B", "text": "..."}, ...]\n\n'
        f"NOTES:\n{material}",
        max_tokens=3000, temperature=0.6,
    )
    m = re.search(r"\[.*\]", raw or "", re.S)
    try:
        turns = json.loads(m.group()) if m else []
    except ValueError:
        return []
    return [{"speaker": "B" if t.get("speaker") == "B" else "A", "text": str(t["text"]).strip()}
            for t in turns if isinstance(t, dict) and str(t.get("text", "")).strip()]
